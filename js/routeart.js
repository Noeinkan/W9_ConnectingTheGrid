/* =========================================================================
   Connecting the Grid - the route, drawn
   =========================================================================

   Draws the player's line, and the best route found, into the two empty
   groups js/mapart.js leaves for them.

   Split out of render.js because it is drawing rather than page wiring,
   and because it is the one part of the picture that is redrawn on every
   move. It holds no state and decides no rules: it is handed the route
   and paints it.

   The line is drawn in layers, back to front:

     on the ground    a shadow under every span carried in the air, a
                      trench under every span that is buried
     the casing       a pale edge, so the line reads on dark woodland and
                      pale fields alike
     the body         the technology's colour, dashed where it is buried
     the towers       one at every cell the line is carried above ground
     the current      moving dashes, once the line is energised

   The shadow and the trench are the whole of the depth cue. A line in the
   air throws a shadow and a buried one does not, so the difference between
   the technologies shows in the ground, not only in a colour.

   Exposes one global: RouteArt.
   ========================================================================= */

var RouteArt = (function (CFG, MapArt) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var U = MapArt.units;
  var STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  /* Where the sun is: every shadow on the map falls this way. Matches the
     relief under raised ground in mapart.js. */
  var SHADOW = 'translate(8 11)';

  /* The two tower shapes, standing on (0, 0) and rising up the page. Drawn
     as strokes rather than fills, because a lattice tower is a lattice -
     a filled silhouette of one reads as a traffic cone. */
  var TOWERS = {
    lattice:
      'M-10 0 L-3 -46 M10 0 L3 -46' +                         // legs
      'M-10 0 L7.4 -17 M10 0 L-7.4 -17' +                     // lower bracing
      'M-7.4 -17 L5 -33 M7.4 -17 L-5 -33' +                   // upper bracing
      'M-17 -31 H17 M-13 -41 H13' +                           // cross-arms
      'M-3 -46 L0 -53 L3 -46' +                               // earth-wire peak
      'M-17 -31 v6 M17 -31 v6 M-13 -41 v6 M13 -41 v6',       // insulators
    tpylon:
      'M0 0 V-42 M-16 -42 H16 M0 -42 v-7' +                   // pole and T
      'M-13 -42 l-3 7 3 5 3 -5z M13 -42 l-3 7 3 5 3 -5z'      // diamond insulators
  };

  /* A tower's shadow, laid flat on the ground: the top of the tower lands
     down and to the right of its foot, in the same direction as SHADOW. */
  var LAY_FLAT = 'matrix(1 0 -0.5 -0.3 0 0)';
  var TOWER_SCALE = 0.8;

  function node(name, attributes) {
    var el = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      el.setAttribute(key, attributes[key]);
    });
    return el;
  }

  function add(parent, name, attributes) {
    return parent.appendChild(node(name, attributes));
  }

  function round(value) { return Math.round(value * 100) / 100; }

  function centreOf(col, row) { return [(col + 0.5) * U, (row + 0.5) * U]; }

  // The middle of one edge of a cell - where the line crosses into the next.
  function edgeOf(col, row, side) {
    var step = STEP[side];
    return [(col + 0.5 + step[0] / 2) * U, (row + 0.5 + step[1] / 2) * U];
  }

  // Which way does `to` lie from `from`? Always orthogonal neighbours.
  function sideBetween(from, to) {
    if (to.row < from.row) { return 'n'; }
    if (to.row > from.row) { return 's'; }
    if (to.col > from.col) { return 'e'; }
    return 'w';
  }

  // A polyline with its corners eased off, which is how a transmission line
  // turns: straight between towers, with the angle taken at one of them.
  function roundedPath(points, radius) {
    if (points.length < 2) { return ''; }
    var d = 'M' + round(points[0][0]) + ' ' + round(points[0][1]);

    for (var i = 1; i < points.length - 1; i++) {
      var before = points[i - 1];
      var here = points[i];
      var after = points[i + 1];

      var inX = here[0] - before[0];
      var inY = here[1] - before[1];
      var outX = after[0] - here[0];
      var outY = after[1] - here[1];
      var inLength = Math.sqrt(inX * inX + inY * inY) || 1;
      var outLength = Math.sqrt(outX * outX + outY * outY) || 1;
      var r = Math.min(radius, inLength / 2, outLength / 2);

      d += ' L' + round(here[0] - inX / inLength * r) + ' ' + round(here[1] - inY / inLength * r);
      d += ' Q' + round(here[0]) + ' ' + round(here[1]) +
           ' ' + round(here[0] + outX / outLength * r) +
           ' ' + round(here[1] + outY / outLength * r);
    }

    var last = points[points.length - 1];
    return d + ' L' + round(last[0]) + ' ' + round(last[1]);
  }

  /* Splits the route into runs of one technology, and works out where the
     line enters the first cell of each run and leaves the last. */
  function runsOf(route, openEnd) {
    var runs = [];

    route.forEach(function (segment, index) {
      var previous = route[index - 1];
      var next = route[index + 1];

      var into = previous ? sideBetween(segment, previous) : CFG.start.entry;
      var outOf = next ? sideBetween(segment, next) : openEnd;

      var run = runs[runs.length - 1];
      if (!run || run.techId !== segment.techId) {
        run = { techId: segment.techId, cells: [], into: into };
        runs.push(run);
      }
      run.cells.push(segment);
      run.outOf = outOf;
    });

    return runs.map(function (each) {
      return { techId: each.techId, d: roundedPath(pointsFor(each), U * 0.24) };
    });
  }

  function pointsFor(run) {
    var first = run.cells[0];
    var last = run.cells[run.cells.length - 1];
    var points = [edgeOf(first.col, first.row, run.into)];
    run.cells.forEach(function (segment) {
      points.push(centreOf(segment.col, segment.row));
    });
    if (run.outOf) { points.push(edgeOf(last.col, last.row, run.outOf)); }
    return points;
  }

  // Buried cable carries no towers and throws no shadow.
  function isOverhead(techId) { return techId !== 'cable'; }

  /* Where a tower's foot stands: a little below the middle of its cell, so
     the line crosses it part way up rather than running along its base. */
  function footOf(segment) {
    var at = centreOf(segment.col, segment.row);
    return 'translate(' + round(at[0]) + ' ' + round(at[1] + U * 0.14) + ') scale(' + TOWER_SCALE + ')';
  }

  function paint(layer, state) {
    if (!layer) { return; }
    layer.innerHTML = '';

    // Energised: the current runs along the line. See .is-energised in CSS.
    var energised = state.phase === 'complete';
    layer.setAttribute('class', 'art-route' + (energised ? ' is-energised' : ''));
    if (!state.route.length) { return; }

    var runs = runsOf(state.route, state.openEnd);
    var aloft = state.route.filter(function (segment) { return isOverhead(segment.techId); });

    /* On the ground first. Every layer below is a separate pass over all the
       runs, so the casing of a later run can never be painted over the body
       of an earlier one wherever the technology changes. */
    var ground = add(layer, 'g', { class: 'run-ground' });
    runs.forEach(function (run) {
      add(ground, 'path', isOverhead(run.techId)
        ? { class: 'run-shadow', d: run.d, transform: SHADOW }
        : { class: 'run-trench', d: run.d });
    });
    aloft.forEach(function (segment) {
      add(ground, 'path', {
        class: 'tower-shadow tower-shadow-' + segment.techId,
        d: TOWERS[segment.techId] || TOWERS.lattice,
        transform: footOf(segment) + ' ' + LAY_FLAT
      });
    });

    runs.forEach(function (run) {
      add(layer, 'path', { class: 'run-case', d: run.d });
    });
    runs.forEach(function (run) {
      add(layer, 'path', { class: 'run-body run-' + run.techId, d: run.d });
    });

    // Two strokes per tower: a pale edge, then the frame in the line's colour.
    aloft.forEach(function (segment) {
      var tower = add(layer, 'g', {
        class: 'art-tower art-tower-' + segment.techId,
        transform: footOf(segment)
      });
      var d = TOWERS[segment.techId] || TOWERS.lattice;
      add(tower, 'path', { class: 'tower-edge', d: d });
      add(tower, 'path', { class: 'tower-frame', d: d });
    });

    /* Energised, the current runs instead of the working end being marked:
       there is no working end any more, and the ring would sit on top of the
       demand centre's picture. */
    if (energised) {
      runs.forEach(function (run) {
        add(layer, 'path', { class: 'run-flow', d: run.d });
      });
      return;
    }

    var head = state.route[state.route.length - 1];
    var at = centreOf(head.col, head.row);
    add(layer, 'circle', {
      class: 'art-head', cx: round(at[0]), cy: round(at[1]), r: U * 0.28
    });
    add(layer, 'circle', {
      class: 'art-head-dot run-dot-' + head.techId, cx: round(at[0]), cy: round(at[1]), r: U * 0.09
    });
  }

  /* The best route the balance search found, drawn over the map once the
     game is finished.

     Built from exactly the same run-splitting and path-rounding as the
     player's own line, so the two are directly comparable - a difference on
     screen is a real difference in the route, not a difference in how it
     was drawn. It leaves through the demand centre because every route the
     search reports does. */
  function paintGhost(layer, route) {
    if (!layer) { return; }
    layer.innerHTML = '';
    if (!route || !route.length) { return; }

    /* Two passes, for the same reason the real route has them: the casing
       of one run must not be painted over the body of another. Here it also
       keeps the line readable over dark woodland as well as pale fields. */
    var runs = runsOf(route, CFG.end.exit);
    runs.forEach(function (run) {
      add(layer, 'path', { class: 'ghost-case', d: run.d });
    });
    runs.forEach(function (run) {
      add(layer, 'path', { class: 'ghost-run', d: run.d });
    });
  }

  return {
    paint: paint,
    paintGhost: paintGhost
  };

}(CONFIG, MapArt));
