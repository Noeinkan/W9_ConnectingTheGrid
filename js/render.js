/* =========================================================================
   Connecting the Grid - rendering
   =========================================================================

   Everything that writes to the page lives here, and nothing else does.

   This file holds no game state and decides no rules. It is handed a state
   object by game.js and paints it. If you find yourself wanting to work out
   whether a move is legal in this file, it belongs in game.js instead.

   Exposes one global: Render.
   ========================================================================= */

var Render = (function (CFG, Score) {
  'use strict';

  var els = {};      // cached page elements
  var cells = [];    // cell buttons, indexed [row][col]

  /* ---------------------------------------------------------------------
     Text helpers
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

  /* ---------------------------------------------------------------------
     Building the board, once
     ------------------------------------------------------------------- */

  function buildBoard(container, onCellActivate, onCellFocus) {
    var copy = CFG.copy;

    container.style.gridTemplateColumns = 'repeat(' + CFG.grid.cols + ', minmax(0, 1fr))';
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

        button.addEventListener('click', onCellActivate);
        button.addEventListener('focus', onCellFocus);

        rowEl.appendChild(button);
        rowCells.push(button);
      }
      cells.push(rowCells);
      container.appendChild(rowEl);
    }

    els.board = container;
  }

  /* ---------------------------------------------------------------------
     Painting the board from state
     ------------------------------------------------------------------- */

  // Which way does segment b lie from segment a?
  function directionBetween(from, to) {
    if (to.row < from.row) { return 'n'; }
    if (to.row > from.row) { return 's'; }
    if (to.col > from.col) { return 'e'; }
    return 'w';
  }

  function paintBoard(state) {
    var copy = CFG.copy;

    // Index the route so each cell can be looked up in one pass.
    var routeAt = {};
    state.route.forEach(function (segment, index) {
      routeAt[segment.col + ',' + segment.row] = { segment: segment, index: index };
    });

    for (var row = 0; row < CFG.grid.rows; row++) {
      for (var col = 0; col < CFG.grid.cols; col++) {
        var button = cells[row][col];
        var typeId = Score.typeIdAt(col, row);
        var type = CFG.cellTypes[typeId];
        var here = routeAt[col + ',' + row];
        var isStart = (col === CFG.start.col && row === CFG.start.row);
        var isEnd = (col === CFG.end.col && row === CFG.end.row);
        var isAvailable = state.available.indexOf(col + ',' + row) !== -1;
        var isHead = !!here && here.index === state.route.length - 1;

        // --- classes ---
        var classes = ['cell', 't-' + typeId];
        if (isStart) { classes.push('is-start'); }
        if (isEnd) { classes.push('is-end'); }
        if (here) {
          classes.push('is-route', 'tech-' + here.segment.techId);
          var previous = state.route[here.index - 1];
          var next = state.route[here.index + 1];
          if (previous) { classes.push('conn-' + directionBetween(here.segment, previous)); }
          if (next) { classes.push('conn-' + directionBetween(here.segment, next)); }
        }
        if (isHead) { classes.push('is-head'); }
        if (isAvailable) { classes.push('is-available'); }
        if (!here && !isAvailable && state.route.length > 0) { classes.push('is-out-of-reach'); }
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
            tech: Score.technology(here.segment.techId).label
          }));
          if (isHead) { parts.push(copy.cellIsHead); }
        } else if (isAvailable) {
          parts.push(copy.cellAvailable);
        }
        button.setAttribute('aria-label', parts.join(' '));

        // Route cells and reachable cells are the only interactive ones, but
        // every cell stays focusable so the map can be read right through.
        button.disabled = false;
        button.setAttribute('aria-disabled', isAvailable || here ? 'false' : 'true');
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
     Status line
     ------------------------------------------------------------------- */

  function paintStatus(state) {
    if (!els.status) { return; }
    els.status.textContent = state.message;
    els.status.dataset.tone = state.tone || 'info';
  }

  /* ---------------------------------------------------------------------
     Controls
     ------------------------------------------------------------------- */

  function paintControls(state) {
    if (els.undo) { els.undo.disabled = !state.canUndo; }
    if (els.reset) { els.reset.disabled = !state.canReset; }
  }

  /* ---------------------------------------------------------------------
     Legend
     ------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------
     Wiring up
     ------------------------------------------------------------------- */

  function cacheElements(map) {
    Object.keys(map).forEach(function (name) {
      els[name] = document.getElementById(map[name]);
    });
  }

  function paintStaticCopy() {
    var copy = CFG.copy;
    document.title = copy.title;
    if (els.title) { els.title.textContent = copy.title; }
    if (els.strapline) { els.strapline.textContent = copy.strapline; }
    if (els.legendHeading) { els.legendHeading.textContent = copy.legendHeading; }
    if (els.controlsHeading) { els.controlsHeading.textContent = copy.controlsHeading; }
    if (els.undo) { els.undo.textContent = copy.undo; }
    if (els.reset) { els.reset.textContent = copy.reset; }
  }

  function paint(state) {
    paintBoard(state);
    paintStatus(state);
    paintControls(state);
  }

  return {
    cacheElements: cacheElements,
    paintStaticCopy: paintStaticCopy,
    buildBoard: buildBoard,
    buildLegend: buildLegend,
    setCursor: setCursor,
    paint: paint,
    elements: els
  };

}(CONFIG, Score));
