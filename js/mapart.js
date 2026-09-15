/* =========================================================================
   Connecting the Grid - the landscape
   =========================================================================

   Draws the map as a map.

   The game's data is a grid of squares, and for a long time the picture was
   too: one coloured square per cell. That has a ceiling. A wood made of
   five squares still looks like five squares, however carefully the squares
   are shaded, because the eye reads the straight lines before it reads
   anything else.

   So the picture is built from the OUTLINE of each patch of ground rather
   than from its cells. Find the boundary of a region, wobble it, round its
   corners, and five squares of woodland become one wood. The data never
   changes; only what is drawn from it.

   The accessibility contract
   --------------------------
   This whole file produces one aria-hidden decoration. It is drawn BENEATH
   the grid of real <button> elements that render.js builds, and it is never
   interactive. That is deliberate and load bearing: the keyboard route
   through the game, the label on every cell, the focus ring and the
   forced-colours fallback all belong to those buttons, and none of them
   are affected by anything here. Under forced colours this layer is simply
   hidden and the buttons draw their own borders again.

   Everything is drawn ONCE per map. Laying a piece repaints the route layer
   and nothing else, and the route lives on a second SVG laid over this
   one, so none of the filter work below is on the hot path.

   The symbols themselves - trees, houses, landmarks, the two ends of the
   line - are drawn in js/mapsymbols.js. This file decides where they go.

   Exposes one global: MapArt.
   ========================================================================= */

