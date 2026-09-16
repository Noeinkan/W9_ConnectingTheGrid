/* =========================================================================
   Connecting the Grid - building a span with 1, 2 or 3
   =========================================================================

   Rest the mouse on a square the line can go into next and three numbered
   buttons appear inside it: 1, 2 and 3, one per technology. Clicking one
   sends the line that way on that technology - the direction and the
   technology in a single click, where the arrows and the rail take two.

   What the click builds is the span on the highlighted square, because
   that is the square a piece is laid on whichever way the line then goes.
   So the buttons read that square, not the one they sit in: a technology
   not allowed on the highlighted square is struck through, and the one
   that suits it is starred, as on its land card.

   The buttons run across the square, at right angles to the arrow that
   points into it. The arrow reaches a little way over the square's edge,
   and a row running the other way would sit on it.

   Mouse only. A finger has no hover, and on the map it is drawing. And like
   the arrows, hidden from screen readers and out of the tab order: an arrow
   key on the highlighted square already builds, and 1, 2 and 3 on the
   keyboard already choose the technology.

   Holds no game state and decides no rules: the click goes back to game.js,
   which builds or says why not.

   Exposes one global: TechPick.
   ========================================================================= */

var TechPick = (function (CFG, Score, Advice, Render) {
  'use strict';

  var els = {};
  var keys = {};         // technology id -> its button
  var onBuild = null;
  var painted = null;    // the state last painted
  var pointer = null;    // where the mouse last was over the map, or null
  var onKeys = false;    // is it over the buttons themselves?
  var mouseLed = false;  // was the mouse, not the keyboard, used last?
  var shownOn = null;    // the way out whose square the buttons are in
  var keysAt = null;     // that square, kept after the buttons hide

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  /* ---------------------------------------------------------------------
     Built once
     ------------------------------------------------------------------- */

  function build(callbacks) {
    onBuild = callbacks && callbacks.onBuild;
    els.wrap = document.getElementById('boardWrap');
    els.board = document.getElementById('board');
    els.layer = document.getElementById('techpick');
    if (!els.wrap || !els.board || !els.layer) { return; }

    els.layer.innerHTML = '';
    els.layer.hidden = true;

    // The strip behind the buttons: it keeps the gaps between them part of
    // the same hover, so the buttons do not blink out on the way across.
    var back = document.createElement('span');
    back.className = 'techpick-back';
    els.layer.appendChild(back);

    CFG.technologies.forEach(function (tech, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'techpick-key tech-' + tech.id;
      button.tabIndex = -1;
      button.textContent = String(index + 1);
      button.style.setProperty('--i', index - (CFG.technologies.length - 1) / 2);

      // Pressing must not move focus off the map, where the keyboard cursor is.
      button.addEventListener('mousedown', function (event) { event.preventDefault(); });
      button.addEventListener('click', function () {
        if (onBuild && shownOn) { onBuild(shownOn.to.col, shownOn.to.row, tech.id); }
      });

      els.layer.appendChild(button);
      keys[tech.id] = button;
    });

    els.wrap.addEventListener('pointermove', track);
    els.wrap.addEventListener('pointerup', track);
    els.wrap.addEventListener('pointerleave', function () {
      pointer = null;
      onKeys = false;
      place();
    });

    /* render.js keeps the land card up when the pointer leaves the board
       for the buttons, since they sit on the square it describes. This puts
       it away when the pointer leaves them for anywhere but a square, which
       shows its own. */
    els.layer.addEventListener('mouseleave', function (event) {
      var to = event.relatedTarget;
      if (!to || !els.board.contains(to)) { Render.hideTip(); }
    });

    // Typing hands the land card back to the keyboard cursor; see paint().
    document.addEventListener('keydown', function () { mouseLed = false; });
  }

  function track(event) {
    if (event.pointerType === 'touch') { return; }
    mouseLed = true;
    // A button held down is a line being drawn: the squares ahead move
    // under the pointer, and buttons chasing them would only flicker.
    pointer = event.buttons ? null : { x: event.clientX, y: event.clientY };
    onKeys = !!pointer && els.layer.contains(event.target);
    place();
  }

  /* ---------------------------------------------------------------------
     Painted on every move
     ------------------------------------------------------------------- */

  function paint(state) {
    if (!els.layer) { return; }
    painted = state;
    place();

    /* A span built from here makes the square under the pointer the
       highlighted one, and its land card was written for a square ahead.
       Written again, for what the square is now - unless the keyboard is
       in use, when the card belongs to its cursor instead. */
    var square = mouseLed && squareUnder();
    if (square && Render.elements.tip && !Render.elements.tip.hidden) {
      Render.showTip(square.col, square.row);
    }
  }

  function place() {
    if (!els.layer) { return; }
    // The ways out are made afresh on every move, so a repaint always dresses again.
    var exit = exitInto(squareUnder());

    if (exit !== shownOn) {
      shownOn = exit;
      if (exit) {
        keysAt = exit.to;
        dress(exit);
      }
    }
    els.layer.hidden = !shownOn;
  }

  // The buttons, for the square this way out leads into.
  function dress(exit) {
    var target = painted.target;
    var typeId = Score.typeIdAt(target.col, target.row);
    var type = CFG.cellTypes[typeId];
    var beside = !!type && type.passable && Score.besideHomes(target.col, target.row);
    var pick = type && (beside && type.pickBeside ? type.pickBeside : type.pick);
    var ground = type
      ? (beside ? fill(CFG.copy.besideHomesLabel, { terrain: type.label }) : type.label).toLowerCase()
      : '';

    els.layer.dataset.axis = exit.dir === 'n' || exit.dir === 's' ? 'across' : 'down';
    els.layer.style.setProperty('--x', exit.to.col + 0.5);
    els.layer.style.setProperty('--y', exit.to.row + 0.5);

    // Where the line would be stuck, the buttons are dashed like the arrow.
    var trap = Advice.trapOf(painted, exit);
    els.layer.classList.toggle('is-trap', !!trap && trap !== 'finish');

    CFG.technologies.forEach(function (tech, index) {
      var button = keys[tech.id];
      var span = typeId ? Advice.spanOn(typeId, tech.id, beside) : { banned: true };

      button.classList.toggle('is-chosen', painted.currentTech === tech.id);
      button.classList.toggle('is-banned', !!span.banned);
      button.classList.toggle('is-pick', !span.banned && pick === tech.id);
      button.title = fill(span.banned ? CFG.copy.techPickBanned : CFG.copy.techPickTitle, {
        key: index + 1,
        tech: tech.label,
        side: CFG.copy.sides[exit.dir],
        terrain: ground,
        effect: span.banned ? '' : fill(CFG.copy.techEffect, span)
      });
    });
  }

  /* ---------------------------------------------------------------------
     Which square
     ------------------------------------------------------------------- */

  /* Over the buttons, the square is the one they are in. On a small map
     they can reach past its edge, and the square under the pointer would
     then be a neighbour's. After a build they stay put until the mouse
     moves, which is why the square is kept rather than the buttons. */
  function squareUnder() {
    return onKeys && keysAt ? keysAt : hoveredSquare();
  }

  // The square under the mouse, from the board's rectangle like the
  // dragging in render.js, so an arrow in the way still counts as the square.
  function hoveredSquare() {
    if (!pointer || !els.board) { return null; }
    var box = els.board.getBoundingClientRect();
    if (!box.width || !box.height) { return null; }
    var col = Math.floor((pointer.x - box.left) / (box.width / CFG.grid.cols));
    var row = Math.floor((pointer.y - box.top) / (box.height / CFG.grid.rows));
    if (col < 0 || col >= CFG.grid.cols || row < 0 || row >= CFG.grid.rows) { return null; }
    return { col: col, row: row };
  }

  /* The way out that leads into this square, if there is one. Not a square
     the line already crosses: clicking one of those takes the line back to
     it, and numbers appearing on the line would say otherwise. */
  function exitInto(square) {
    if (!square || !painted || !painted.target) { return null; }
    for (var i = 0; i < painted.exits.length; i++) {
      var exit = painted.exits[i];
      if (exit.to.col !== square.col || exit.to.row !== square.row) { continue; }
      var onLine = painted.route.some(function (span) {
        return span.col === square.col && span.row === square.row;
      });
      return onLine ? null : exit;
    }
    return null;
  }

  return {
    build: build,
    paint: paint
  };

}(CONFIG, Score, Advice, Render));
