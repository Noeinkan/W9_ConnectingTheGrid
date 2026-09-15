/* =========================================================================
   Connecting the Grid - guidance on the page
   =========================================================================

   The page half of "tell the player while they are still choosing". The
   words come from js/advice.js and the numbers from js/foresight.js via the
   state game.js hands over; this file only puts them where they are asked
   for:

     the rail        the best finish still open, and Explain last span
     the meters      a "Why?" beside any dial that has dropped
     the tech tiles  what one span on the highlighted square costs on each
     the arrows      marked when they lead somewhere the line would be stuck
     the map         a tint and a badge on every span that cost something
     the tooltip     the ground's own note, and its numbers on every tech
     the legend      what each technology does to those numbers

   Like render.js it holds no game state and decides no rules. It dresses
   elements render.js has already built rather than building its own
   copies of them, so there is still one board, one set of meters and one
   tooltip - which is why paint() must run straight after Render.paint().

   Exposes one global: Guidance.
   ========================================================================= */

var Guidance = (function (CFG, Score, Advice, Render) {
  'use strict';

  var els = {};
  var handlers = null;
  var whyParts = {};   // dial id -> { button }
  var painted = null;  // the state last painted: read by the tooltip and the Why? note
  var whyOpenFor = null;

  function byId(id) { return document.getElementById(id); }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  function blind() { return !!(painted && painted.blind); }

  /* ---------------------------------------------------------------------
     Built once
     ------------------------------------------------------------------- */

  function build(callbacks) {
    handlers = callbacks || {};
    var copy = CFG.copy;

    els.app = document.querySelector('.app');
    els.boardWrap = byId('boardWrap');
    els.board = byId('board');
    els.chevrons = byId('chevrons');
    els.tech = byId('tech');
    els.techHint = byId('techHint');
    els.meters = byId('meters');
    els.legend = byId('legend');
    els.forecast = byId('forecast');
    els.forecastLabel = byId('forecastLabel');
    els.forecastValue = byId('forecastValue');
    els.forecastLine = byId('forecastLine');
    els.explain = byId('explainButton');
    els.explainKey = byId('explainKey');

    if (els.forecastLabel) {
      els.forecastLabel.textContent = copy.forecastHeading;
      els.forecastLabel.title = copy.forecastHint;
    }
    if (els.explain) {
      els.explain.textContent = copy.explainButton;
      els.explain.title = copy.explainButtonLabel;
      els.explain.setAttribute('aria-label', copy.explainButtonLabel);
      els.explain.setAttribute('aria-keyshortcuts', 'E');
      els.explain.addEventListener('click', function () {
        if (handlers.onExplain) { handlers.onExplain(); }
      });
    }
    // Room was short; the key is on the button's label and in the tour instead.
    if (els.explainKey) { els.explainKey.hidden = true; }

    buildWhy();
    buildLegendNote();

    /* The tooltip is render.js's. It calls back here once it has written
       the ground's name and numbers, so what this file adds lands in the
       same box instead of a second one competing with it. */
    if (Render.decorateTip) { Render.decorateTip(decorateTip); }
  }

  /* One "Why?" per meter, inside its label, and one shared note for all
     three - positioned against the page rather than inside the rail, which
     scrolls on a short screen and would clip it. */
  function buildWhy() {
    if (!els.meters) { return; }
    var rows = els.meters.querySelectorAll('.meter');

    CFG.dials.forEach(function (dial, index) {
      var row = rows[index];
      var label = row && row.querySelector('.meter-label');
      if (!label) { return; }

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'meter-why';
      button.textContent = CFG.copy.meterWhy;
      button.hidden = true;
      button.setAttribute('aria-describedby', 'whyNote');

      button.addEventListener('mouseenter', function () { showWhy(dial.id, button); });
      button.addEventListener('focus', function () { showWhy(dial.id, button); });
      button.addEventListener('mouseleave', hideWhy);
      button.addEventListener('blur', hideWhy);
      button.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { hideWhy(); }
      });
      // Clicking says it out loud too, through the status line.
      button.addEventListener('click', function () {
        showWhy(dial.id, button);
        if (handlers.onExplainDial) { handlers.onExplainDial(dial.id); }
      });

      label.appendChild(button);
      whyParts[dial.id] = { button: button };
    });

    els.why = document.createElement('div');
    els.why.className = 'why-note';
    els.why.id = 'whyNote';
    els.why.setAttribute('role', 'tooltip');
    els.why.hidden = true;
    document.body.appendChild(els.why);
  }

  function showWhy(dialId, button) {
    if (!painted || !painted.score || blind()) { return; }
    whyOpenFor = { dialId: dialId, button: button };

    var why = Advice.whyDial(dialId, painted.route, painted.score.dials[dialId]);
    var note = els.why;
    note.innerHTML = '';

    var heading = document.createElement('strong');
    heading.textContent = why.heading;
    note.appendChild(heading);

    if (why.empty) {
      var none = document.createElement('p');
      none.textContent = why.empty;
      note.appendChild(none);
    } else {
      var list = document.createElement('ul');
      why.items.forEach(function (text) {
        var item = document.createElement('li');
        item.textContent = text;
        list.appendChild(item);
      });
      note.appendChild(list);
      if (why.more) {
        var more = document.createElement('p');
        more.textContent = why.more;
        note.appendChild(more);
      }
    }
    if (why.hint) {
      var hint = document.createElement('p');
      hint.className = 'why-hint';
      hint.textContent = why.hint;
      note.appendChild(hint);
    }

    note.hidden = false;
    placeBeside(note, button);
  }

  function hideWhy() {
    whyOpenFor = null;
    if (els.why) { els.why.hidden = true; }
  }

  // Beside the rail if there is room, otherwise under the button; always on screen.
  function placeBeside(note, anchor) {
    var box = anchor.getBoundingClientRect();
    var rail = anchor.closest('.rail');
    var railBox = rail ? rail.getBoundingClientRect() : box;
    var width = note.offsetWidth;
    var height = note.offsetHeight;
    var margin = 10;

    var left = railBox.right + margin;
    var top = box.top - 8;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, Math.min(box.left, window.innerWidth - width - margin));
      top = box.bottom + 6;
      if (top + height > window.innerHeight - margin) { top = box.top - height - 6; }
    }
    note.style.left = Math.round(left) + 'px';
    note.style.top = Math.round(Math.max(margin, Math.min(top, window.innerHeight - height - margin))) + 'px';
  }

  /* What technology does to the numbers, under the legend's own table -
     worked out from CONFIG.technologies, so a rebalance cannot leave the
     sentence behind. */
  function buildLegendNote() {
    if (!els.legend || !els.legend.parentNode) { return; }
    var note = document.createElement('p');
    note.className = 'legend-note legend-tech';

    var lines = CFG.technologies.map(function (tech) {
      var line = fill(CFG.copy.legendTech, { tech: tech.short, cost: tech.costMult, impact: tech.impactMult });
      if (tech.bansTerrain.length) {
        line += ', ' + fill(CFG.copy.legendTechBans, {
          terrain: tech.bansTerrain.map(function (id) { return CFG.cellTypes[id].label.toLowerCase(); }).join(', ')
        });
      }
      return line;
    });
    note.textContent = lines.join('. ') + '. ' + CFG.copy.legendTechFixed;
    els.legend.parentNode.insertBefore(note, els.legend.nextSibling);
  }

  /* ---------------------------------------------------------------------
     Painted on every move
     ------------------------------------------------------------------- */

  function paint(state) {
    painted = state;
    paintForecast(state);
    paintWhy(state);
    paintTechEffects(state);
    paintTraps(state);
    paintMoods(state);
    if (whyOpenFor) { showWhy(whyOpenFor.dialId, whyOpenFor.button); }
  }

  function paintForecast(state) {
    if (!els.forecast) { return; }
    var reading = Advice.forecastLine(state.forecast);
    els.forecast.hidden = !reading;
    if (!reading) { return; }

    els.forecast.dataset.tone = reading.tone;
    els.forecastValue.textContent = reading.value;
    els.forecastLine.textContent = reading.line;
    // Read as one sentence rather than a label, a number and a line apart.
    els.forecast.setAttribute('aria-label', fill(CFG.copy.forecastSpoken, {
      weakest: reading.value, line: reading.line
    }));

    if (els.explain) { els.explain.disabled = state.route.length === 0; }

    /* The pulsing ring on the square in play takes the outlook's colour, so
       a line heading into trouble looks it at the point where the next
       decision is being made. */
    if (els.boardWrap) {
      if (blind()) { els.boardWrap.removeAttribute('data-outlook'); }
      else { els.boardWrap.dataset.outlook = reading.tone; }
    }
  }

  function paintWhy(state) {
    CFG.dials.forEach(function (dial) {
      var part = whyParts[dial.id];
      if (!part) { return; }
      var value = state.score ? state.score.dials[dial.id] : 100;
      part.button.hidden = value >= 100 || blind();
      part.button.setAttribute('aria-label', fill(CFG.copy.meterWhyLabel, {
        dial: dial.label.toLowerCase(), value: value
      }));
    });
    if (whyOpenFor && whyParts[whyOpenFor.dialId].button.hidden) { hideWhy(); }
  }

  /* The numbers on each technology button are for the highlighted square:
     the one place a technology choice is about to be spent. */
  function paintTechEffects(state) {
    if (!els.tech) { return; }
    var typeId = state.target ? Score.typeIdAt(state.target.col, state.target.row) : null;
    var type = typeId ? CFG.cellTypes[typeId] : null;
    var live = !!type && type.passable;

    Array.prototype.forEach.call(els.tech.querySelectorAll('.tech[data-tech]'), function (button) {
      var techId = button.dataset.tech;
      var tech = Score.technology(techId);
      if (!button.dataset.baseLabel) {
        button.dataset.baseLabel = button.getAttribute('aria-label') || tech.label;
      }

      var effect = button.querySelector('.tech-effect');
      if (!effect) {
        effect = document.createElement('span');
        effect.className = 'tech-effect';
        effect.setAttribute('aria-hidden', 'true');
        button.appendChild(effect);
      }

      if (!live) {
        effect.textContent = '';
        button.classList.remove('is-banned-here');
        button.setAttribute('aria-label', button.dataset.baseLabel);
        return;
      }

      var span = Advice.spanOn(typeId, techId);
      button.classList.toggle('is-banned-here', span.banned);
      effect.textContent = span.banned
        ? CFG.copy.techBanned
        : fill(CFG.copy.techEffect, span);
      button.setAttribute('aria-label', (span.banned
        ? fill(CFG.copy.techBannedSpoken, { tech: tech.label, terrain: type.label.toLowerCase() })
        : fill(CFG.copy.techEffectSpoken, {
            tech: tech.label, terrain: type.label.toLowerCase(),
            cost: span.cost, env: span.env, comm: span.comm
          })) + ' ' + tech.description);
    });

    if (els.techHint) {
      els.techHint.textContent = live
        ? fill(CFG.copy.techHintOn, { terrain: type.label.toLowerCase() })
        : CFG.copy.techHint;
    }
  }

  // Arrows are rebuilt by render.js on every paint, in the order of state.exits.
  function chevronFor(state, exit, index) {
    if (!els.chevrons) { return null; }
    var marked = els.chevrons.querySelector('.chevron[data-dir="' + exit.dir + '"]');
    if (marked) { return marked; }
    var all = els.chevrons.querySelectorAll('.chevron');
    return all.length === state.exits.length ? all[index] : null;
  }

  function paintTraps(state) {
    (state.exits || []).forEach(function (exit, index) {
      var button = chevronFor(state, exit, index);
      if (!button || !exit.ok) { return; }
      var trap = Advice.trapOf(state, exit);
      var stuck = trap && trap !== 'finish';
      button.classList.toggle('is-trap', !!stuck);
      if (stuck) {
        button.title = fill(CFG.copy.chevronTrapLabel, {
          side: CFG.copy.sides[exit.dir], what: Advice.trapWords(trap)
        });
      }
    });
  }

  /* A tint and a badge on each span that cost something it cannot get
     back. The badge carries the number, so the warning is never carried by
     colour alone, and the cell's own label says it in words. */
  function paintMoods(state) {
    if (!els.board) { return; }
    var cells = els.board.querySelectorAll('.cell');
    var cols = CFG.grid.cols;

    Array.prototype.forEach.call(cells, function (cell) {
      cell.removeAttribute('data-mood');
      cell.removeAttribute('data-badge');
    });
    if (blind()) { return; }

    state.route.forEach(function (segment, index) {
      var mood = state.moods && state.moods[index];
      if (!mood || mood.kind === 'kept') { return; }
      var cell = cells[segment.row * cols + segment.col];
      if (!cell) { return; }
      cell.dataset.mood = mood.kind;
      cell.dataset.badge = Advice.moodBadge(mood);
      var note = Advice.routeMoodNote(mood);
      if (note) { cell.setAttribute('aria-label', cell.getAttribute('aria-label') + ' ' + note); }
    });
  }

  /* ---------------------------------------------------------------------
     The tooltip, and looking down an arrow
     ------------------------------------------------------------------- */

  function decorateTip(tip, col, row) {
    var typeId = Score.typeIdAt(col, row);
    var type = typeId && CFG.cellTypes[typeId];
    if (!type) { return; }

    if (type.tip) {
      var note = document.createElement('span');
      note.className = 'tip-note';
      note.textContent = type.tip;
      tip.appendChild(note);
    }

    if (type.passable) {
      var table = document.createElement('span');
      table.className = 'tip-techs';
      CFG.technologies.forEach(function (tech) {
        var span = Advice.spanOn(typeId, tech.id);
        var name = document.createElement('span');
        name.className = 'tip-tech-name';
        name.textContent = tech.short;
        var nums = document.createElement('span');
        nums.className = 'tip-tech-nums';
        nums.textContent = span.banned ? CFG.copy.tipTechBanned : fill(CFG.copy.techEffect, span);
        if (painted && painted.currentTech === tech.id) {
          name.classList.add('is-chosen');
          nums.classList.add('is-chosen');
        }
        table.appendChild(name);
        table.appendChild(nums);
      });
      tip.appendChild(table);
    }

    // On a span already built: what it cost of the best finish.
    if (painted && !blind()) {
      painted.route.forEach(function (segment, index) {
        if (segment.col !== col || segment.row !== row) { return; }
        var said = Advice.routeMoodNote(painted.moods && painted.moods[index]);
        if (!said) { return; }
        var mood = document.createElement('span');
        mood.className = 'tip-mood';
        mood.textContent = said;
        tip.appendChild(mood);
      });
    }

    /* The box is taller than render.js sized its placement for, so it drops
       below the square for the top few rows instead of only the first two. */
    if (row <= 3) {
      tip.setAttribute('data-below', '');
      tip.style.setProperty('--cy', row + 1);
    }
  }

  // Shift + arrow: mark the arrow being looked down, and show what is there.
  function showLook(state, exit) {
    var index = (state.exits || []).indexOf(exit);
    var button = chevronFor(state, exit, index);
    if (button) { button.classList.add('is-looking'); }

    var to = exit.to;
    var onMap = to.col >= 0 && to.col < CFG.grid.cols && to.row >= 0 && to.row < CFG.grid.rows;
    if (onMap && Render.showTip) { Render.showTip(to.col, to.row); }
  }

  window.addEventListener('resize', hideWhy);

  return {
    build: build,
    paint: paint,
    showLook: showLook
  };

}(CONFIG, Score, Advice, Render));
