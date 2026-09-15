/* =========================================================================
   Connecting the Grid - the route summary, Blind mode and the kind of
   landscape, on the page
   =========================================================================

   Paints three things game.js hands over on the state, and wires the two
   controls that change them. Like render.js it holds no game state and
   decides no rules: the facts come from js/summary.js, the kind of
   landscape from js/archetypes.js, and whether Blind mode is on from
   state.blind, which only game.js sets.

   Blind mode is almost entirely CSS. This file puts `data-blind` on the
   app shell while the score is being held back, and css/summary.css (and
   css/guidance.css, for the forecast) hide every reading of the score under
   that attribute. The one reading it cannot hide with a stylesheet is its
   own sentence about which dial holds the verdict back, so that is simply
   not written while blind.

   Exposes one global: SummaryPanel.
   ========================================================================= */

var SummaryPanel = (function (CFG, Summary, Archetypes) {
  'use strict';

  var els = {};

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function setText(node, text) { if (node) { node.textContent = text; } }

  /* ---------------------------------------------------------------------
     Wiring, once
     ------------------------------------------------------------------- */

  /* handlers: { onBlind(boolean), onWeekly() }, both game.js's. */
  function build(handlers) {
    ['summaryHeading', 'summary', 'blindToggle', 'blindLabel', 'blindHint',
     'blindNote', 'weeklyButton', 'archetype', 'blindSwitch', 'committedSwitch'].forEach(function (id) {
      els[id] = document.getElementById(id);
    });
    els.app = document.querySelector('.app');

    var copy = CFG.copy;
    setText(els.blindLabel, copy.blindLabel);
    setText(els.blindHint, copy.blindHint);
    setText(els.blindNote, copy.blindMeters);
    setText(els.weeklyButton, copy.weeklyButton);

    /* The two switches share a row, so their explanations are no longer
       printed under them. A screen reader gets each through
       aria-describedby, set in the markup; a pointer gets it here. */
    if (els.blindSwitch) { els.blindSwitch.title = copy.blindHint; }
    if (els.committedSwitch) { els.committedSwitch.title = copy.committedHint; }

    if (els.summaryHeading) {
      els.summaryHeading.textContent = '';
      els.summaryHeading.appendChild(el('span', 'summary-title', copy.summaryHeading));
      els.summaryLine = el('span', 'summary-line');
      els.summaryHeading.appendChild(els.summaryLine);
    }

    if (els.blindToggle) {
      els.blindToggle.addEventListener('change', function (event) {
        handlers.onBlind(event.target.checked);
      });
    }
    if (els.weeklyButton) {
      els.weeklyButton.addEventListener('click', function () { handlers.onWeekly(); });
    }
  }

  /* ---------------------------------------------------------------------
     Painting, on every move
     ------------------------------------------------------------------- */

  /* Blind until the connection is energised, then the whole score at once -
     the verdict dialog opens on the same move, so the reveal and the
     verdict arrive together. */
  function paintBlind(state) {
    var holding = !!state.blind && state.phase !== 'complete';
    if (els.app) {
      if (holding) { els.app.setAttribute('data-blind', ''); }
      else { els.app.removeAttribute('data-blind'); }
    }
    if (els.blindToggle) { els.blindToggle.checked = !!state.blind; }
    return holding;
  }

  function paintArchetype(archetypeId) {
    var box = els.archetype;
    if (!box) { return; }
    var kind = Archetypes.describe(archetypeId);
    box.hidden = !kind;
    box.textContent = '';
    if (!kind) { return; }

    box.title = kind.hint;
    box.appendChild(el('span', 'visually-hidden', CFG.copy.archetypeLabel + ': '));
    box.appendChild(document.createTextNode(kind.label));
    // The hint is the title for a pointer, and spoken here for everybody else.
    box.appendChild(el('span', 'visually-hidden', '. ' + kind.hint));
  }

  function counts(list) {
    var dd = el('dd');
    list.forEach(function (entry) {
      dd.appendChild(el('span', 'summary-chip', entry.label + ' ' + entry.count));
    });
    return dd;
  }

  function paintSummary(state, blind) {
    var box = els.summary;
    if (!box) { return; }
    box.textContent = '';

    var dials = state.score ? state.score.dials : null;
    var facts = Summary.of(state.route, dials, state.target, state.phase);
    var copy = CFG.copy;

    // The one line that shows while the drawer is closed.
    var said = copy.summaryEmpty;
    if (facts.spans) {
      said = facts.spans === 1 ? copy.summarySpan : fill(copy.summarySpans, { n: facts.spans });
      if (facts.arrived) { said += ', ' + copy.summaryArrived; }
      else if (facts.ahead !== null) { said += ', ' + fill(copy.summaryAhead, { n: facts.ahead }); }
    }
    setText(els.summaryLine, said);
    if (!facts.spans) { return; }

    var list = el('dl', 'summary-counts');
    list.appendChild(el('dt', null, copy.summaryGround));
    list.appendChild(counts(facts.ground));
    list.appendChild(el('dt', null, copy.summaryTech));
    list.appendChild(counts(facts.tech));
    box.appendChild(list);

    // A reading of the score, so not while Blind mode is holding it back.
    if (blind || !dials) { return; }
    var holding = facts.holding;
    var reading = el('p', 'summary-holding', holding
      ? fill(copy.summaryHolding, { dial: holding.label, value: holding.value, threshold: holding.threshold })
      : fill(copy.summaryClear, { threshold: CFG.balancedThreshold }));
    reading.dataset.state = holding ? 'holding' : 'clear';
    box.appendChild(reading);
  }

  function paint(state) {
    var blind = paintBlind(state);
    paintArchetype(state.archetype);
    paintSummary(state, blind);
  }

  return {
    build: build,
    paint: paint
  };

}(CONFIG, Summary, Archetypes));
