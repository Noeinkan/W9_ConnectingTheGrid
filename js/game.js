/* =========================================================================
   Connecting the Grid - game state and rules
   =========================================================================

   The only file that holds state, and the only file that decides what is
   and is not a legal move. It asks score.js for numbers and render.js to
   paint. It never touches the page directly.

   The shape of the game
   ---------------------
   The route is a chain of pieces, each one filling a single square. A piece
   is nothing but its two open ends. The chain has exactly one loose end at
   any moment - the "open end" - and that loose end decides two things:

     * which square the next piece must go on, and
     * which side of that piece has to be open to receive the line.

   So there is never more than one legal target square. The choice the player
   makes is which shape to put on it, and which technology to carry it with.

   Exposes one global: Game.
   ========================================================================= */

var Game = (function (CFG, Score, Render) {
  'use strict';

  /* ---------------------------------------------------------------------
     Geometry
     ------------------------------------------------------------------- */

  var STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  var OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };

  function neighbour(col, row, side) {
    var step = STEP[side];
    return { col: col + step[0], row: row + step[1] };
  }

  function onBoard(col, row) {
    return col >= 0 && col < CFG.grid.cols && row >= 0 && row < CFG.grid.rows;
  }

  // Which way does `to` lie from `from`? Both are always orthogonal neighbours.
  function directionBetween(from, to) {
    if (to.row < from.row) { return 'n'; }
    if (to.row > from.row) { return 's'; }
    if (to.col > from.col) { return 'e'; }
    return 'w';
  }

  /* ---------------------------------------------------------------------
     State
     ------------------------------------------------------------------- */

  var state = {
    route: [],              // [{ col, row, pieceId, techId, typeId }]
    armedPiece: null,       // the piece id waiting to be placed, or null
    currentTech: CFG.defaultTechnology,
    phase: 'ready',         // ready | routing | complete | notEnergised |
                            // wrongEndPiece | stuck
    message: '',
    tone: 'info',
    target: null,           // { col, row } - the one square the next piece goes on
    needSide: null,         // the side that piece must open on
    fits: {},               // piece id -> would it fit on the target right now
    canUndo: false,
    canReset: false,
    score: null
  };

  // Where the keyboard cursor sits. Starts on the square the first piece goes.
  var cursor = { col: CFG.start.col, row: CFG.start.row };

  function head() { return state.route[state.route.length - 1]; }

  function isOnRoute(col, row) {
    for (var i = 0; i < state.route.length; i++) {
      if (state.route[i].col === col && state.route[i].row === row) { return true; }
    }
    return false;
  }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  function sideName(side) { return CFG.copy.sides[side] || side; }

  /* The loose end of the chain: the connector of the last piece that is not
     joined to whatever came before it. For the very first piece, "before it"
     is the incoming line at CONFIG.start.entry. */
  function openEnd() {
    var last = head();
    if (!last) { return null; }
    var previous = state.route[state.route.length - 2];
    var usedSide = previous
      ? directionBetween(last, previous)
      : CFG.start.entry;
    var connectors = Score.piece(last.pieceId).connectors;
    return connectors[0] === usedSide ? connectors[1] : connectors[0];
  }

  /* ---------------------------------------------------------------------
     Rules
     ------------------------------------------------------------------- */

  /* Where does the next piece go, and which side of it must be open?
     Returns null once the connection is finished. */
  function nextSlot() {
    if (state.phase === 'complete') { return null; }

    if (state.route.length === 0) {
      return {
        at: { col: CFG.start.col, row: CFG.start.row },
        needSide: CFG.start.entry
      };
    }

    var last = head();
    var side = openEnd();
    var at = neighbour(last.col, last.row, side);
    if (!onBoard(at.col, at.row)) { return null; }

    // The next piece has to receive the line on the side facing back to us.
    return { at: at, needSide: OPPOSITE[side] };
  }

  /* Can this piece go on this square right now?
     Returns { ok: true } or { ok: false, message: '...' }. */
  function check(col, row, pieceId) {
    var copy = CFG.copy;

    if (state.phase === 'complete') {
      return { ok: false, message: copy.errComplete };
    }
    if (!pieceId) {
      return { ok: false, message: copy.errNoPiece };
    }
    if (!state.target || state.target.col !== col || state.target.row !== row) {
      return { ok: false, message: copy.errWrongSquare };
    }

    var typeId = Score.typeIdAt(col, row);
    if (typeId === null) { return { ok: false, message: copy.errWrongSquare }; }
    var type = CFG.cellTypes[typeId];

    if (!type.passable) { return { ok: false, message: copy.errImpassable }; }
    if (isOnRoute(col, row) && !CFG.rules.allowRevisit) {
      return { ok: false, message: copy.errAlreadyUsed };
    }

    // The fit itself: the piece must open on the side the line arrives from.
    if (!Score.pieceOpens(pieceId, state.needSide)) {
      var template = state.route.length === 0 ? copy.errStartPiece : copy.errPieceDoesNotFit;
      return { ok: false, message: fill(template, { side: sideName(state.needSide) }) };
    }

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

  /* Work out the target square, then which of the six pieces would actually
     fit on it. Both are needed by render: one to highlight the square, the
     other to grey out the palette tiles that cannot be used. */
  function recomputeTarget() {
    var slot = nextSlot();
    state.target = slot ? slot.at : null;
    state.needSide = slot ? slot.needSide : null;

    state.fits = {};
    if (!state.target) { return; }
    CFG.pieces.forEach(function (piece) {
      state.fits[piece.id] = check(state.target.col, state.target.row, piece.id).ok;
    });
  }

  function anyPieceFits() {
    return CFG.pieces.some(function (piece) { return state.fits[piece.id]; });
  }

  /* ---------------------------------------------------------------------
     Moves
     ------------------------------------------------------------------- */

  function place(col, row, pieceId) {
    var chosen = pieceId || state.armedPiece;
    var verdict = check(col, row, chosen);
    if (!verdict.ok) {
      state.message = verdict.message;
      state.tone = 'error';
      refresh();
      return false;
    }

    state.route.push({
      col: col,
      row: row,
      pieceId: chosen,
      techId: state.currentTech,
      typeId: Score.typeIdAt(col, row)
    });
    cursor = { col: col, row: row };
    settlePhase();

    // Keep the piece armed so a run of straights is one click each, but only
    // while it would still be a legal next move. settlePhase has already
    // recomputed which pieces fit the new target.
    if (!state.fits[chosen]) { state.armedPiece = null; }
    refresh();
    return true;
  }

  /* Choosing a piece always arms it, and never un-arms it. A palette tile
     that toggled would be a trap: after laying a straight the same tile is
     still armed, so clicking it again to lay a second one would silently
     put the piece down instead of picking it up. Escape is the way out. */
  function armPiece(pieceId) {
    state.armedPiece = pieceId;
    state.message = fill(CFG.copy.statusArmed, {
      piece: Score.piece(pieceId).label
    });
    state.tone = 'info';
    refresh();
  }

  function disarm() {
    if (!state.armedPiece) { return; }
    state.armedPiece = null;
    settlePhase();
    refresh();
  }

  function setTech(techId) {
    state.currentTech = Score.technology(techId).id;
    settlePhase();
    refresh();
  }

  function undo() {
    if (!CFG.rules.allowUndo) {
      state.message = CFG.copy.errUndoDisabled;
      state.tone = 'error';
      refresh();
      return false;
    }
    if (state.route.length === 0) {
      state.message = CFG.copy.errNoRoute;
      state.tone = 'error';
      refresh();
      return false;
    }
    var removed = state.route.pop();
    cursor = { col: removed.col, row: removed.row };
    settlePhase();
    refresh();
    return true;
  }

  function reset() {
    state.route = [];
    state.armedPiece = null;
    state.currentTech = CFG.defaultTechnology;
    state.phase = 'ready';
    cursor = { col: CFG.start.col, row: CFG.start.row };
    settlePhase();
    refresh();
  }

  /* ---------------------------------------------------------------------
     Phase and messaging
     ------------------------------------------------------------------- */

  function settlePhase() {
    var copy = CFG.copy;
    var scored = Score.scoreRoute(state.route);
    var last = head();

    state.phase = state.route.length === 0 ? 'ready' : 'routing';

    if (last && last.col === CFG.end.col && last.row === CFG.end.row) {
      if (openEnd() !== CFG.end.exit) {
        // The line has landed on the demand centre but runs straight past it.
        state.phase = 'wrongEndPiece';
        state.message = copy.statusWrongEndPiece;
        state.tone = 'warning';
      } else if (CFG.rules.requireSubstation && !scored.crossesSubstation) {
        state.phase = 'notEnergised';
        state.message = copy.statusNotEnergised;
        state.tone = 'warning';
      } else {
        state.phase = 'complete';
        state.message = copy.statusComplete;
        state.tone = 'success';
      }
    } else if (state.phase === 'ready') {
      state.message = copy.statusReady;
      state.tone = 'info';
    } else {
      state.message = fill(copy.statusRouting, { n: state.route.length });
      state.tone = 'info';
    }

    state.score = scored;

    /* Dead end: recompute the target under the new phase, then see if the
       player has anything left to play. Only a route that is still going
       becomes 'stuck' - the end-of-route phases above say something more
       useful than "nowhere to go" and should not be overwritten. */
    recomputeTarget();
    if ((state.phase === 'ready' || state.phase === 'routing') && !anyPieceFits()) {
      state.phase = 'stuck';
      state.message = copy.statusStuck;
      state.tone = 'warning';
    }
  }

  function refresh() {
    recomputeTarget();
    state.canUndo = CFG.rules.allowUndo && state.route.length > 0;
    state.canReset = state.route.length > 0;
    Render.paint(state);
    Render.setCursor(cursor.col, cursor.row, false);
  }

  /* ---------------------------------------------------------------------
     Input
     ------------------------------------------------------------------- */

  function onCellActivate(event) {
    var button = event.currentTarget;
    place(Number(button.dataset.col), Number(button.dataset.row), null);
  }

  function onCellFocus(event) {
    var button = event.currentTarget;
    cursor = { col: Number(button.dataset.col), row: Number(button.dataset.row) };
  }

  // A piece dragged from the palette and dropped on a square.
  function onCellDrop(col, row, pieceId) {
    state.armedPiece = pieceId;
    place(col, row, pieceId);
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
      piecesHeading: 'piecesHeading',
      piecesHint: 'piecesHint',
      pieces: 'pieces',
      techHeading: 'techHeading',
      techHint: 'techHint',
      tech: 'tech',
      dialsHeading: 'dialsHeading',
      meters: 'meters',
      controlsHeading: 'controlsHeading',
      undo: 'undoButton',
      reset: 'resetButton',
      home: 'homeTab',
      instructionsTab: 'instructionsTab',
      instructionsDialog: 'instructionsDialog',
      instructionsHeading: 'instructionsHeading',
      instructionsBody: 'instructionsBody',
      verdictDialog: 'verdictDialog',
      verdictHeading: 'verdictHeading',
      verdictTitle: 'verdictTitle',
      verdictBody: 'verdictBody'
    });

    var problems = Score.validateMap();
    if (problems.length) {
      // A broken map is a config error, and silence would be unhelpful.
      console.error('Connecting the Grid - the map in config.js has problems:');
      problems.forEach(function (problem) { console.error('  - ' + problem); });
    }

    Render.paintStaticCopy();
    Render.buildBoard(Render.elements.board, onCellActivate, onCellFocus, onCellDrop);
    Render.buildPalette(Render.elements.pieces, armPiece);
    Render.buildTechPicker(Render.elements.tech, setTech);
    Render.buildMeters(Render.elements.meters);
    Render.buildLegend(Render.elements.legend);
    Render.buildInstructions(Render.elements.instructionsBody);

    Render.elements.board.addEventListener('keydown', onBoardKeyDown);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { disarm(); }
    });
    Render.elements.undo.addEventListener('click', function () { undo(); });
    Render.elements.reset.addEventListener('click', function () { reset(); });
    Render.elements.home.addEventListener('click', function () { reset(); });
    Render.elements.instructionsTab.addEventListener('click', function () {
      Render.openDialog(Render.elements.instructionsDialog);
    });

    reset();
    Render.setCursor(CFG.start.col, CFG.start.row, false);
  }

  return {
    init: init,
    place: place,
    armPiece: armPiece,
    disarm: disarm,
    setTech: setTech,
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
