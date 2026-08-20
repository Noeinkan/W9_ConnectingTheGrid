/* =========================================================================
   Connecting the Grid - rendering
   =========================================================================

   Everything that writes to the page lives here, and nothing else does.

   This file holds no game state and decides no rules. It is handed a state
   object by game.js and paints it. If you find yourself wanting to work out
   whether a move is legal in this file, it belongs in game.js instead.

   The map is drawn in three layers, all exactly the same size and stacked
   on top of each other:

     the landscape   one decorative SVG, built by js/mapart.js
     the board       a grid of real <button> elements, transparent
     the arrows      where the line can go next, over the target square

   The route is drawn into the SVG, over the landscape, but it is owned here
   rather than by mapart.js: the landscape is built once per map and the
   route is rebuilt on every move.

   Exposes one global: Render.
   ========================================================================= */

var Render = (function (CFG, Score, MapArt) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var U = MapArt.units;

  var els = {};        // cached page elements
  var cells = [];      // cell buttons, indexed [row][col]
  var techTiles = {};  // technology buttons, by technology id
  var meterParts = {}; // meter marker/label elements, by dial id
  var routeLayer = null;
  var handle = null;    // the callbacks game.js hands over in buildBoard

  var STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  /* ---------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */

  // Fills {placeholders} in a CONFIG string from an object of values.
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  // Screen readers say "minus 8", not "hyphen 8".
  function spoken(number) {
    return number < 0 ? 'minus ' + Math.abs(number) : String(number);
  }

  function svgNode(name, attributes) {
    var node = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    return node;
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

  /* ---------------------------------------------------------------------
     The map: built once, whenever a new landscape is generated
     ------------------------------------------------------------------- */

  function buildMap(rows, features, seed) {
    var drawn = MapArt.draw(rows, features, seed);
    routeLayer = drawn.route;
    els.art.innerHTML = '';
    els.art.appendChild(drawn.svg);

    /* The board's shape is read by the map frame, the button grid, the
       arrows and the tooltip, so it is set once here, on the box they all
       live in, and inherited from there. */
    els.boardWrap.style.setProperty('--cols', CFG.grid.cols);
    els.boardWrap.style.setProperty('--rows', CFG.grid.rows);
  }

  /* ---------------------------------------------------------------------
     The board: built once, and then only repainted
     ------------------------------------------------------------------- */

  /* The little "Generation site" / "Demand centre" pins. Hidden from screen
     readers, because the cell's own label already says the same thing. */
  function addFlag(button, text, row) {
    var flag = document.createElement('span');
    flag.className = 'cell-flag';
    flag.setAttribute('aria-hidden', 'true');
    flag.textContent = text;
    // On the top row there is nothing above to hang it from.
    if (row === 0) { flag.setAttribute('data-below', ''); }
    button.appendChild(flag);
  }

  function buildBoard(container, handlers) {
    var copy = CFG.copy;

    container.setAttribute('role', 'grid');
    container.setAttribute('aria-label',
      fill(copy.boardLabel, { cols: CFG.grid.cols, rows: CFG.grid.rows }));
    container.innerHTML = '';

    cells = [];
    for (var row = 0; row < CFG.grid.rows; row++) {
      var rowEl = document.createElement('div');
      rowEl.className = 'board-row';
      rowEl.setAttribute('role', 'row');

      var rowCells = [];
      for (var col = 0; col < CFG.grid.cols; col++) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'cell';
        button.setAttribute('role', 'gridcell');
        button.dataset.col = col;
        button.dataset.row = row;
        // Roving tabindex: exactly one cell is in the tab order at a time.
        button.tabIndex = -1;

        button.addEventListener('click', function (event) {
          var el = event.currentTarget;
          handlers.onActivate(Number(el.dataset.col), Number(el.dataset.row));
        });
        button.addEventListener('focus', function (event) {
          var el = event.currentTarget;
          var c = Number(el.dataset.col);
          var r = Number(el.dataset.row);
          handlers.onFocus(c, r);
          showTip(c, r);
        });
        button.addEventListener('blur', hideTip);
        button.addEventListener('mouseenter', function (event) {
          var el = event.currentTarget;
          showTip(Number(el.dataset.col), Number(el.dataset.row));
        });

        if (col === CFG.start.col && row === CFG.start.row) {
          addFlag(button, copy.startLabel, row);
        }
        if (col === CFG.end.col && row === CFG.end.row) {
          addFlag(button, copy.endLabel, row);
        }

        rowEl.appendChild(button);
        rowCells.push(button);
      }
      cells.push(rowCells);
      container.appendChild(rowEl);
    }

    handle = handlers;
    container.addEventListener('mouseleave', hideTip);
    wireDragging(container, handlers);
    els.board = container;
  }

  /* Drawing the route by dragging.

     Which cell the pointer is over is worked out from the board's own
     rectangle rather than by asking what is under the pointer. It is both
     cheaper and more reliable: during a drag the arrows and the tooltip are
     in the way, and hit testing would keep finding them instead.

     Nothing is rejected out loud in here. A drag wanders over plenty of
     squares the line cannot go to, and an error message for each of them
     would fire the live region dozens of times for one gesture. */
  function wireDragging(container, handlers) {
    var drawing = false;
    var last = null;

    function cellAt(event) {
      var box = container.getBoundingClientRect();
      if (!box.width || !box.height) { return null; }
      var col = Math.floor((event.clientX - box.left) / (box.width / CFG.grid.cols));
      var row = Math.floor((event.clientY - box.top) / (box.height / CFG.grid.rows));
      if (col < 0 || col >= CFG.grid.cols || row < 0 || row >= CFG.grid.rows) { return null; }
      return { col: col, row: row };
    }

    container.addEventListener('pointerdown', function (event) {
      var at = cellAt(event);
      if (!at || !handlers.canStartDrag(at.col, at.row)) { return; }
      drawing = true;
      last = at;
      container.setPointerCapture(event.pointerId);
    });

    container.addEventListener('pointermove', function (event) {
      if (!drawing) { return; }
      var at = cellAt(event);
      if (!at || (last && at.col === last.col && at.row === last.row)) { return; }
      last = at;
      handlers.onDragOver(at.col, at.row);
    });

    function stop(event) {
      if (!drawing) { return; }
      drawing = false;
      last = null;
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
    }

    container.addEventListener('pointerup', stop);
    container.addEventListener('pointercancel', stop);
    container.addEventListener('lostpointercapture', function () { drawing = false; last = null; });
  }

  function paintBoard(state) {
    var copy = CFG.copy;

    // Index the route so each cell can be looked up in one pass.
    var routeAt = {};
    state.route.forEach(function (segment, index) {
      routeAt[segment.col + ',' + segment.row] = { segment: segment, index: index };
    });

    var target = state.target;

    for (var row = 0; row < CFG.grid.rows; row++) {
      for (var col = 0; col < CFG.grid.cols; col++) {
        var button = cells[row][col];
        var typeId = Score.typeIdAt(col, row);
        var type = CFG.cellTypes[typeId];
        var here = routeAt[col + ',' + row];
        var isStart = (col === CFG.start.col && row === CFG.start.row);
        var isEnd = (col === CFG.end.col && row === CFG.end.row);
        var isTarget = !!target && target.col === col && target.row === row;
        var isHead = !!here && here.index === state.route.length - 1;

        // --- classes ---
        var classes = ['cell'];
        if (here) { classes.push('is-route'); }
        if (isHead) { classes.push('is-head'); }
        if (isTarget) { classes.push('is-target'); }
        button.className = classes.join(' ');

        // --- accessible name ---
        var parts = [fill(copy.cellPosition, { col: col + 1, row: row + 1 })];
        if (isStart) { parts.push(copy.cellIsStart); }
        if (isEnd) { parts.push(copy.cellIsEnd); }
        parts.push(fill(copy.cellTerrain, {
          terrain: type.label,
          cost: type.cost,
          env: spoken(type.envImpact),
          comm: spoken(type.commImpact)
        }));
        if (here) {
          parts.push(fill(copy.cellRouted, {
            n: here.index + 1,
            piece: Score.piece(here.segment.pieceId).label,
            tech: Score.technology(here.segment.techId).label
          }));
          if (isHead) { parts.push(copy.cellIsHead); }
        } else if (isTarget) {
          parts.push(copy.cellAvailable);
          if (state.exits) {
            var ways = state.exits.filter(function (exit) { return exit.ok; })
              .map(function (exit) { return CFG.copy.sides[exit.dir]; });
            if (ways.length) {
              parts.push(fill(copy.cellExits, { sides: ways.join(', ') }));
            }
          }
        }
        button.setAttribute('aria-label', parts.join(' '));

        // Every cell stays focusable so the map can be read right through,
        // but only the target square is actually actionable.
        button.setAttribute('aria-disabled', isTarget ? 'false' : 'true');
      }
    }
  }

  // Roving tabindex - only the cursor cell is in the tab order.
  function setCursor(col, row, moveFocus) {
    for (var r = 0; r < cells.length; r++) {
      for (var c = 0; c < cells[r].length; c++) {
        cells[r][c].tabIndex = -1;
      }
    }
    var target = cells[row] && cells[row][col];
    if (!target) { return; }
    target.tabIndex = 0;
    if (moveFocus) { target.focus(); }
  }

  /* ---------------------------------------------------------------------
     The arrows
     ---------------------------------------------------------------------
     One per way out of the target square, drawn on the boundary between it
     and the square the line would go to. Ways that are not open are shown
     greyed rather than left out: knowing there is no way north is worth as
     much as knowing there is a way east, and three arrows that come and go
     are harder to aim at than three that stay put.

     Deliberately aria-hidden and out of the tab order - see the note in
     css/style.css.
     ------------------------------------------------------------------- */

  var ARROW = 'M50 14 88 66H62v22H38V66H12z';   // pointing north; rotated below
  var TURN = { n: 0, e: 90, s: 180, w: 270 };

  function paintChevrons(state) {
    var box = els.chevrons;
    box.innerHTML = '';
    if (!state.target || !state.exits || !state.exits.length) { return; }

    state.exits.forEach(function (exit) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'chevron' + (exit.ok ? '' : ' is-dead');
      button.tabIndex = -1;
      button.setAttribute('aria-hidden', 'true');
      button.title = exit.ok
        ? fill(CFG.copy.chevronLabel, { side: CFG.copy.sides[exit.dir] })
        : CFG.copy.chevronDeadLabel;

      var step = STEP[exit.dir];
      button.style.setProperty('--cx', state.target.col + 0.5 + step[0] * 0.36);
      button.style.setProperty('--cy', state.target.row + 0.5 + step[1] * 0.36);
      button.style.setProperty('--rot', TURN[exit.dir] + 'deg');

      var art = svgNode('svg', { viewBox: '0 0 100 100', focusable: 'false' });
      art.appendChild(svgNode('path', { d: ARROW }));
      button.appendChild(art);

      if (exit.ok) {
        button.addEventListener('click', function () {
          handle.onStep(exit.to.col, exit.to.row);
        });
      }
      box.appendChild(button);
    });
  }

  /* ---------------------------------------------------------------------
     The route
     ---------------------------------------------------------------------
     Grouped into runs of cells sharing one technology, and drawn as one
     path per run rather than one bar per cell. A corner then comes out as a
     corner instead of as two rectangles overlapping, which is what the old
     drawing needed a white glow to hide.
     ------------------------------------------------------------------- */

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
  function runsOf(state) {
    var route = state.route;
    var runs = [];

    route.forEach(function (segment, index) {
      var previous = route[index - 1];
      var next = route[index + 1];

      var into = previous ? sideBetween(segment, previous) : CFG.start.entry;
      var outOf = next ? sideBetween(segment, next) : state.openEnd;

      var run = runs[runs.length - 1];
      if (!run || run.techId !== segment.techId) {
        run = { techId: segment.techId, cells: [], into: into };
        runs.push(run);
      }
      run.cells.push(segment);
      run.outOf = outOf;
    });

    return runs;
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

  // A tower, drawn at the centre of a cell the line is carried above.
  function tower(techId, col, row) {
    var at = centreOf(col, row);
    var d = techId === 'tpylon'
      ? 'M-3-12h6v24h-6zM-13-12h26v6h-26z'          // a T
      : 'M-4-13h8l6 26h-8l-2-8h-8l-2 8h-8z';        // a lattice tower
    return svgNode('path', {
      class: 'art-tower art-tower-' + techId,
      d: d,
      transform: 'translate(' + round(at[0]) + ' ' + round(at[1]) + ') scale(0.8)'
    });
  }

  function paintRoute(state) {
    if (!routeLayer) { return; }
    routeLayer.innerHTML = '';
    if (!state.route.length) { return; }

    var runs = runsOf(state);
    var paths = runs.map(function (run) {
      return { run: run, d: roundedPath(pointsFor(run), U * 0.24) };
    });

    /* Two passes. One would let the casing of a later run be painted over
       the body of an earlier one wherever the technology changes. */
    paths.forEach(function (piece) {
      routeLayer.appendChild(svgNode('path', { class: 'run-case', d: piece.d }));
    });
    paths.forEach(function (piece) {
      routeLayer.appendChild(svgNode('path', {
        class: 'run-body run-' + piece.run.techId, d: piece.d
      }));
    });

    // Buried cable carries no towers, because there is nothing to see.
    state.route.forEach(function (segment) {
      if (segment.techId === 'cable') { return; }
      routeLayer.appendChild(tower(segment.techId, segment.col, segment.row));
    });

    var head = state.route[state.route.length - 1];
    var at = centreOf(head.col, head.row);
    routeLayer.appendChild(svgNode('circle', {
      class: 'art-head', cx: round(at[0]), cy: round(at[1]), r: U * 0.28
    }));
  }

  /* ---------------------------------------------------------------------
     The land tooltip
     ------------------------------------------------------------------- */

  function showTip(col, row) {
    var typeId = Score.typeIdAt(col, row);
    if (!typeId || !els.tip) { return; }
    var type = CFG.cellTypes[typeId];

    els.tip.innerHTML = '';
    var name = document.createElement('strong');
    name.textContent = type.label;
    var description = document.createTextNode(type.description);
    var nums = document.createElement('span');
    nums.className = 'tip-nums';
    nums.textContent = type.passable
      ? type.cost + ' / ' + type.envImpact + ' / ' + type.commImpact
      : CFG.copy.tipImpassable;

    els.tip.appendChild(name);
    els.tip.appendChild(description);
    els.tip.appendChild(nums);

    els.tip.style.setProperty('--cx', col + 0.5);
    els.tip.style.setProperty('--cy', row + (row <= 1 ? 1 : 0));
    if (row <= 1) { els.tip.setAttribute('data-below', ''); }
    else { els.tip.removeAttribute('data-below'); }
    els.tip.hidden = false;
  }

  function hideTip() { if (els.tip) { els.tip.hidden = true; } }

  /* ---------------------------------------------------------------------
     The rail
     ------------------------------------------------------------------- */

  function buildTechPicker(container, onTechChosen) {
    container.innerHTML = '';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', CFG.copy.techHeading);
    techTiles = {};

    CFG.technologies.forEach(function (tech, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tech tech-' + tech.id;
      button.dataset.tech = tech.id;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', tech.label + '. ' + tech.summary + '. ' + tech.description);
      button.title = tech.description;

      var swatch = document.createElement('span');
      swatch.className = 'tech-swatch';
      swatch.setAttribute('aria-hidden', 'true');

      var name = document.createElement('span');
      name.className = 'tech-name';
      name.textContent = tech.short;

      // The number key that also picks it, so the shortcut is discoverable.
      var key = document.createElement('span');
      key.className = 'tech-key';
      key.setAttribute('aria-hidden', 'true');
      key.textContent = String(index + 1);

      button.appendChild(swatch);
      button.appendChild(name);
      button.appendChild(key);
      button.addEventListener('click', function () { onTechChosen(tech.id); });

      container.appendChild(button);
      techTiles[tech.id] = button;
    });
  }

  function buildMeters(container) {
    container.innerHTML = '';
    meterParts = {};

    CFG.dials.forEach(function (dial) {
      var row = document.createElement('div');
      row.className = 'meter';

      var label = document.createElement('span');
      label.className = 'meter-label';
      label.textContent = dial.label;

      var value = document.createElement('span');
      value.className = 'meter-value';
      value.setAttribute('aria-hidden', 'true');

      /* The bar runs poor on the left to good on the right, matching the
         0-100 dials. The bands are painted in CSS; this element only carries
         the value, so the marker and the accessible reading cannot drift. */
      var bar = document.createElement('div');
      bar.className = 'meter-bar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-label', dial.label + '. ' + dial.goodDirection);

      var marker = document.createElement('span');
      marker.className = 'meter-marker';
      marker.setAttribute('aria-hidden', 'true');
      bar.appendChild(marker);

      row.appendChild(label);
      row.appendChild(value);
      row.appendChild(bar);
      container.appendChild(row);

      meterParts[dial.id] = { bar: bar, marker: marker, value: value, dial: dial };
    });
  }

  function paintMeters(state) {
    if (!state.score) { return; }
    var dials = state.score.dials;

    Object.keys(meterParts).forEach(function (id) {
      var part = meterParts[id];
      var value = dials[id];
      var band = Score.bandFor(value);

      part.marker.style.left = value + '%';
      part.value.textContent = value;
      part.bar.setAttribute('aria-valuenow', String(value));
      part.bar.setAttribute('aria-valuetext', fill(CFG.copy.meterReading, {
        label: part.dial.label,
        value: value,
        band: band
      }));
      // Lets the marker be styled by band without recomputing the band in CSS.
      part.bar.dataset.band = band.replace(/\s+/g, '-');
    });
  }

  function buildLegend(container) {
    container.innerHTML = '';
    Object.keys(CFG.cellTypes).forEach(function (typeId) {
      var type = CFG.cellTypes[typeId];
      var item = document.createElement('li');

      var swatch = document.createElement('span');
      swatch.className = 'swatch t-' + typeId;
      swatch.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className = 'swatch-label';
      label.textContent = type.label;

      var nums = document.createElement('span');
      nums.className = 'swatch-nums';
      nums.textContent = type.passable
        ? type.cost + ' / ' + type.envImpact + ' / ' + type.commImpact
        : '—';
      nums.setAttribute('aria-label', type.passable
        ? 'cost ' + type.cost +
          ', environment ' + spoken(type.envImpact) +
          ', community ' + spoken(type.commImpact)
        : 'cannot be crossed');

      item.appendChild(swatch);
      item.appendChild(label);
      item.appendChild(nums);
      container.appendChild(item);
    });
  }

  function paintTech(state) {
    Object.keys(techTiles).forEach(function (techId) {
      var button = techTiles[techId];
      var chosen = state.currentTech === techId;
      button.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      button.classList.toggle('is-chosen', chosen);
    });
  }

  /* ---------------------------------------------------------------------
     Status, controls, dialogs
     ------------------------------------------------------------------- */

  function paintStatus(state) {
    if (!els.status) { return; }
    els.status.textContent = state.message;
    els.status.dataset.tone = state.tone || 'info';
  }

  function paintControls(state) {
    if (els.undo) {
      els.undo.disabled = !state.canUndo;
      els.undo.hidden = !CFG.rules.allowUndo;
    }
    if (els.reset) { els.reset.disabled = !state.canReset; }
  }

  function paintSeed(seed) {
    if (els.seedValue) { els.seedValue.textContent = seed; }
  }

  function openDialog(dialog) {
    if (!dialog) { return; }
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) { dialog.showModal(); }
    } else {
      // <dialog> is well supported, but a plain attribute keeps the content
      // reachable if showModal is ever missing.
      dialog.setAttribute('open', '');
    }
  }

  function buildInstructions(container) {
    if (!container) { return; }
    container.innerHTML = '';
    CFG.copy.instructions.forEach(function (line) {
      var p = document.createElement('p');
      p.textContent = line;
      container.appendChild(p);
    });
  }

  // Shown once, when the connection is energised.
  var verdictShown = false;

  function paintVerdict(state) {
    if (!els.verdictDialog) { return; }
    if (state.phase !== 'complete') {
      verdictShown = false;
      return;
    }
    if (verdictShown) { return; }
    verdictShown = true;

    var verdict = CFG.verdicts[Score.verdictKeyFor(state.score.dials)];
    if (els.verdictTitle) { els.verdictTitle.textContent = verdict.title; }
    if (els.verdictBody) { els.verdictBody.textContent = verdict.body; }
    openDialog(els.verdictDialog);
  }

  /* ---------------------------------------------------------------------
     Wiring up
     ------------------------------------------------------------------- */

  function cacheElements(map) {
    Object.keys(map).forEach(function (name) {
      els[name] = document.getElementById(map[name]);
    });
  }

  function setText(el, text) { if (el) { el.textContent = text; } }

  function paintStaticCopy() {
    var copy = CFG.copy;
    document.title = copy.title;
    setText(els.title, copy.title);
    setText(els.techHeading, copy.techHeading);
    setText(els.techHint, copy.techHint);
    setText(els.dialsHeading, copy.dialsHeading);
    setText(els.legendHeading, copy.legendHeading);
    setText(els.undo, copy.undo);
    setText(els.reset, copy.reset);
    setText(els.newMap, copy.newMapButton);
    setText(els.instructionsTab, copy.tabInstructions);
    setText(els.instructionsHeading, copy.instructionsHeading);
    setText(els.verdictHeading, copy.verdictHeading);
    setText(els.seedLabel, copy.seedLabel);
    setText(els.instructionsLead, copy.strapline);
    setText(els.instructionsClose, copy.closeButton);
    setText(els.verdictClose, copy.closeButton);
  }

  function paint(state) {
    paintBoard(state);
    paintChevrons(state);
    paintRoute(state);
    paintTech(state);
    paintMeters(state);
    paintStatus(state);
    paintControls(state);
    paintVerdict(state);
  }

  return {
    cacheElements: cacheElements,
    paintStaticCopy: paintStaticCopy,
    buildMap: buildMap,
    buildBoard: buildBoard,
    buildTechPicker: buildTechPicker,
    buildMeters: buildMeters,
    buildLegend: buildLegend,
    buildInstructions: buildInstructions,
    openDialog: openDialog,
    setCursor: setCursor,
    paintSeed: paintSeed,
    hideTip: hideTip,
    paint: paint,
    elements: els
  };

}(CONFIG, Score, MapArt));
