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
   and nothing else, so none of the filter work below is on the hot path.

   Exposes one global: MapArt.
   ========================================================================= */

var MapArt = (function (CFG, Rng) {
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
  var LANDMARKS = { substation: 'mark-substation', customer: 'mark-customer', benefit: 'mark-benefit' };

  /* What grows on which ground.

     'count' is the number of symbols in ONE cell, and it is the whole
     difference between a landscape and a spreadsheet. One big tree per
     square reads as an icon of a tree, because that is what it is. Four
     small ones, spilling a little over the edges of their square, read as a
     wood - and a run of squares reads as one wood rather than four.

     'density' in CONFIG then scales the count, so the tuning knob that
     already exists still means what it says. */
  var COVER = {
    woodland: { symbol: 'tree', count: [5, 7], scale: [0.22, 0.34] },
    hilly: { symbol: 'hill', count: [3, 4], scale: [0.30, 0.44] },
    rocky: { symbol: 'rock', count: [5, 7], scale: [0.15, 0.26] },
    sssi: { symbol: 'reed', count: [6, 9], scale: [0.18, 0.28] },
    settlement: { symbol: 'house', count: [3, 4], scale: [0.22, 0.32] }
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
      var x = point[0];
      var y = point[1];
      var ox = (Rng.hash2(x, y, salt) - 0.5) * 2 * WOBBLE;
      var oy = (Rng.hash2(x, y, salt + 1013) - 0.5) * 2 * WOBBLE;
      if (x === 0 || x === cols) { ox = 0; }
      if (y === 0 || y === rows) { oy = 0; }
      return [x * U + ox, y * U + oy];
    });
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
     The symbols scattered over the ground
     ---------------------------------------------------------------------
     Drawn here as shapes rather than reused from img/, because these are
     map furniture and those are interface icons. An icon is a flat outline
     that has to read at 24 pixels in a legend; a tree on a map wants a
     filled canopy that can be turned, resized and tinted to sit in its
     wood. The legend still uses img/, so the two never need to match.
     ------------------------------------------------------------------- */

  function defineSymbols(defs) {
    function symbol(id, viewBox) {
      return append(defs, 'symbol', { id: id, viewBox: viewBox, overflow: 'visible' });
    }

    var tree = symbol('tree', '0 0 100 100');
    append(tree, 'path', { d: 'M46 96h8V64h-8z', class: 'art-trunk' });
    append(tree, 'path', {
      d: 'M50 6c14 0 25 11 25 25 0 4-1 8-3 11 8 4 13 12 13 21 0 13-11 24-25 24H40' +
         'c-14 0-25-11-25-24 0-9 5-17 13-21-2-3-3-7-3-11 0-14 11-25 25-25z',
      class: 'art-canopy'
    });

    var hill = symbol('hill', '0 0 100 100');
    append(hill, 'path', { d: 'M4 84c14 0 20-34 34-34s16 22 26 22 12-14 22-14v26z', class: 'art-hill-back' });
    append(hill, 'path', { d: 'M2 86c16 0 24-40 40-40s22 40 40 40z', class: 'art-hill' });
    append(hill, 'path', { d: 'M30 62c5-8 9-12 12-12s7 4 12 12c-8-4-16-4-24 0z', class: 'art-hill-cap' });

    var rock = symbol('rock', '0 0 100 100');
    append(rock, 'path', { d: 'M16 82 32 34l22-8 26 22 6 34z', class: 'art-rock' });
    append(rock, 'path', { d: 'M32 34l22-8 8 30-30 4z', class: 'art-rock-face' });

    var reed = symbol('reed', '0 0 100 100');
    append(reed, 'path', {
      d: 'M30 94V44M50 96V30M70 94V48',
      class: 'art-stem', fill: 'none'
    });
    append(reed, 'path', {
      d: 'M30 50c-8-4-9-14-4-19 6 2 9 12 4 19zM50 34c-9-5-10-16-4-22 7 3 10 15 4 22z' +
         'M70 54c8-4 9-14 4-19-6 2-9 12-4 19z',
      class: 'art-frond'
    });

    var house = symbol('house', '0 0 100 100');
    append(house, 'path', { d: 'M20 92V52h60v40z', class: 'art-wall' });
    append(house, 'path', { d: 'M12 54 50 22l38 32z', class: 'art-roof' });
    append(house, 'path', { d: 'M42 92V70h16v22z', class: 'art-door' });

    /* Landmarks, each on a pale disc so it reads as a place rather than as
       ground. The three shapes are deliberately nothing like each other -
       a building with masts, a factory roofline, a leaf. An earlier set had
       the substation and the connection customer both drawn as a house with
       something inside it, and at the size these appear on screen they were
       impossible to tell apart. */
    function landmark(id, ring) {
      var mark = symbol(id, '0 0 100 100');
      append(mark, 'circle', { cx: 50, cy: 50, r: 38, class: 'art-disc art-disc-' + ring });
      return mark;
    }

    // A switching compound: a low building with two masts standing over it.
    var substation = landmark('mark-substation', 'substation');
    append(substation, 'path', { d: 'M26 82V56h48v26z', class: 'art-mark' });
    append(substation, 'path', {
      d: 'M31 56V28h5v28zM64 56V28h5v28zM24 34h19v4H24zM57 34h19v4H57z',
      class: 'art-mark'
    });
    append(substation, 'path', { d: 'M54 58 40 78h9l-4 13 15-21h-9z', class: 'art-mark-hot' });

    // A site waiting for a connection: a works, with a sawtooth roof.
    var customer = landmark('mark-customer', 'customer');
    append(customer, 'path', {
      d: 'M22 82V56l12-10v10l12-10v10l12-10v10l12-10v36z', class: 'art-mark'
    });
    append(customer, 'path', { d: 'M64 40h8V20h-8z', class: 'art-mark' });
    append(customer, 'circle', { cx: 68, cy: 16, r: 6, class: 'art-mark-hot' });

    // Land offered by the community: a leaf.
    var benefit = landmark('mark-benefit', 'benefit');
    append(benefit, 'path', {
      d: 'M24 80C22 50 44 26 78 22c4 32-16 56-46 58z', class: 'art-mark'
    });
    append(benefit, 'path', {
      d: 'M28 78C44 62 58 44 72 28', class: 'art-mark-vein', fill: 'none'
    });
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

    var root = svg('svg', {
      class: 'art',
      viewBox: '0 0 ' + (cols * U) + ' ' + (rowCount * U),
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false'
    });

    var defs = append(root, 'defs');
    defineSymbols(defs);
    defineFilters(defs, salt);

    // --- 1. paper -------------------------------------------------------
    append(root, 'rect', { class: 'art-base', x: 0, y: 0, width: cols * U, height: rowCount * U });
    append(root, 'rect', {
      class: 'art-mottle', x: 0, y: 0, width: cols * U, height: rowCount * U,
      filter: 'url(#art-mottle)'
    });
    append(root, 'rect', {
      class: 'art-grain', x: 0, y: 0, width: cols * U, height: rowCount * U,
      filter: 'url(#art-paper)'
    });

    // --- 2. terrain, with its relief underneath -------------------------
    var relief = append(root, 'g', { class: 'art-relief' });
    var land = append(root, 'g', { class: 'art-land', filter: 'url(#art-rough)' });

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

      append(land, 'path', { class: 'art-region art-' + typeId, d: d, 'fill-rule': 'evenodd' });

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

    var riverLine = centreLine(features && features.river, true);
    if (riverLine) {
      append(ways, 'path', { class: 'art-river-deep', d: riverLine, fill: 'none' });
      append(ways, 'path', { class: 'art-river-glint', d: riverLine, fill: 'none' });
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

          planted.push({
            y: y,
            symbol: plan.symbol,
            x: n(x - size / 2), top: n(y - size / 2), size: n(size)
          });
        }
      }
    }

    planted.sort(function (a, b) { return a.y - b.y; });
    planted.forEach(function (item) {
      append(cover, 'use', {
        href: '#' + item.symbol,
        x: item.x, y: item.top, width: item.size, height: item.size
      });
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

    /* --- 7. the route --------------------------------------------------
       Left empty. render.js owns everything in here and repaints it on
       every move; nothing else in this file is touched again. */
    var route = append(root, 'g', { class: 'art-route' });

    return { svg: root, route: route };
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
  typeof Rng !== 'undefined' ? Rng : require('./rng.js')));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapArt;
}
