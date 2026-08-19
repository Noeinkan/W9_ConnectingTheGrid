/* =========================================================================
   Connecting the Grid - game state and rules
   =========================================================================

   The only file that holds state, and the only file that decides what is
   and is not a legal move. It asks score.js for numbers and render.js to
   paint. It never touches the page directly.

   Exposes one global: Game.
   ========================================================================= */

var Game = (function (CFG, Score, Render) {
  'use strict';

  /* ---------------------------------------------------------------------
     State
     ------------------------------------------------------------------- */

  var state = {
    route: [],            // [{ col, row, typeId, techId }]
    currentTech: CFG.defaultTechnology,
    phase: 'ready',       // ready | routing | complete | notEnergised
    message: '',
    tone: 'info',
    available: [],        // keys of cells the route may enter next
    canUndo: false,
    canReset: false
  };

  // Where the keyboard cursor sits. Starts on the generation site.
  var cursor = { col: CFG.start.col, row: CFG.start.row };

  function key(col, row) { return col + ',' + row; }

  function head() { return state.route[state.route.length - 1]; }

  function isOnRoute(col, row) {
    for (var i = 0; i < state.route.length; i++) {
      if (state.route[i].col === col && state.route[i].row === row) { return true; }
    }
    return false;
  }

  function isEnd(col, row) { return col === CFG.end.col && row === CFG.end.row; }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  /* ---------------------------------------------------------------------
     Rules
     ------------------------------------------------------------------- */

  var STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N, E, S, W - no diagonals

  function neighbours(col, row) {
    var out = [];
    var steps = CFG.rules.allowDiagonals
      ? STEPS.concat([[1, -1], [1, 1], [-1, 1], [-1, -1]])
      : STEPS;
    for (var i = 0; i < steps.length; i++) {
      var c = col + steps[i][0];
      var r = row + steps[i][1];
      if (c >= 0 && c < CFG.grid.cols && r >= 0 && r < CFG.grid.rows) {
        out.push({ col: c, row: r });
      }
    }
    return out;
  }

  /* Can the route be extended into this cell right now?
     Returns { ok: true } or { ok: false, message: '...' }. */
  function check(col, row) {
    var copy = CFG.copy;

    if (state.phase === 'complete') {
      return { ok: false, message: copy.errComplete };
    }

    var typeId = Score.typeIdAt(col, row);
    if (typeId === null) { return { ok: false, message: copy.errNotAdjacent }; }
    var type = CFG.cellTypes[typeId];

    if (!type.passable) { return { ok: false, message: copy.errImpassable }; }
    if (isOnRoute(col, row) && !CFG.rules.allowRevisit) {
      return { ok: false, message: copy.errAlreadyUsed };
    }

    var from = head();
    var adjacent = neighbours(from.col, from.row).some(function (n) {
      return n.col === col && n.row === row;
    });
    if (!adjacent) { return { ok: false, message: copy.errNotAdjacent }; }

    if (!Score.canUseTech(state.currentTech, typeId)) {
      return {
        ok: false,
        message: fill(copy.errTechBanned, {
          tech: Score.technology(state.currentTech).label,
          terrain: type.label
        })
      };
    }

    return { ok: true };
  }

  // Every cell the route could legally enter next.
  function recomputeAvailable() {
    state.available = [];
    if (state.phase === 'complete') { return; }
    var from = head();
    if (!from) { return; }
    neighbours(from.col, from.row).forEach(function (n) {
      if (check(n.col, n.row).ok) { state.available.push(key(n.col, n.row)); }
    });
  }

  /* ---------------------------------------------------------------------
     Moves
     ------------------------------------------------------------------- */

  function push(col, row) {
    state.route.push({
      col: col,
      row: row,
      typeId: Score.typeIdAt(col, row),
      techId: state.currentTech
    });
  }

  function lay(col, row) {
    var verdict = check(col, row);
    if (!verdict.ok) {
      state.message = verdict.message;
      state.tone = 'error';
      refresh();
      return false;
    }

    push(col, row);
    cursor = { col: col, row: row };
    settlePhase();
    refresh();
    return true;
  }

  function undo() {
    // The generation site is the start of the route and cannot be removed.
    if (state.route.length <= 1) {
      state.message = CFG.copy.errNoRoute;
      state.tone = 'error';
      refresh();
      return false;
    }
    state.route.pop();
    var last = head();
    cursor = { col: last.col, row: last.row };
    settlePhase();
    refresh();
    return true;
  }

  function reset() {
    state.route = [];
    state.currentTech = CFG.defaultTechnology;
    state.phase = 'ready';
    push(CFG.start.col, CFG.start.row);   // the route always begins at the source
    cursor = { col: CFG.start.col, row: CFG.start.row };
    settlePhase();
    refresh();
  }

  /* ---------------------------------------------------------------------
     Phase and messaging
     ------------------------------------------------------------------- */

  function settlePhase() {
    var copy = CFG.copy;
    var last = head();
    var scored = Score.scoreRoute(state.route);

    if (isEnd(last.col, last.row)) {
      if (CFG.rules.requireSubstation && !scored.crossesSubstation) {
        state.phase = 'notEnergised';
        state.message = copy.statusNotEnergised;
        state.tone = 'warning';
      } else {
        state.phase = 'complete';
        state.message = copy.statusComplete;
        state.tone = 'success';
      }
    } else if (state.route.length <= 1) {
      state.phase = 'ready';
      state.message = copy.statusReady;
      state.tone = 'info';
    } else {
      state.phase = 'routing';
      state.message = fill(copy.statusRouting, { n: state.route.length - 1 });
      state.tone = 'info';
    }

    state.score = scored;
  }

  function refresh() {
    recomputeAvailable();
    state.canUndo = state.route.length > 1;
    state.canReset = state.route.length > 1;
    Render.paint(state);
    Render.setCursor(cursor.col, cursor.row, false);
  }

  /* ---------------------------------------------------------------------
     Input
     ------------------------------------------------------------------- */

  function onCellActivate(event) {
    var button = event.currentTarget;
    lay(Number(button.dataset.col), Number(button.dataset.row));
  }

  function onCellFocus(event) {
    var button = event.currentTarget;
    cursor = { col: Number(button.dataset.col), row: Number(button.dataset.row) };
  }

  // Arrow keys walk the cursor around the board without laying anything.
  var ARROWS = {
    ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0]
  };

  function onBoardKeyDown(event) {
    var step = ARROWS[event.key];
    if (step) {
      event.preventDefault();
      var col = Math.min(CFG.grid.cols - 1, Math.max(0, cursor.col + step[0]));
      var row = Math.min(CFG.grid.rows - 1, Math.max(0, cursor.row + step[1]));
      cursor = { col: col, row: row };
      Render.setCursor(col, row, true);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      cursor.col = 0;
      Render.setCursor(cursor.col, cursor.row, true);
    }
    if (event.key === 'End') {
      event.preventDefault();
      cursor.col = CFG.grid.cols - 1;
      Render.setCursor(cursor.col, cursor.row, true);
    }
  }

  /* ---------------------------------------------------------------------
     Start up
     ------------------------------------------------------------------- */

  function init() {
    Render.cacheElements({
      title: 'gameTitle',
      strapline: 'gameStrapline',
      board: 'board',
      status: 'status',
      legend: 'legend',
      legendHeading: 'legendHeading',
      controlsHeading: 'controlsHeading',
      undo: 'undoButton',
      reset: 'resetButton'
    });

    var problems = Score.validateMap();
    if (problems.length) {
      // A broken map is a config error, and silence would be unhelpful.
      console.error('Connecting the Grid - the map in config.js has problems:');
      problems.forEach(function (problem) { console.error('  - ' + problem); });
    }

    Render.paintStaticCopy();
    Render.buildBoard(Render.elements.board, onCellActivate, onCellFocus);
    Render.buildLegend(Render.elements.legend);
    Render.elements.board.addEventListener('keydown', onBoardKeyDown);

    Render.elements.undo.addEventListener('click', function () { undo(); });
    Render.elements.reset.addEventListener('click', function () { reset(); });

    reset();
    Render.setCursor(CFG.start.col, CFG.start.row, false);
  }

  return {
    init: init,
    lay: lay,
    undo: undo,
    reset: reset,
    state: state
  };

}(CONFIG, Score, Render));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Game.init);
} else {
  Game.init();
}