var MapArt = (function (CFG, Rng, MapSymbols) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* Drawing units per cell. The board is drawn at a fixed internal size and
     scaled by the viewBox, so nothing here has to know how big the map is
     on screen - which is what lets the same picture serve a phone and a
     wall display without being redrawn. */
  var U = 100;

  /* How far a boundary corner is pulled off the grid, and how hard the
     corners are rounded. Both are in drawing units. Enough to break the
     straight line, not so much that a cell stops being where the player
     thinks it is - the route has to land on these squares. */
  var WOBBLE = 15;
  var ROUND = 26;

  /* Ground that is drawn as an area of countryside. Everything else is
     either the base colour of the map or a landmark sitting on top.

     The road is not in here on purpose. It is a line, and a line drawn as a
     line looks like a road; the same road drawn as a filled area looks like
     a runway. Only the river gets both, because a river really does have a
     width worth showing. */
  var REGIONS = ['woodland', 'hilly', 'rocky', 'sssi', 'settlement', 'river', 'water'];

  // Ground that stands proud enough to cast a shadow.
  var RAISED = { woodland: true, hilly: true, rocky: true, settlement: true };

  // Single places, drawn as a mark rather than as a patch of ground.
  var LANDMARKS = {
    substation: 'mark-substation',
    customer: 'mark-customer',
    benefit: 'mark-benefit',
    grant: 'mark-grant'
  };

  /* What grows on which ground.

     'count' is the number of symbols in ONE cell, and it is the whole
     difference between a landscape and a spreadsheet. One big tree per
     square reads as an icon of a tree, because that is what it is. Four
     small ones, spilling a little over the edges of their square, read as a
     wood - and a run of squares reads as one wood rather than four.

     'symbols' is picked from at random, per copy. 'tints' is how many
     colour variants the stylesheet defines for that ground, as
     .art-tint-<ground>-0, -1, ... - see js/mapsymbols.js on currentColor.

     'density' in CONFIG then scales the count, so the tuning knob that
     already exists still means what it says. */
  var COVER = {
    woodland: { symbols: ['tree', 'tree', 'pine'], tints: 3, count: [5, 7], scale: [0.24, 0.36] },
    hilly: { symbols: ['hill'], count: [3, 4], scale: [0.36, 0.5] },
    rocky: { symbols: ['rock'], count: [4, 6], scale: [0.18, 0.28] },
    sssi: { symbols: ['reed'], count: [6, 9], scale: [0.18, 0.28] },
    settlement: { symbols: ['house'], tints: 3, count: [3, 4], scale: [0.26, 0.36] },
    water: { symbols: ['ripple'], count: [3, 4], scale: [0.36, 0.46] }
  };

  /* The open country between the regions, drawn as a patchwork of fields.

     'merge' is the chance a cell joins the field to its west (or, failing
     that, to its north) rather than starting one of its own, so fields come
     in more than one size. 'tints' and 'furrows' are how many fill colours
     and crop-row directions there are to choose from; 'hedge' is the chance
     a boundary between two fields is hedged, and 'hedgeTree' the chance a
     hedge has a tree standing in it. */
  var FIELDS = {
    merge: 0.3,
    mergeNorth: 0.16,
    tints: 4,
    furrows: [4, 94, 52],
    hedge: 0.5,
    hedgeTree: 0.28,
    round: 12
  };

  /* Ground whose meaning must not rest on its colour alone (WCAG 2.2 AA,
     1.4.1). Designated land is where the route must not go and open water is
     where it cannot, so both are hatched as well as coloured. */
  var HATCHED = { sssi: 'hatch-sssi', water: 'hatch-water' };

  /* ---------------------------------------------------------------------
     Element building
     ------------------------------------------------------------------- */

  function svg(name, attributes) {
    var node = document.createElementNS(NS, name);
    if (attributes) {
      Object.keys(attributes).forEach(function (key) {
        node.setAttribute(key, attributes[key]);
      });
    }
    return node;
  }

  function append(parent, name, attributes) {
    var node = svg(name, attributes);
    parent.appendChild(node);
    return node;
  }

  // Two decimal places is plenty at this scale, and keeps the markup small.
  function n(value) { return Math.round(value * 100) / 100; }

  /* ---------------------------------------------------------------------
     Tracing a region's boundary
     ---------------------------------------------------------------------
     The terrain is cell aligned, so the classic marching-squares trick of
     interpolating a contour is the wrong tool - there is nothing to
     interpolate and it would blur the boundary the game is played on. The
     exact answer is simpler.

     Give every cell in the region its four edges, walked the same way round.
     An edge between two cells of the region then appears twice, in opposite
     directions, and cancels. What survives is precisely the boundary, and
     because every surviving edge kept its direction, they chain head to tail
     into closed loops without any further work.

     Holes fall out of this for nothing: a lake inside a wood traces its own
     loop, wound the other way, and fill-rule="evenodd" punches it out.
     ------------------------------------------------------------------- */

  function traceRegion(cols, rows, inRegion) {
    var edges = Object.create(null);

    function edge(ax, ay, bx, by) {
      var back = bx + ',' + by + '>' + ax + ',' + ay;
      if (edges[back]) { delete edges[back]; return; }
      edges[ax + ',' + ay + '>' + bx + ',' + by] = [ax, ay, bx, by];
    }

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        if (!inRegion(col, row)) { continue; }
        edge(col, row, col + 1, row);
        edge(col + 1, row, col + 1, row + 1);
        edge(col + 1, row + 1, col, row + 1);
        edge(col, row + 1, col, row);
      }
    }

    // Where each surviving edge starts, so a walk can find its next step.
    var leaving = Object.create(null);
    Object.keys(edges).forEach(function (key) {
      var e = edges[key];
      var at = e[0] + ',' + e[1];
      (leaving[at] || (leaving[at] = [])).push(e);
    });

    var loops = [];
    Object.keys(edges).forEach(function (key) {
      if (!edges[key]) { return; }

      var start = edges[key];
      var loop = [[start[0], start[1]]];
      var current = start;

      while (current) {
        delete edges[current[0] + ',' + current[1] + '>' + current[2] + ',' + current[3]];
        loop.push([current[2], current[3]]);
        if (current[2] === start[0] && current[3] === start[1]) { break; }
        current = stepOn(edges, leaving, current);
      }

      // The walk closes the loop, so the repeated first point is redundant.
      loop.pop();
      if (loop.length > 2) { loops.push(loop); }
    });

    return loops;
  }

  /* Which edge the walk takes next.

     Usually there is only one. The exception is a diagonal pinch, where two
     cells of the region touch at a single corner and four boundary edges
     meet there. Turning as tightly as possible keeps the two halves as
     separate lobes joined at a waist, which is what a pinch looks like on
     the ground - the alternative reads as a crossing, which nothing on this
     map ever is. Any fixed rule would produce a valid outline; this one
     produces the honest picture. */
  function stepOn(edges, leaving, current) {
    var options = leaving[current[2] + ',' + current[3]] || [];
    var live = options.filter(function (e) {
      return edges[e[0] + ',' + e[1] + '>' + e[2] + ',' + e[3]];
    });
    if (!live.length) { return null; }
    if (live.length === 1) { return live[0]; }

    var dx = current[2] - current[0];
    var dy = current[3] - current[1];
    var wanted = [[-dy, dx], [dx, dy], [dy, -dx]];   // right, straight, left

    for (var i = 0; i < wanted.length; i++) {
      for (var k = 0; k < live.length; k++) {
        if (live[k][2] - live[k][0] === wanted[i][0] &&
            live[k][3] - live[k][1] === wanted[i][1]) { return live[k]; }
      }
    }
    return live[0];
  }

  /* ---------------------------------------------------------------------
     Making an outline look drawn rather than plotted
     ------------------------------------------------------------------- */

  /* Pushes each corner off the lattice.

     Keyed on the corner's own coordinates, never on its position in the
     loop, so a corner shared by a wood and a hill is moved by the same
     amount in both and no daylight opens up between them. Corners on the
     edge of the map only move along it, so the map stays a rectangle. */
  function wobble(loop, salt, cols, rows) {
    return loop.map(function (point) {
      return corner(point[0], point[1], salt, cols, rows);
    });
  }

  // One lattice corner, moved. Shared by region outlines, fields and hedges.
  function corner(x, y, salt, cols, rows) {
    var ox = (Rng.hash2(x, y, salt) - 0.5) * 2 * WOBBLE;
    var oy = (Rng.hash2(x, y, salt + 1013) - 0.5) * 2 * WOBBLE;
    if (x === 0 || x === cols) { ox = 0; }
    if (y === 0 || y === rows) { oy = 0; }
    return [x * U + ox, y * U + oy];
  }

  /* Rounds every corner of a closed loop.

     At each corner, stop short of it along the way in, curve through it
     with the corner itself as the control point, and carry on along the way
     out. The radius is capped at half of the shorter of the two sides so a
     short side can never be overrun by the curves at both of its ends. */
  function roundedLoop(points, radius) {
    var count = points.length;
    if (count < 3) { return ''; }

    var parts = [];
    for (var i = 0; i < count; i++) {
      var previous = points[(i - 1 + count) % count];
      var here = points[i];
      var next = points[(i + 1) % count];

      var inX = here[0] - previous[0];
      var inY = here[1] - previous[1];
      var outX = next[0] - here[0];
      var outY = next[1] - here[1];
      var inLength = Math.sqrt(inX * inX + inY * inY) || 1;
      var outLength = Math.sqrt(outX * outX + outY * outY) || 1;

      var r = Math.min(radius, inLength / 2, outLength / 2);
      var from = [here[0] - inX / inLength * r, here[1] - inY / inLength * r];
      var to = [here[0] + outX / outLength * r, here[1] + outY / outLength * r];

      parts.push((i === 0 ? 'M' : 'L') + n(from[0]) + ' ' + n(from[1]));
      parts.push('Q' + n(here[0]) + ' ' + n(here[1]) + ' ' + n(to[0]) + ' ' + n(to[1]));
    }
    parts.push('Z');
    return parts.join(' ');
  }

  /* A smooth line through a chain of points.

     Catmull-Rom, converted to the cubic Béziers that SVG actually speaks:
     the curve is made to pass THROUGH every point, taking its direction at
     each one from the points either side. That is what a river wants -
     every point is a place the water really goes - where a Bézier fitted by
     eye would only pass near them. */
  function throughPoints(points) {
    if (points.length < 2) { return ''; }
    var d = 'M' + n(points[0][0]) + ' ' + n(points[0][1]);

    for (var i = 0; i < points.length - 1; i++) {
      var before = points[i - 1] || points[i];
      var from = points[i];
      var to = points[i + 1];
      var after = points[i + 2] || points[i + 1];

      var c1 = [from[0] + (to[0] - before[0]) / 6, from[1] + (to[1] - before[1]) / 6];
      var c2 = [to[0] - (after[0] - from[0]) / 6, to[1] - (after[1] - from[1]) / 6];

      d += ' C' + n(c1[0]) + ' ' + n(c1[1]) +
           ' ' + n(c2[0]) + ' ' + n(c2[1]) +
           ' ' + n(to[0]) + ' ' + n(to[1]);
    }
    return d;
  }

  /* ---------------------------------------------------------------------
     Fields and hedges
     ---------------------------------------------------------------------
     Open country used to be the bare paper, and a wide stretch of it read
     as an empty rectangle rather than as farmland. It is now split into
     fields, each a slightly different crop, some of them ploughed in rows,
     with hedges along some of the boundaries.

     The fields are built out of whole cells, so every hedge runs along a
     line of the game's own grid. That is on purpose: the hedges quietly
     show the player the squares they are playing on, where a pattern that
     ignored the grid would fight it.
     ------------------------------------------------------------------- */

  /* Which cells belong to which field. Walked in reading order, so a cell's
     west and north neighbours are already decided when it is reached. */
  function planFields(cols, rows, isOpen, salt) {
    var plan = [];
    var fields = [];

    for (var row = 0; row < rows; row++) {
      plan.push([]);
      for (var col = 0; col < cols; col++) {
        if (!isOpen(col, row)) { plan[row].push(null); continue; }

        var west = col > 0 ? plan[row][col - 1] : null;
        var north = row > 0 ? plan[row - 1][col] : null;
        var roll = Rng.hash2(col, row, salt + 401);

        if (west && roll < FIELDS.merge) { plan[row].push(west); continue; }
        if (north && roll > 1 - FIELDS.mergeNorth) { plan[row].push(north); continue; }

        var field = {
          id: fields.length,
          tint: Math.floor(Rng.hash2(col, row, salt + 409) * FIELDS.tints),
          // About half the fields are left as grass, with no rows in it.
          furrow: Math.floor(Rng.hash2(col, row, salt + 419) * FIELDS.furrows.length * 2) -
                  FIELDS.furrows.length
        };
        fields.push(field);
        plan[row].push(field);
      }
    }

    return { plan: plan, fields: fields };
  }

  function drawFields(parent, cols, rows, layout, salt) {
    var group = append(parent, 'g', { class: 'art-fields' });

    layout.fields.forEach(function (field) {
      var loops = traceRegion(cols, rows, function (col, row) {
        return layout.plan[row][col] === field;
      });
      if (!loops.length) { return; }

      var d = loops.map(function (loop) {
        return roundedLoop(wobble(loop, salt, cols, rows), FIELDS.round);
      }).join(' ');

      append(group, 'path', { class: 'art-field art-field-' + field.tint, d: d, 'fill-rule': 'evenodd' });
      if (field.furrow >= 0) {
        append(group, 'path', {
          class: 'art-furrows', d: d, 'fill-rule': 'evenodd',
          fill: 'url(#art-furrow-' + field.furrow + ')'
        });
      }
    });
  }

  /* A hedge along some of the boundaries between two different fields.
     Stopped short at both ends, so four hedges meeting at a corner leave a
     gateway rather than a perfect cross. Returns where trees stand in them,
     so they can be planted with everything else and overlap in order. */
  function drawHedges(parent, cols, rows, layout, salt) {
    var group = append(parent, 'g', { class: 'art-hedges' });
    var trees = [];
    var d = '';

    function hedge(ax, ay, bx, by) {
      var a = corner(ax, ay, salt, cols, rows);
      var b = corner(bx, by, salt, cols, rows);
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var trim = 9 / length;
      var bow = (Rng.hash2(ax + bx, ay + by, salt + 431) - 0.5) * 12;

      var from = [a[0] + dx * trim, a[1] + dy * trim];
      var to = [b[0] - dx * trim, b[1] - dy * trim];
      var bend = [(a[0] + b[0]) / 2 - dy / length * bow, (a[1] + b[1]) / 2 + dx / length * bow];

      d += 'M' + n(from[0]) + ' ' + n(from[1]) +
           'Q' + n(bend[0]) + ' ' + n(bend[1]) + ' ' + n(to[0]) + ' ' + n(to[1]);

      if (Rng.hash2(ax + bx, ay + by, salt + 433) < FIELDS.hedgeTree) {
        var along = 0.3 + Rng.hash2(ax + bx, ay + by, salt + 439) * 0.4;
        trees.push([a[0] + dx * along, a[1] + dy * along]);
      }
    }

    function between(here, there) {
      return here && there && here !== there;
    }

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var here = layout.plan[row][col];
        // Keyed on the edge itself, so the two cells either side agree.
        if (col + 1 < cols && between(here, layout.plan[row][col + 1]) &&
            Rng.hash2(col * 2 + 1, row * 2, salt + 421) < FIELDS.hedge) {
          hedge(col + 1, row, col + 1, row + 1);
        }
        if (row + 1 < rows && between(here, layout.plan[row + 1][col]) &&
            Rng.hash2(col * 2, row * 2 + 1, salt + 421) < FIELDS.hedge) {
          hedge(col, row + 1, col + 1, row + 1);
        }
      }
    }

    if (d) {
      append(group, 'path', { class: 'art-hedge', d: d, fill: 'none' });
      append(group, 'path', { class: 'art-hedge-bush', d: d, fill: 'none' });
    }
    return trees;
  }

  /* ---------------------------------------------------------------------
     Filters
     ---------------------------------------------------------------------
     Two, both cheap because both run once. The wobble above gives the big
     irregularities, at the scale of a whole field boundary; this gives the
     small ones, at the scale of a pencil line. It takes both to stop an
     outline looking computed.
     ------------------------------------------------------------------- */

  function defineFilters(defs, seed) {
    var rough = append(defs, 'filter', {
      id: 'art-rough', x: '-8%', y: '-8%', width: '116%', height: '116%',
      filterUnits: 'objectBoundingBox'
    });
    append(rough, 'feTurbulence', {
      type: 'fractalNoise', baseFrequency: '0.014', numOctaves: '3',
      seed: String(seed % 1000), result: 'grain'
    });
    append(rough, 'feDisplacementMap', {
      in: 'SourceGraphic', in2: 'grain', scale: '13',
      xChannelSelector: 'R', yChannelSelector: 'G'
    });

    var paper = append(defs, 'filter', { id: 'art-paper', x: '0', y: '0', width: '100%', height: '100%' });
    append(paper, 'feTurbulence', {
      type: 'fractalNoise', baseFrequency: '0.7', numOctaves: '4',
      seed: String((seed + 77) % 1000), result: 'fibres'
    });
    append(paper, 'feColorMatrix', { type: 'saturate', values: '0' });

    var mottle = append(defs, 'filter', { id: 'art-mottle', x: '0', y: '0', width: '100%', height: '100%' });
    append(mottle, 'feTurbulence', {
      type: 'fractalNoise', baseFrequency: '0.0036', numOctaves: '2',
      seed: String((seed + 311) % 1000)
    });
    append(mottle, 'feColorMatrix', { type: 'saturate', values: '0' });

    /* Hatching for the two kinds of ground whose meaning must not rest on
       colour alone: where the route must not go, and where it cannot. */
    var sssi = append(defs, 'pattern', {
      id: 'hatch-sssi', width: 16, height: 16,
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    });
    append(sssi, 'line', { x1: 0, y1: 0, x2: 0, y2: 16, class: 'art-hatch-sssi' });

    var water = append(defs, 'pattern', {
      id: 'hatch-water', width: 14, height: 14,
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)'
    });
    append(water, 'line', { x1: 0, y1: 0, x2: 0, y2: 14, class: 'art-hatch-water' });

    // Crop rows, one pattern per direction a field can be ploughed in.
    FIELDS.furrows.forEach(function (angle, index) {
      var rows = append(defs, 'pattern', {
        id: 'art-furrow-' + index, width: 12, height: 12,
        patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(' + angle + ')'
      });
      append(rows, 'line', { x1: 6, y1: 0, x2: 6, y2: 12, class: 'art-furrow' });
    });

    /* The edges of the sheet, a shade darker than the middle, the way a
       printed map is. It pulls the eye in towards the play. */
    var vignette = append(defs, 'radialGradient', { id: 'art-vignette', cx: '50%', cy: '50%', r: '72%' });
    append(vignette, 'stop', { offset: '55%', class: 'art-vignette-in' });
    append(vignette, 'stop', { offset: '100%', class: 'art-vignette-out' });
  }

  /* ---------------------------------------------------------------------
     Putting the map together
     ------------------------------------------------------------------- */

  function draw(rows, features, seed) {
    var cols = CFG.grid.cols;
    var rowCount = CFG.grid.rows;
    var salt = Rng.seedFrom(String(seed) + ':art');

    var grid = rows.map(function (line) {
      return line.split('').map(function (letter) { return CFG.legend[letter]; });
    });

    function typeAt(col, row) { return grid[row][col]; }

    function sheet(className) {
      return svg('svg', {
        class: className,
        viewBox: '0 0 ' + (cols * U) + ' ' + (rowCount * U),
        preserveAspectRatio: 'none',
        'aria-hidden': 'true',
        focusable: 'false'
      });
    }

    /* Two sheets, one exactly over the other. The lower carries everything
       that never changes once the map is built, filters and all. The upper
       carries what moves: the route, redrawn on every span, and the turning
       wind turbines. The stylesheet gives the lower sheet a compositing
       layer of its own, so nothing that happens on the upper one ever makes
       the browser run the filters again. */
    var root = sheet('art');
    var overlay = sheet('art art-overlay');

    var defs = append(root, 'defs');
    MapSymbols.define(defs);
    defineFilters(defs, salt);

    function sheetRect(className, filter) {
      var attributes = { class: className, x: 0, y: 0, width: cols * U, height: rowCount * U };
      if (filter) { attributes.filter = 'url(#' + filter + ')'; }
      return attributes;
    }

    // --- 1. paper -------------------------------------------------------
    append(root, 'rect', sheetRect('art-base'));

    /* --- 2. terrain ------------------------------------------------------
       One group, one pass of the roughening filter over all of it: the
       fields, then the paper texture laid over them, then the shadows of
       raised ground, then the ground itself. The texture sits under the
       regions rather than over the whole map so woods and water keep their
       own colour. */
    var land = append(root, 'g', { class: 'art-land', filter: 'url(#art-rough)' });

    var fieldLayout = planFields(cols, rowCount, function (col, row) {
      return REGIONS.indexOf(typeAt(col, row)) < 0;
    }, salt);
    drawFields(land, cols, rowCount, fieldLayout, salt);
    var hedgeTrees = drawHedges(land, cols, rowCount, fieldLayout, salt);

    append(land, 'rect', sheetRect('art-mottle', 'art-mottle'));
    append(land, 'rect', sheetRect('art-grain', 'art-paper'));

    var relief = append(land, 'g', { class: 'art-relief' });

    REGIONS.forEach(function (typeId) {
      var loops = traceRegion(cols, rowCount, function (col, row) {
        return typeAt(col, row) === typeId;
      });
      if (!loops.length) { return; }

      var d = loops.map(function (loop) {
        return roundedLoop(wobble(loop, salt, cols, rowCount), ROUND);
      }).join(' ');

      /* Raised ground gets a shadow to the south east. It is the one thing
         that makes a hill read as standing up rather than lying flat. */
      if (RAISED[typeId]) {
        append(relief, 'path', {
          class: 'art-shade', d: d, 'fill-rule': 'evenodd',
          transform: 'translate(6 9)'
        });
      }

      /* The fill is named here but still valued in the stylesheet, so the
         colour stays a brand token and a new kind of ground needs no new
         CSS rule - only a token, and only if the farmland fallback is not
         wanted. Set as an inline style rather than a fill attribute:
         presentation attributes do not accept var(). */
      append(land, 'path', {
        class: 'art-region art-' + typeId,
        style: 'fill: var(--brand-land-' + typeId + ', var(--brand-land-farmland))',
        d: d,
        'fill-rule': 'evenodd'
      });

      if (HATCHED[typeId]) {
        append(land, 'path', {
          class: 'art-hatch', d: d, 'fill-rule': 'evenodd',
          fill: 'url(#' + HATCHED[typeId] + ')'
        });
      }
    });

    // --- 3. the river and the road, as lines rather than as cells -------
    var ways = append(root, 'g', { class: 'art-ways' });

    function centreLine(chain, extend) {
      if (!chain || chain.length < 2) { return null; }
      var points = chain.map(function (cell) {
        return [(cell[0] + 0.5) * U, (cell[1] + 0.5) * U];
      });
      if (extend) {
        points.unshift([points[0][0], 0]);
        points.push([points[points.length - 1][0], rowCount * U]);
      }
      return throughPoints(points);
    }

    /* The river: a deeper channel down the middle of its bed, and broken
       glints either side of it for the light on moving water. An earlier
       drawing ran one unbroken pale line down the centre, which read as a
       pipe rather than as a river. */
    var riverLine = centreLine(features && features.river, true);
    if (riverLine) {
      append(ways, 'path', { class: 'art-river-deep', d: riverLine, fill: 'none' });
      append(ways, 'path', { class: 'art-river-core', d: riverLine, fill: 'none' });
      append(ways, 'path', { class: 'art-river-glint', d: riverLine, fill: 'none', transform: 'translate(-9 0)' });
      append(ways, 'path', { class: 'art-river-glint art-river-glint-2', d: riverLine, fill: 'none', transform: 'translate(9 0)' });
    }

    var roadLine = centreLine(features && features.road, true);
    if (roadLine) {
      append(ways, 'path', { class: 'art-road-case', d: roadLine, fill: 'none' });
      append(ways, 'path', { class: 'art-road-top', d: roadLine, fill: 'none' });
      append(ways, 'path', { class: 'art-road-dash', d: roadLine, fill: 'none' });
    }

    /* --- 4. what grows on the ground ------------------------------------
       Gathered first and planted afterwards, in order of how far down the
       map they sit, so anything nearer the bottom is drawn over anything
       behind it. Without that a tree can be sliced in half by the one
       standing behind it, and the wood goes flat. */
    var cover = append(root, 'g', { class: 'art-cover' });
    var planted = [];

    for (var row = 0; row < rowCount; row++) {
      for (var col = 0; col < cols; col++) {
        var typeId = typeAt(col, row);
        var plan = COVER[typeId];
        if (!plan) { continue; }

        var type = CFG.cellTypes[typeId];
        var density = typeof type.density === 'number' ? type.density : 0.6;
        var spread = plan.count[0] +
          Rng.hash2(col, row, salt + 17) * (plan.count[1] - plan.count[0]);
        var many = Math.max(1, Math.round(spread * density));

        for (var k = 0; k < many; k++) {
          var pick = salt + 31 + k * 101;
          var size = U * (plan.scale[0] +
            Rng.hash2(col, row, pick) * (plan.scale[1] - plan.scale[0]));

          // Allowed a little way over the edge of the square, so a run of
          // them reads as one wood rather than as four squares of trees.
          var x = (col + 0.5) * U + (Rng.hash2(col, row, pick + 7) - 0.5) * U * 0.92;
          var y = (row + 0.5) * U + (Rng.hash2(col, row, pick + 13) - 0.5) * U * 0.86;

          var which = plan.symbols[Math.floor(Rng.hash2(col, row, pick + 19) * plan.symbols.length)];
          var tint = plan.tints
            ? 'art-tint-' + typeId + '-' + Math.floor(Rng.hash2(col, row, pick + 23) * plan.tints)
            : '';

          planted.push({ x: x, y: y, size: size, symbol: which, tint: tint });
        }
      }
    }

    // The odd tree standing in a hedge, small, in one of the wood's greens.
    hedgeTrees.forEach(function (at, index) {
      var size = U * (0.2 + Rng.hash2(index, 3, salt + 443) * 0.08);
      planted.push({
        x: at[0], y: at[1] - size * 0.3, size: size, symbol: 'tree',
        tint: 'art-tint-woodland-' + Math.floor(Rng.hash2(index, 5, salt + 443) * 3)
      });
    });

    planted.sort(function (a, b) { return a.y - b.y; });
    planted.forEach(function (item) {
      var attributes = {
        href: '#' + item.symbol,
        x: n(item.x - item.size / 2), y: n(item.y - item.size / 2),
        width: n(item.size), height: n(item.size)
      };
      if (item.tint) { attributes.class = item.tint; }
      append(cover, 'use', attributes);
    });

    // --- 5. landmarks ---------------------------------------------------
    var marks = append(root, 'g', { class: 'art-marks' });

    for (row = 0; row < rowCount; row++) {
      for (col = 0; col < cols; col++) {
        var markId = LANDMARKS[typeAt(col, row)];
        if (!markId) { continue; }
        var span = U * 0.78;
        append(marks, 'use', {
          href: '#' + markId,
          x: n((col + 0.5) * U - span / 2), y: n((row + 0.5) * U - span / 2),
          width: n(span), height: n(span)
        });
      }
    }

    // --- 6. the field lines ---------------------------------------------
    var lines = append(root, 'g', { class: 'art-grid' });
    for (col = 1; col < cols; col++) {
      append(lines, 'line', { x1: col * U, y1: 0, x2: col * U, y2: rowCount * U });
    }
    for (row = 1; row < rowCount; row++) {
      append(lines, 'line', { x1: 0, y1: row * U, x2: cols * U, y2: row * U });
    }

    // The fill goes on as an attribute: a url() written in the stylesheet
    // would be looked for relative to css/, not to this page.
    append(root, 'rect', sheetRect('art-vignette')).setAttribute('fill', 'url(#art-vignette)');

    /* --- 7. the two ends, on the upper sheet ----------------------------
       Up here because the turbines turn; see the note on the two sheets. */
    var ends = append(overlay, 'g', { class: 'art-ends' });
    MapSymbols.drawGenerationSite(ends, CFG.start.col * U, CFG.start.row * U);
    MapSymbols.drawDemandCentre(ends, CFG.end.col * U, CFG.end.row * U);

    /* --- 8. the route --------------------------------------------------
       Both left empty. js/routeart.js draws everything in them and repaints
       them as the game goes; nothing else in this file is touched again.

       The ghost comes first so it sits UNDER the player's own line: it is
       shown after the game is over, and the route the player actually built
       is still the one that should read first. */
    var ghost = append(overlay, 'g', { class: 'art-ghost' });
    var route = append(overlay, 'g', { class: 'art-route' });

    return { svg: root, overlay: overlay, route: route, ghost: ghost };
  }

  return {
    draw: draw,
    units: U,
    // Shared with render.js so the route is drawn in the same coordinates.
    centreOf: function (col, row) { return [(col + 0.5) * U, (row + 0.5) * U]; },
    throughPoints: throughPoints,
    traceRegion: traceRegion
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js'),
  typeof Rng !== 'undefined' ? Rng : require('./rng.js'),
  // Only needed to draw, which needs a document; under Node there is neither.
  typeof MapSymbols !== 'undefined' ? MapSymbols : null));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapArt;
}
