/* =========================================================================
   Connecting the Grid - rendering
   =========================================================================

   Everything that writes to the page lives here, and nothing else does.

   This file holds no game state and decides no rules. It is handed a state
   object by game.js and paints it. If you find yourself wanting to work out
   whether a move is legal in this file, it belongs in game.js instead.

   The map is drawn in three layers, all exactly the same size and stacked
   on top of each other:

     the landscape   two decorative SVGs, built by js/mapart.js
     the board       a grid of real <button> elements, transparent
     the arrows      where the line can go next, over the target square

   The route is drawn into the upper of the two SVGs, over the landscape,
   by js/routeart.js: the landscape is built once per map and the route is
   rebuilt on every move.

   Exposes one global: Render.
   ========================================================================= */

var Render = (function (CFG, Score, MapArt, RouteArt) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var els = {};        // cached page elements
  var cells = [];      // cell buttons, indexed [row][col]
  var techTiles = {};  // technology buttons, by technology id
  var meterParts = {}; // meter marker/label elements, by dial id
  var routeLayer = null;
  var ghostLayer = null;   // the best route found, drawn under the player's
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

  /* ---------------------------------------------------------------------
     The map: built once, whenever a new landscape is generated
     ------------------------------------------------------------------- */

  function buildMap(rows, features, seed) {
    var drawn = MapArt.draw(rows, features, seed);
    routeLayer = drawn.route;
    ghostLayer = drawn.ghost;
    els.art.innerHTML = '';
    els.art.appendChild(drawn.svg);
    els.art.appendChild(drawn.overlay);

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
  function addFlag(button, text, row, marker) {
    var flag = document.createElement('span');
    flag.className = 'cell-flag';
    flag.setAttribute('aria-hidden', 'true');

    // The badge from CONFIG.markers, if one is set for this end.
    if (marker && marker.icon) {
      var badge = document.createElement('span');
      badge.className = 'cell-flag-icon';
      badge.style.backgroundImage = 'url("' + marker.icon + '")';
      flag.appendChild(badge);
    }

    flag.appendChild(document.createTextNode(text));
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
          addFlag(button, copy.startLabel, row, CFG.markers && CFG.markers.start);
        }
        if (col === CFG.end.col && row === CFG.end.row) {
          addFlag(button, copy.endLabel, row, CFG.markers && CFG.markers.end);
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
      // Lets js/guidance.js find the arrow for a direction without counting.
      button.dataset.dir = exit.dir;
      button.tabIndex = -1;
      button.setAttribute('aria-hidden', 'true');
      var aheadId = Score.typeIdAt(exit.to.col, exit.to.row);
      button.title = exit.ok
        ? fill(CFG.copy.chevronLabel, {
            side: CFG.copy.sides[exit.dir],
            terrain: aheadId ? CFG.cellTypes[aheadId].label.toLowerCase() : 'open ground'
          })
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
     Drawn by js/routeart.js into the two groups the landscape leaves empty
     for it. Kept as two thin calls here so game.js still has one object to
     talk to.
     ------------------------------------------------------------------- */

  function paintRoute(state) { RouteArt.paint(routeLayer, state); }

  function paintGhostRoute(route) { RouteArt.paintGhost(ghostLayer, route); }

  function clearGhostRoute() { paintGhostRoute(null); }

  /* ---------------------------------------------------------------------
     The land tooltip
     ------------------------------------------------------------------- */

  /* The square the next span goes on, if the game has told us where that
     is. Kept here so showTip can say what building it would do - the ghost
     marker on the meters is invisible to a screen reader, and this is the
     same reading in words. */
  var preview = null;
  var previewAt = null;

  function setPreview(state) {
    preview = state.preview || null;
    previewAt = state.target ? { col: state.target.col, row: state.target.row } : null;
  }

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

    // Only on the square actually in play, where it is a live reading
    // rather than a hypothetical about a square the line cannot reach.
    if (preview && previewAt && previewAt.col === col && previewAt.row === row) {
      var ahead = document.createElement('span');
      ahead.className = 'tip-preview';
      ahead.textContent = fill(CFG.copy.tipPreview, {
        tech: Score.technology(preview.techId).short,
        cost: preview.dials.cost,
        env: preview.dials.env,
        comm: preview.dials.comm
      });
      els.tip.appendChild(ahead);
    }

    els.tip.style.setProperty('--cx', col + 0.5);
    els.tip.style.setProperty('--cy', row + (row <= 1 ? 1 : 0));
    if (row <= 1) { els.tip.setAttribute('data-below', ''); }
    else { els.tip.removeAttribute('data-below'); }

    /* Anything else worth saying about the square is added by whoever
       registered for it - js/guidance.js - into this same box, last, so it
       can also move the box if it has made it taller. */
    if (tipDecorator) { tipDecorator(els.tip, col, row); }
    els.tip.hidden = false;
  }

  var tipDecorator = null;
  function decorateTip(fn) { tipDecorator = fn; }

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

      /* Two markers. The solid one is where the dials stand; the ghost is
         where they would stand if the highlighted square were built on the
         technology currently chosen. Both are hidden from screen readers -
         the bar's own aria-valuetext carries the reading, and the preview
         is spoken through the tooltip instead. */
      var preview = document.createElement('span');
      preview.className = 'meter-preview';
      preview.setAttribute('aria-hidden', 'true');
      preview.hidden = true;
      bar.appendChild(preview);

      var marker = document.createElement('span');
      marker.className = 'meter-marker';
      marker.setAttribute('aria-hidden', 'true');
      bar.appendChild(marker);

      row.appendChild(label);
      row.appendChild(value);
      row.appendChild(bar);

      /* A dial that names a budget also says how much of it has gone. The
         dial says how well the route is doing; this says what it has spent,
         which is the figure a person actually argues about. */
      var spend = null;
      if (dial.budget && dial.spend) {
        spend = document.createElement('span');
        spend.className = 'meter-spend';
        spend.setAttribute('aria-hidden', 'true');
        row.appendChild(spend);
      }

      container.appendChild(row);

      meterParts[dial.id] = {
        bar: bar, marker: marker, preview: preview,
        value: value, spend: spend, dial: dial
      };
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

      /* The ghost. Hidden when there is nothing to preview, and when the
         span would not move this dial at all - a marker sitting exactly
         under the solid one says nothing and only adds clutter. */
      if (part.spend) {
        part.spend.textContent = fill(CFG.copy.meterSpend, {
          spent: state.score.totals[part.dial.spend],
          budget: CFG.budgets[part.dial.budget]
        });
      }

      var ahead = state.preview ? state.preview.dials[id] : null;
      var shows = ahead !== null && ahead !== value;
      part.preview.hidden = !shows;
      if (shows) {
        part.preview.style.left = ahead + '%';
        part.preview.dataset.way = ahead < value ? 'worse' : 'better';
      }
    });
  }

  function buildLegend(container) {
    container.innerHTML = '';
    Object.keys(CFG.cellTypes).forEach(function (typeId) {
      var type = CFG.cellTypes[typeId];
      var item = document.createElement('li');

      /* The swatch is dressed from here rather than from a per-type CSS
         rule, which is what lets a new kind of ground be added in config.js
         alone: the icon comes straight off the type, and the colour falls
         back to farmland if nobody has defined a token for it yet.

         The icon is set as background-image and NOT through a custom
         property, which matters more than it looks. A url() carried in a
         custom property is resolved against the stylesheet that used the
         var(), not against the page - so 'img/x.svg' would be looked for in
         css/img/, and quietly fail. Set here it is resolved against the
         page, which is where CONFIG's paths are written from. */
      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.setProperty('--land',
        'var(--brand-land-' + typeId + ', var(--brand-land-farmland))');
      if (type.icon) {
        swatch.style.backgroundImage = 'url("' + type.icon + '")';
      }

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

  /* The weekly label falls back to the ordinary one, so a config.js that
     has not yet got the weekly copy still reads sensibly. */
  function paintSeed(seed, daily, weekly) {
    if (els.seedValue) { els.seedValue.textContent = seed; }
    if (els.seedLabel) {
      els.seedLabel.textContent = weekly
        ? (CFG.copy.seedWeeklyLabel || CFG.copy.seedLabel)
        : daily
          ? CFG.copy.seedDailyLabel
          : CFG.copy.seedLabel;
    }
  }

  /* ---------------------------------------------------------------------
     The result, as something you can paste
     ---------------------------------------------------------------------
     Plain text and nothing else. No image to generate, no service to post
     it to, and no network call - which is the only kind of sharing that
     works on a page opened straight off a disk.

     The bars are block characters rather than a picture for the same
     reason: they survive being pasted anywhere, including places that strip
     everything else.
     ------------------------------------------------------------------- */

  var SHARE_WIDTH = 12;

  function shareBar(value) {
    var filled = Math.round((value / 100) * SHARE_WIDTH);
    var bar = '';
    for (var i = 0; i < SHARE_WIDTH; i++) {
      bar += i < filled ? '█' : '░';
    }
    return bar;
  }

  /* Shows the result as selectable text, for when the clipboard refuses.
     Called with null to put it away again. */
  function showShareFallback(text) {
    if (!els.verdictShareBox) { return; }
    els.verdictShareBox.hidden = !text;
    if (!text) { return; }

    els.verdictShareText.value = text;
    els.verdictShareText.focus();
    els.verdictShareText.select();
  }

  function shareText(state) {
    var widest = 0;
    CFG.dials.forEach(function (dial) {
      if (dial.label.length > widest) { widest = dial.label.length; }
    });

    // The week is a string like '2026-W38'; weekly wins over daily.
    var heading = state.weekly && CFG.copy.shareWeekly
      ? fill(CFG.copy.shareWeekly, { week: state.weekly })
      : fill(state.daily ? CFG.copy.shareDaily : CFG.copy.shareTitle,
             { seed: state.seed, date: state.daily });
    var lines = [heading];

    CFG.dials.forEach(function (dial) {
      var value = state.score.dials[dial.id];
      var label = dial.label;
      while (label.length < widest) { label += ' '; }
      lines.push(label + '  ' + shareBar(value) + '  ' + value);
    });

    if (state.par && state.par.allRound) {
      lines.push(fill(CFG.copy.sharePar, { par: state.par.allRound.weakest }));
    }

    return lines.join('\n');
  }

  /* How hard this landscape is, in a word, from the same search that
     decided it was worth showing at all. Hidden rather than blanked when
     there is no reading, so the line does not leave a gap. */
  function paintDifficulty(par) {
    if (!els.difficulty) { return; }

    var weakest = par && par.allRound ? par.allRound.weakest : null;
    els.difficulty.hidden = weakest === null;
    if (weakest === null) { return; }

    els.difficulty.textContent = bandIn(CFG.difficulty, weakest, 'word');
    els.difficulty.title = bandIn(CFG.difficulty, weakest, 'hint');
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

  function closeDialog(dialog) {
    if (!dialog) { return; }
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
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

  // The line the first band in 'list' whose 'min' the value reaches carries.
  function bandIn(list, value, field) {
    for (var i = 0; i < list.length; i++) {
      if (value >= list[i].min) { return list[i][field]; }
    }
    return list[list.length - 1][field];
  }

  /* How the finished route compares with the best one the balance search
     found on this landscape. Deliberately "found" rather than "possible":
     that search never considers a route that doubles back west, so it is a
     strong benchmark and not a proof of the optimum. */
  function parReading(state) {
    if (!state.par || !state.par.allRound) { return null; }

    var par = state.par.allRound.weakest;
    if (!par) { return null; }

    var yours = Score.lowestDial(state.score.dials).value;
    var share = (yours / par) * 100;

    return {
      line: fill(yours >= par ? CFG.copy.parLineMatched : CFG.copy.parLine,
                 { yours: yours, par: par }),
      encouragement: bandIn(CFG.encouragement, share, 'text')
    };
  }

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

    if (els.verdictPar) {
      var reading = parReading(state);
      els.verdictPar.hidden = !reading;
      if (reading) {
        els.verdictPar.textContent = '';
        var said = document.createElement('strong');
        said.textContent = reading.encouragement;
        els.verdictPar.appendChild(said);
        els.verdictPar.appendChild(document.createTextNode(' ' + reading.line));
      }
    }

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
    setText(els.verdictAgain, copy.verdictAgain);
    setText(els.verdictBest, copy.verdictBest);
    setText(els.verdictShare, copy.verdictShare);
    setText(els.verdictShareHint, copy.verdictShareHint);
    setText(els.daily, copy.dailyButton);
    setText(els.seedGo, copy.seedGo);
    setText(els.committedLabel, copy.committedLabel);
    setText(els.committedHint, copy.committedHint);
    if (els.seedInput) {
      els.seedInput.setAttribute('aria-label', copy.seedInputLabel);
      els.seedInput.placeholder = copy.seedInputPlaceholder;
    }
  }

  function paint(state) {
    setPreview(state);
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
    closeDialog: closeDialog,
    setCursor: setCursor,
    paintGhostRoute: paintGhostRoute,
    clearGhostRoute: clearGhostRoute,
    paintSeed: paintSeed,
    paintDifficulty: paintDifficulty,
    shareText: shareText,
    showShareFallback: showShareFallback,
    showTip: showTip,
    decorateTip: decorateTip,
    hideTip: hideTip,
    paint: paint,
    elements: els
  };

}(CONFIG, Score, MapArt, RouteArt));
