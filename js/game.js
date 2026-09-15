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

   So there is never more than one legal target square.

   Which is the whole reason the player is not asked to choose a shape.
   A piece that fits has to open on the side the line arrives from, and its
   OTHER end is the direction the line leaves in - so choosing the shape and
   choosing the direction are the same choice, and direction is the one a
   player can see on the map. The six pieces are still exactly what gets
   recorded and scored; they are just no longer what gets asked about.

   Exposes one global: Game.
   ========================================================================= */

var Game = (function (CFG, Score, Render, MapGen, Balance, Foresight, Advice, Guidance, Tour,
                      Archetypes, SummaryPanel) {
  'use strict';

  /* ---------------------------------------------------------------------
     Geometry
     ------------------------------------------------------------------- */

  var STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  var OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };
  var SIDES = ['n', 'e', 's', 'w'];

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

  // The one piece that opens on both of these sides. There is always exactly
  // one, because six pieces is every way of picking two of the four sides.
  function pieceJoining(a, b) {
    for (var i = 0; i < CFG.pieces.length; i++) {
      var ends = CFG.pieces[i].connectors;
      if ((ends[0] === a && ends[1] === b) || (ends[0] === b && ends[1] === a)) {
        return CFG.pieces[i];
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------------
     State
     ------------------------------------------------------------------- */

  var state = {
    route: [],              // [{ col, row, pieceId, techId, typeId }]
    currentTech: CFG.defaultTechnology,
    phase: 'ready',         // ready | routing | complete | notEnergised |
                            // wrongEndPiece | stuck
    message: '',
    tone: 'info',
    target: null,           // { col, row } - the one square the next piece goes on
    needSide: null,         // the side that piece must open on
    openEnd: null,          // the loose end of the line, for drawing it
    fits: {},               // piece id -> would it fit on the target right now
    exits: [],              // the ways out of the target - see exitsFrom()
    seed: null,             // which landscape is being played
    daily: null,            // set when today's landscape is the one in play
    weekly: null,           // '2026-W38' when this week's landscape is in play
    archetype: null,        // the kind of landscape - see js/archetypes.js
    blind: false,           // Blind mode: the score is held back until the finish
    par: null,              // what the balance search found on this landscape
    preview: null,          // where the dials land if the target is built
    forecast: null,         // the best finish still open - see forecastNow()
    forecasts: [],          // one reading per route length, 0 to route.length
    moods: [],              // per span: what it did to the best finish
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

  function say(message, tone) {
    state.message = message;
    state.tone = tone || 'info';
    refresh();
    return false;
  }

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
      return { ok: false, message: copy.errWrongSquare };
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

  /* The ways out of the target square.

     Three of them, always: a piece has two ends, one of them is spoken for
     by the line coming in, and the other can face any of the three
     remaining sides. Each way out is named by the direction it sends the
     line rather than by the shape of the piece that does it, because the
     direction is what the player is actually choosing.

     Ways that are not open are kept in the list rather than dropped. The
     arrows draw them greyed, and "there is no way north from here" is worth
     as much to a player as "there is a way east". */
  function exitsFrom(target, needSide) {
    if (!target) { return []; }

    return SIDES.filter(function (side) { return side !== needSide; })
      .map(function (side) {
        var piece = pieceJoining(needSide, side);
        return {
          dir: side,
          pieceId: piece.id,
          to: neighbour(target.col, target.row, side),
          ok: !!state.fits[piece.id]
        };
      });
  }

  function exitTowards(col, row) {
    for (var i = 0; i < state.exits.length; i++) {
      var exit = state.exits[i];
      if (exit.to.col === col && exit.to.row === row) { return exit; }
    }
    return null;
  }

  /* Work out the target square, then which of the six pieces would fit on
     it, then what that means as directions. Render needs all three: one to
     highlight the square, one to draw the line's loose end, one to put the
     arrows on the map. */
  function recomputeTarget() {
    var slot = nextSlot();
    state.target = slot ? slot.at : null;
    state.needSide = slot ? slot.needSide : null;
    state.openEnd = openEnd();

    state.fits = {};
    if (!state.target) { state.exits = []; return; }

    CFG.pieces.forEach(function (piece) {
      state.fits[piece.id] = check(state.target.col, state.target.row, piece.id).ok;
    });
    state.exits = exitsFrom(state.target, state.needSide);
  }

  function anyPieceFits() {
    return CFG.pieces.some(function (piece) { return state.fits[piece.id]; });
  }

  /* ---------------------------------------------------------------------
     Moves
     ------------------------------------------------------------------- */

  function place(col, row, pieceId) {
    var verdict = check(col, row, pieceId);
    if (!verdict.ok) { return say(verdict.message, 'error'); }

    state.route.push({
      col: col,
      row: row,
      pieceId: pieceId,
      techId: state.currentTech,
      typeId: Score.typeIdAt(col, row)
    });
    cursor = { col: col, row: row };
    settlePhase();
    settleForecast();
    speakMood();
    refresh();
    return true;
  }

  /* Send the line from the target square towards (col, row).

     This is the only way a piece is ever laid. Clicking an arrow, clicking
     the square ahead, dragging across the map and pressing an arrow key all
     end up here, and all of them are saying the same thing: the line goes
     that way next. Which piece that means is worked out rather than asked
     about. */
  function stepTo(col, row) {
    var exit = exitTowards(col, row);
    if (!exit) { return say(CFG.copy.errWrongSquare, 'error'); }
    // Not filtered on exit.ok: check() inside place() knows why, and says so.
    return place(state.target.col, state.target.row, exit.pieceId);
  }

  /* What building the highlighted square would do to the three dials,
     without building it.

     The game was asking the player to trade cost against environment
     against community and only showing the price once the span was already
     up. This is the fix, and it is aimed at the decision the player
     actually has.

     Note what it does NOT depend on: direction. The piece is laid on the
     highlighted square, so the ground being paid for is that square's
     whichever way the line then leaves. What DOES change the reading is the
     technology, which is exactly the choice worth informing - lattice,
     pylon or cable across this square, and here is what each does to the
     dials. Which way to leave is a different question, answered on the
     arrows and in the tooltip by naming the ground each way leads into.

     The arithmetic is Score's. Nothing here is a second copy of a rule that
     lives somewhere else. */
  function previewSpan() {
    if (!state.target || !state.score) { return null; }
    if (!anyPieceFits()) { return null; }

    var typeId = Score.typeIdAt(state.target.col, state.target.row);
    if (!typeId) { return null; }

    var span = Score.scoreSegment(typeId, state.currentTech);
    var now = state.score.totals;

    return {
      typeId: typeId,
      techId: state.currentTech,
      span: span,
      dials: Score.dialsFor({
        cost: now.cost + span.cost,
        env: now.env + span.env,
        comm: now.comm + span.comm
      })
    };
  }

  function setTech(techId) {
    state.currentTech = Score.technology(techId).id;
    settlePhase();
    refresh();
  }

  function undo() {
    if (!CFG.rules.allowUndo) { return say(CFG.copy.errUndoDisabled, 'error'); }
    if (state.route.length === 0) { return say(CFG.copy.errNoRoute, 'error'); }

    var removed = state.route.pop();
    cursor = { col: removed.col, row: removed.row };
    settlePhase();
    settleForecast();
    refresh();
    return true;
  }

  function reset() {
    Render.clearGhostRoute();
    state.route = [];
    state.currentTech = CFG.defaultTechnology;
    state.phase = 'ready';
    cursor = { col: CFG.start.col, row: CFG.start.row };
    settlePhase();
    settleForecast();
    refresh();
  }

  /* ---------------------------------------------------------------------
     The best finish still open
     ---------------------------------------------------------------------
     After every span, the balance search runs again from the end of the
     line: how well could this connection still finish? See the note at the
     top of js/foresight.js for why that is a number and never a route.

     Kept as a stack with one reading per span laid. Undo then hands the
     previous reading straight back instead of searching again - which
     matters on a backward drag, where undo fires once per square - and
     every span on the map can say what it cost by comparing the reading
     before it with the one after.
     ------------------------------------------------------------------- */

  function forecastNow() {
    /* A finished connection has nothing left to forecast. Its reading is
       simply what it scored, so the panel and the last span's mood compare
       like with like. */
    if (state.phase === 'complete' && state.score) {
      var dials = state.score.dials;
      var lowest = Score.lowestDial(dials);
      return {
        status: 'done',
        weakest: lowest.value,
        lowest: lowest.key,
        dials: dials,
        verdictKey: Score.verdictKeyFor(dials),
        balanced: lowest.value >= CFG.balancedThreshold
      };
    }
    return Foresight.ahead(Score.mapRows(), state.route, state.target);
  }

  function settleForecast() {
    var n = state.route.length;
    // Readings for longer routes are stale once a span comes down.
    if (state.forecasts.length > n + 1) { state.forecasts.length = n + 1; }
    if (state.forecasts.length === n + 1 && state.forecasts[n]) {
      state.forecast = state.forecasts[n];
      return;
    }
    while (state.forecasts.length < n) { state.forecasts.push(null); }
    state.forecasts[n] = forecastNow();
    state.forecast = state.forecasts[n];
  }

  /* If the span just laid cost something that cannot be got back, the
     status line says so now - which is the whole point of forecasting.
     Only while routing: the end-of-route phases already say something more
     useful, and a game played without the meters must not be told. */
  function speakMood() {
    if (state.blind || state.phase !== 'routing') { return; }
    var n = state.route.length;
    var mood = Advice.moodOf(state.forecasts[n - 1], state.forecasts[n]);
    var sentence = Advice.moodSentence(mood, n, !CFG.rules.allowUndo);
    if (!sentence) { return; }
    state.message = sentence;
    state.tone = mood.kind === 'slipped' ? 'info' : 'warning';
  }

  function moodsFor() {
    var moods = [];
    for (var i = 0; i < state.route.length; i++) {
      moods.push(Advice.moodOf(state.forecasts[i], state.forecasts[i + 1]));
    }
    return moods;
  }

  /* ---------------------------------------------------------------------
     Explaining
     ---------------------------------------------------------------------
     Three ways to ask "why", all answered in the status line so a screen
     reader hears them exactly as a sighted player reads them.
     ------------------------------------------------------------------- */

  // "Explain last span", or the E key.
  function explainLast() {
    say(Advice.explainLast(state.route, state.forecasts, !!state.blind), 'info');
  }

  // The "Why?" beside a meter.
  function explainDial(dialId) {
    if (!state.score) { return; }
    say(Advice.whySpoken(
      Advice.whyDial(dialId, state.route, state.score.dials[dialId])), 'info');
  }

  /* Shift and an arrow key on the highlighted square: what lies that way,
     without building anything. The keyboard's version of hovering over the
     square an arrow points at. */
  function lookAhead(side) {
    if (!state.target) { return say(CFG.copy.errComplete, 'error'); }

    var exit = null;
    state.exits.forEach(function (e) { if (e.dir === side) { exit = e; } });
    if (!exit) {
      // The one way that is never an exit: back the way the line came in.
      return say(CFG.copy.errPieceDoesNotFit, 'error');
    }
    if (!exit.ok) {
      return say(check(state.target.col, state.target.row, exit.pieceId).message, 'error');
    }

    say(Advice.lookAhead(state, side), 'info');
    Guidance.showLook(state, exit);
  }

  /* ---------------------------------------------------------------------
     A new landscape
     ---------------------------------------------------------------------
     Generated, checked and only then installed. Everything downstream reads
     the map through Score, so putting a new one in play is one call and
     there is no second copy to fall out of step.
     ------------------------------------------------------------------- */

  /* Puts a generated landscape into play. Everything downstream reads the
     map through Score, so there is one call and no second copy to fall out
     of step. Both ways of asking for a landscape end up here. */
  function install(built) {
    Score.setMap(built.rows);
    state.seed = built.seed;
    state.daily = built.daily || null;
    state.weekly = built.weekly || null;
    state.archetype = built.archetype || null;

    /* The balance search has already worked out, for this landscape, the
       best route it can find and what that route scores. It was thrown away
       here until now, which meant the game knew how good a route was
       available and never said so. Keep it: the difficulty badge, the
       comparison under the verdict and the best route drawn on the map are
       all read straight off it. */
    state.par = built.verdict && built.verdict.found
      ? {
          allRound: built.verdict.found.allRound,
          best: built.verdict.found.best,
          cheapest: built.verdict.found.cheapest
        }
      : null;

    var problems = Score.validateMap();
    if (problems.length) {
      // A broken map is a bug in the generator, and silence would not help.
      console.error('Connecting the Grid - the generated map has problems:');
      problems.forEach(function (problem) { console.error('  - ' + problem); });
    }

    Render.buildMap(built.rows, built.features, built.seed);
    Render.paintSeed(built.seed, state.daily, state.weekly);
    Render.paintDifficulty(state.par);
    rememberInAddressBar();
    // Readings from the last landscape would be reused by reset() otherwise.
    state.forecasts = [];
    reset();
    Render.setCursor(cursor.col, cursor.row, false);
    return built;
  }

  /* Every landscape is judged as the kind it is: the balance checks, and on
     top of them whatever its archetype promises. See js/archetypes.js. */
  function newMap(seed) {
    return install(MapGen.generate(seed, Archetypes.verdict));
  }

  /* Today's landscape: the same one for everybody, worked out from the UTC
     date rather than fetched from anywhere. */
  function newDaily(dateText) {
    return install(MapGen.daily(dateText, Archetypes.verdict));
  }

  // This week's: the same idea, by ISO week, and always a particular kind.
  function newWeekly(weekText) {
    return install(MapGen.weekly(weekText, Archetypes.verdict));
  }

  function setBlind(on) {
    state.blind = !!on;
    refresh();
  }

  /* ---------------------------------------------------------------------
     The address bar
     ---------------------------------------------------------------------
     The only thing this game remembers, and it lives in the URL rather than
     in storage: which landscape is being played. That makes a landscape
     something you can send to somebody, and costs nothing on a page that is
     just as likely to be opened off a disk as off a server.

     Both directions are guarded. Some browsers refuse replaceState on a
     file:// URL, and a game that will not start because it could not tidy
     the address bar would be a poor trade.
     ------------------------------------------------------------------- */

  function readAddressBar() {
    try {
      var query = String(location.search || '');
      if (/[?&]daily(=|&|$)/.test(query)) { return { daily: true }; }
      if (/[?&]weekly(=|&|$)/.test(query)) { return { weekly: true }; }
      var found = /[?&]seed=([A-Za-z0-9]+)/.exec(query);
      return found ? { seed: found[1].toUpperCase() } : null;
    } catch (ignored) {
      return null;
    }
  }

  function rememberInAddressBar() {
    try {
      if (!history.replaceState) { return; }
      history.replaceState(null, '', state.daily ? '?daily'
        : state.weekly ? '?weekly' : '?seed=' + encodeURIComponent(state.seed));
    } catch (ignored) {
      /* file:// in some browsers. The game plays on regardless; only the
         shareable link is lost, and the seed is still on screen. */
    }
  }

  /* ---------------------------------------------------------------------
     The best route found
     ---------------------------------------------------------------------
     Offered once the game is over, and only then. Shown before the player
     has finished it would be an answer key; shown afterwards it is the one
     thing the game could always have said and never did - here is what this
     landscape had in it.

     Traced rather than stored, because the search that found the SCORE runs
     while the map is being generated and the route it took is not worth
     carrying around on the chance that somebody asks. Nothing is drawn
     unless the traced route scores exactly what the search said the best
     route scores: a corridor that does not add up would be worse than no
     corridor at all.
     ------------------------------------------------------------------- */

  function showBestRoute() {
    if (!state.par || !state.par.allRound) { return null; }

    var chain = Balance.traceBest(Score.mapRows(), state.par.allRound.packed);
    if (!chain || !chain.length) { return null; }

    // The traced cells carry their ground and technology; the piece joining
    // each to the next is worked out the same way a laid span's is.
    var route = chain.map(function (cell, index) {
      var before = chain[index - 1];
      var after = chain[index + 1];
      var into = before ? directionBetween(cell, before) : CFG.start.entry;
      var outOf = after ? directionBetween(cell, after) : CFG.end.exit;
      var piece = pieceJoining(into, outOf);

      return {
        col: cell.col,
        row: cell.row,
        pieceId: piece ? piece.id : null,
        techId: cell.techId,
        typeId: cell.typeId
      };
    });

    // Does it add up? If not, say nothing rather than say something wrong.
    var scored = Score.scoreRoute(route);
    var want = state.par.allRound.dials;
    if (scored.dials.cost !== want.cost ||
        scored.dials.env !== want.env ||
        scored.dials.comm !== want.comm) {
      return null;
    }

    Render.paintGhostRoute(route);
    return route;
  }

  /* The finished result as plain text, on the clipboard if the browser will
     allow it and on the page to be copied by hand if it will not.

     The fallback is not a nicety. navigator.clipboard needs a secure
     context, and file:// is not one - which is a supported way to run this
     game, so the path where copying is refused is the ordinary path, not
     the exceptional one. */
  function shareResult() {
    if (state.phase !== 'complete' || !state.score) { return; }

    var text = Render.shareText(state);
    Render.showShareFallback(null);

    var clipboard = typeof navigator !== 'undefined' && navigator.clipboard;
    if (!clipboard || !clipboard.writeText) {
      Render.showShareFallback(text);
      return;
    }

    clipboard.writeText(text).then(function () {
      say(CFG.copy.verdictShareCopied, 'success');
    }, function () {
      Render.showShareFallback(text);
    });
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
        state.message = fill(copy.statusWrongEndPiece, {
          side: sideName(OPPOSITE[CFG.end.exit])
        });
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
    // Worked out here rather than asked for by render.js, which decides no
    // rules and would have to know what a legal span is to ask.
    state.preview = previewSpan();
    state.moods = moodsFor();
    Render.paint(state);
    Guidance.paint(state);
    SummaryPanel.paint(state);
    Render.setCursor(cursor.col, cursor.row, false);
  }

  /* ---------------------------------------------------------------------
     Input
     ---------------------------------------------------------------------
     Four ways to say the same thing, and they all end at stepTo().
     ------------------------------------------------------------------- */

  function onCellActivate(col, row) {
    if (!state.target) { return say(CFG.copy.errComplete, 'error'); }

    // Clicking the square ahead of the line sends the line to it.
    var exit = exitTowards(col, row);
    if (exit) { return stepTo(col, row); }

    /* Clicking the highlighted square itself carries straight on, which is
       what a long run of straights wants: one click per square, no aiming.
       Only if straight ahead is actually open - otherwise the line would
       silently turn a corner nobody asked for. */
    if (col === state.target.col && row === state.target.row) {
      var onwards = neighbour(col, row, OPPOSITE[state.needSide]);
      var ahead = exitTowards(onwards.col, onwards.row);
      if (ahead && ahead.ok) { return stepTo(onwards.col, onwards.row); }
      return say(CFG.copy.errNoStraight, 'error');
    }

    return say(CFG.copy.errWrongSquare, 'error');
  }

  function onCellFocus(col, row) {
    cursor = { col: col, row: row };
  }

  /* Dragging draws the line, and dragging back over it rubs it out.

     A drag may only start on the square the next piece goes on, or on the
     end of the line - anywhere else and it is a stray gesture, not a
     drawing one. Squares the line cannot reach are ignored in silence: one
     drag crosses a lot of them and a complaint about each would fire the
     live region dozens of times over. */
  function canStartDrag(col, row) {
    if (state.target && state.target.col === col && state.target.row === row) { return true; }
    var last = head();
    return !!last && last.col === col && last.row === row;
  }

  function onDragOver(col, row) {
    var exit = exitTowards(col, row);
    if (exit && exit.ok) { stepTo(col, row); return; }

    /* Dragging back over the line rubs it out - unless spans cannot come
       down, in which case say nothing. undo() would refuse, politely, on
       every pointer move of a backward drag, and fire the live region
       dozens of times to do it. A drag that cannot rub out should simply
       not rub out. */
    if (!CFG.rules.allowUndo) { return; }

    var backOne = state.route[state.route.length - 2];
    if (backOne && backOne.col === col && backOne.row === row) { undo(); }
  }

  var ARROWS = {
    ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w'
  };

  /* Arrow keys walk the cursor around the map - except on the highlighted
     square, where an arrow pointing somewhere the line can go lays it.

     That exception is what makes the game playable from the keyboard at the
     same speed as with a mouse: arrow, arrow, arrow draws a route. And it
     cannot trap anybody, because the way the line came in is never a legal
     way out, so there is always at least one direction that still just
     moves the cursor. */
  function onBoardKeyDown(event) {
    var side = ARROWS[event.key];

    if (side) {
      event.preventDefault();
      var onTarget = state.target &&
        cursor.col === state.target.col && cursor.row === state.target.row;

      // Shift looks before it builds.
      if (onTarget && event.shiftKey) {
        lookAhead(side);
        return;
      }

      if (onTarget) {
        var to = neighbour(cursor.col, cursor.row, side);
        var exit = exitTowards(to.col, to.row);
        if (exit && exit.ok) {
          stepTo(to.col, to.row);
          // Follow the line, so the next arrow carries straight on drawing.
          if (state.target) { cursor = { col: state.target.col, row: state.target.row }; }
          Render.setCursor(cursor.col, cursor.row, true);
          return;
        }
      }

      var step = STEP[side];
      cursor = {
        col: Math.min(CFG.grid.cols - 1, Math.max(0, cursor.col + step[0])),
        row: Math.min(CFG.grid.rows - 1, Math.max(0, cursor.row + step[1]))
      };
      Render.setCursor(cursor.col, cursor.row, true);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      cursor.col = event.key === 'Home' ? 0 : CFG.grid.cols - 1;
      Render.setCursor(cursor.col, cursor.row, true);
    }
  }

  // 1, 2 and 3 pick a technology from anywhere on the page; E explains.
  function onShortcut(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) { return; }
    if (event.key === 'Escape') { Render.hideTip(); return; }

    var field = event.target && event.target.tagName;
    if (field === 'INPUT' || field === 'TEXTAREA') { return; }

    if (event.key === 'e' || event.key === 'E') { explainLast(); return; }

    var index = ['1', '2', '3'].indexOf(event.key);
    if (index === -1 || index >= CFG.technologies.length) { return; }
    setTech(CFG.technologies[index].id);
  }

  /* ---------------------------------------------------------------------
     Start up
     ------------------------------------------------------------------- */

  function init() {
    Render.cacheElements({
      title: 'gameTitle',
      boardWrap: 'boardWrap',
      art: 'art',
      board: 'board',
      chevrons: 'chevrons',
      tip: 'tip',
      status: 'status',
      legend: 'legend',
      legendHeading: 'legendHeading',
      techHeading: 'techHeading',
      techHint: 'techHint',
      tech: 'tech',
      dialsHeading: 'dialsHeading',
      meters: 'meters',
      undo: 'undoButton',
      reset: 'resetButton',
      newMap: 'newMapButton',
      seedLabel: 'seedLabel',
      seedValue: 'seedValue',
      difficulty: 'difficulty',
      committedToggle: 'committedToggle',
      committedLabel: 'committedLabel',
      committedHint: 'committedHint',
      seedForm: 'seedForm',
      seedInput: 'seedInput',
      seedGo: 'seedGo',
      daily: 'dailyButton',
      instructionsTab: 'instructionsTab',
      instructionsDialog: 'instructionsDialog',
      instructionsHeading: 'instructionsHeading',
      instructionsBody: 'instructionsBody',
      instructionsLead: 'instructionsLead',
      instructionsClose: 'instructionsClose',
      verdictClose: 'verdictClose',
      verdictAgain: 'verdictAgain',
      verdictBest: 'verdictBest',
      verdictShare: 'verdictShare',
      verdictShareBox: 'verdictShareBox',
      verdictShareHint: 'verdictShareHint',
      verdictShareText: 'verdictShareText',
      verdictPar: 'verdictPar',
      verdictDialog: 'verdictDialog',
      verdictHeading: 'verdictHeading',
      verdictTitle: 'verdictTitle',
      verdictBody: 'verdictBody'
    });

    Render.paintStaticCopy();
    Render.buildBoard(Render.elements.board, {
      onActivate: onCellActivate,
      onFocus: onCellFocus,
      onStep: stepTo,
      canStartDrag: canStartDrag,
      onDragOver: onDragOver
    });
    Render.buildTechPicker(Render.elements.tech, setTech);
    Render.buildMeters(Render.elements.meters);
    Render.buildLegend(Render.elements.legend);
    Render.buildInstructions(Render.elements.instructionsBody);

    // After the meters, the technology buttons and the legend: it dresses them.
    Guidance.build({ onExplain: explainLast, onExplainDial: explainDial });
    Tour.init({
      // Back to the map, on the square in play, when the tour is over.
      onFinish: function () { Render.setCursor(cursor.col, cursor.row, true); }
    });
    // Before the first landscape is installed, which is its first paint.
    SummaryPanel.build({ onBlind: setBlind, onWeekly: function () { newWeekly(); } });

    Render.elements.board.addEventListener('keydown', onBoardKeyDown);
    document.addEventListener('keydown', onShortcut);
    Render.elements.undo.addEventListener('click', function () { undo(); });
    Render.elements.reset.addEventListener('click', function () { reset(); });
    Render.elements.newMap.addEventListener('click', function () { newMap(); });

    /* Committed mode. The rule was always there and always respected - it
       simply had no way of being switched on. */
    if (Render.elements.committedToggle) {
      Render.elements.committedToggle.checked = !CFG.rules.allowUndo;
      Render.elements.committedToggle.addEventListener('change', function (event) {
        CFG.rules.allowUndo = !event.target.checked;
        refresh();
      });
    }

    if (Render.elements.daily) {
      Render.elements.daily.addEventListener('click', function () { newDaily(); });
    }

    /* Typing a landscape's name plays that landscape. The generator has
       always honoured an explicit seed exactly; until now nothing ever
       handed it one. */
    if (Render.elements.seedForm) {
      Render.elements.seedForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var asked = String(Render.elements.seedInput.value || '').trim().toUpperCase();
        if (!asked) { return say(CFG.copy.errSeedEmpty, 'error'); }
        Render.elements.seedInput.value = '';
        newMap(asked);
      });
    }

    if (Render.elements.verdictShare) {
      Render.elements.verdictShare.addEventListener('click', function () {
        shareResult();
      });
    }
    Render.elements.instructionsTab.addEventListener('click', function () {
      Render.openDialog(Render.elements.instructionsDialog);
    });

    /* The verdict used to be a dead end with nothing on it but Close. This
       is the button that closes the loop. */
    if (Render.elements.verdictAgain) {
      Render.elements.verdictAgain.addEventListener('click', function () {
        Render.closeDialog(Render.elements.verdictDialog);
        newMap();
      });
    }

    if (Render.elements.verdictBest) {
      Render.elements.verdictBest.addEventListener('click', function () {
        Render.closeDialog(Render.elements.verdictDialog);
        var shown = showBestRoute();
        say(shown ? CFG.copy.verdictBestShown : CFG.copy.verdictBestMissing,
            shown ? 'info' : 'warning');
      });
    }

    /* What to open with. A named landscape or today's, if the address bar
       asks for one; otherwise a fresh roll, as before. */
    var asked = readAddressBar();
    if (asked && asked.daily) { newDaily(); }
    else if (asked && asked.weekly) { newWeekly(); }
    else if (asked && asked.seed) { newMap(asked.seed); }
    else { newMap(); }

    /* The tour opens by itself only when the game was opened without a
       landscape named in the address. That is the nearest thing to "first
       time" a game that stores nothing can know: the address gains a seed
       as soon as a landscape is in play, so a reload, a shared link and
       today's landscape all go straight to the map. The Tour button opens
       it any time. */
    if (!asked) { Tour.start(); }
  }

  return {
    init: init,
    newMap: newMap,
    stepTo: stepTo,
    explainLast: explainLast,
    explainDial: explainDial,
    lookAhead: lookAhead,
    previewSpan: previewSpan,
    place: place,
    setTech: setTech,
    undo: undo,
    reset: reset,
    state: state
  };

}(CONFIG, Score, Render, MapGen, Balance, Foresight, Advice, Guidance, Tour,
  Archetypes, SummaryPanel));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Game.init);
} else {
  Game.init();
}
