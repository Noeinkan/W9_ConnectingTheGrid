/* =========================================================================
   Connecting the Grid - rendering
   =========================================================================

   Everything that writes to the page lives here, and nothing else does.

   This file holds no game state and decides no rules. It is handed a state
   object by game.js and paints it. If you find yourself wanting to work out
   whether a move is legal in this file, it belongs in game.js instead.

   Note on drawing pieces: a piece is drawn entirely in CSS, from the two
   conn-* classes for its open ends. The same rules draw the board squares
   and the palette tiles, so there are no track images to keep in step.

   Exposes one global: Render.
   ========================================================================= */

var Render = (function (CFG, Score) {
  'use strict';

  var els = {};        // cached page elements
  var cells = [];      // cell buttons, indexed [row][col]
  var pieceTiles = {}; // palette tiles, by piece id
  var techTiles = {};  // technology buttons, by technology id
  var meterParts = {}; // meter marker/label elements, by dial id

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

  // The conn-n / conn-e / conn-s / conn-w classes that draw a piece.
  function connClasses(pieceId) {
    return Score.piece(pieceId).connectors.map(function (side) {
      return 'conn-' + side;
    });
  }

  /* ---------------------------------------------------------------------
     Building the board, once
     ------------------------------------------------------------------- */

  function buildBoard(container, onCellActivate, onCellFocus, onCellDrop) {
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

        /* Drag and drop is a convenience laid over the click path, never the
           only way in: dropping does exactly what arming then clicking does.
           dragover must be cancelled or the browser refuses the drop. */
        button.addEventListener('dragover', function (event) {
          if (this.classList.contains('is-target')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            this.classList.add('is-dragover');
          }
        });
        button.addEventListener('dragleave', function () {
          this.classList.remove('is-dragover');
        });
        button.addEventListener('drop', function (event) {
          event.preventDefault();
          this.classList.remove('is-dragover');
          var pieceId = event.dataTransfer.getData('text/plain');
          if (pieceId) {
            onCellDrop(Number(this.dataset.col), Number(this.dataset.row), pieceId);
          }
        });

        rowEl.appendChild(button);
        rowCells.push(button);
      }
      cells.push(rowCells);
      container.appendChild(rowEl);
    }

    els.board = container;
  }

  /* ---------------------------------------------------------------------
     Building the palette, once
     ------------------------------------------------------------------- */

  function buildPalette(container, onPieceChosen) {
    container.innerHTML = '';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', CFG.copy.piecesLabel);
    pieceTiles = {};

    CFG.pieces.forEach(function (piece) {
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'piece';
      tile.dataset.piece = piece.id;
      tile.draggable = true;
      // aria-pressed is what tells a screen reader which piece is armed.
      tile.setAttribute('aria-pressed', 'false');
      tile.setAttribute('aria-label', piece.label + '. ' + piece.aria);

      // The track itself, drawn by the same CSS that draws the board.
      var art = document.createElement('span');
      art.className = ['piece-art', 'is-route'].concat(connClasses(piece.id)).join(' ');
      art.setAttribute('aria-hidden', 'true');
      tile.appendChild(art);

      tile.addEventListener('click', function () { onPieceChosen(piece.id); });
      tile.addEventListener('dragstart', function (event) {
        event.dataTransfer.setData('text/plain', piece.id);
        event.dataTransfer.effectAllowed = 'copy';
        onPieceChosen(piece.id);
      });

      container.appendChild(tile);
      pieceTiles[piece.id] = tile;
    });
  }

  function buildTechPicker(container, onTechChosen) {
    container.innerHTML = '';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', CFG.copy.techHeading);
    techTiles = {};

    CFG.technologies.forEach(function (tech) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tech tech-' + tech.id;
      button.dataset.tech = tech.id;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', tech.label + '. ' + tech.summary + '. ' + tech.description);

      var swatch = document.createElement('span');
      swatch.className = 'tech-swatch';
      swatch.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className = 'tech-label';
      label.textContent = tech.short;

      var summary = document.createElement('span');
      summary.className = 'tech-summary';
      summary.textContent = tech.summary;

      button.appendChild(swatch);
      button.appendChild(label);
      button.appendChild(summary);
      button.addEventListener('click', function () { onTechChosen(tech.id); });

      container.appendChild(button);
      techTiles[tech.id] = button;
    });
  }

  /* ---------------------------------------------------------------------
     Building the meters, once
     ------------------------------------------------------------------- */

  function buildMeters(container) {
    container.innerHTML = '';
    meterParts = {};

    CFG.dials.forEach(function (dial) {
      var row = document.createElement('div');
      row.className = 'meter';

      var label = document.createElement('span');
      label.className = 'meter-label';
      label.textContent = dial.label;

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
      row.appendChild(bar);
      container.appendChild(row);

      meterParts[dial.id] = { bar: bar, marker: marker, dial: dial };
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

  /* ---------------------------------------------------------------------
     Painting the board from state
     ------------------------------------------------------------------- */

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
        var classes = ['cell', 't-' + typeId];
        if (isStart) { classes.push('is-start'); }
        if (isEnd) { classes.push('is-end'); }
        if (here) {
          // A piece draws itself from its own two open ends - no need to look
          // at its neighbours, which is what makes a dead end drawable.
          classes.push('is-route', 'tech-' + here.segment.techId);
          classes = classes.concat(connClasses(here.segment.pieceId));
        }
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
     Painting the palette from state
     ------------------------------------------------------------------- */

  function paintPalette(state) {
    Object.keys(pieceTiles).forEach(function (pieceId) {
      var tile = pieceTiles[pieceId];
      var armed = state.armedPiece === pieceId;
      var fits = !!state.fits[pieceId];

      // Rebuilt from scratch each paint so the technology class cannot pile up.
      tile.className = 'piece tech-' + state.currentTech;
      tile.setAttribute('aria-pressed', armed ? 'true' : 'false');
      tile.classList.toggle('is-armed', armed);
      // Pieces that cannot be played are dimmed but stay operable, so the
      // player can still ask for one and be told why it does not fit.
      tile.classList.toggle('is-unusable', !fits);
      tile.draggable = fits;
    });

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

  function setText(el, text) { if (el) { el.textContent = text; } }

  function paintStaticCopy() {
    var copy = CFG.copy;
    document.title = copy.title;
    setText(els.title, copy.title);
    setText(els.strapline, copy.strapline);
    setText(els.piecesHeading, copy.piecesHeading);
    setText(els.piecesHint, copy.piecesHint);
    setText(els.techHeading, copy.techHeading);
    setText(els.techHint, copy.techHint);
    setText(els.dialsHeading, copy.dialsHeading);
    setText(els.legendHeading, copy.legendHeading);
    setText(els.controlsHeading, copy.controlsHeading);
    setText(els.undo, copy.undo);
    setText(els.reset, copy.reset);
    setText(els.home, copy.tabHome);
    setText(els.instructionsTab, copy.tabInstructions);
    setText(els.instructionsHeading, copy.instructionsHeading);
    setText(els.verdictHeading, copy.verdictHeading);
  }

  function paint(state) {
    paintBoard(state);
    paintPalette(state);
    paintMeters(state);
    paintStatus(state);
    paintControls(state);
    paintVerdict(state);
  }

  return {
    cacheElements: cacheElements,
    paintStaticCopy: paintStaticCopy,
    buildBoard: buildBoard,
    buildPalette: buildPalette,
    buildTechPicker: buildTechPicker,
    buildMeters: buildMeters,
    buildLegend: buildLegend,
    buildInstructions: buildInstructions,
    openDialog: openDialog,
    setCursor: setCursor,
    paint: paint,
    elements: els
  };

}(CONFIG, Score));
