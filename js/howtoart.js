/* =========================================================================
   Connecting the Grid - the How to play pictures
   =========================================================================

   The pictures on the How to play sheet: small pieces of map with a line
   being built across them, the meters, the technology buttons, the modes.

   They are drawn with the game's own code wherever there is some to use -
   pieces of map from js/howtoboard.js, which draws them with the map's and
   the route's own code, and the numbers from js/score.js and js/advice.js -
   and styled by the same classes as the real thing. A picture drawn on its
   own would drift from the game the first time either changed; these
   follow it.

   Each picture is handed back as { el, frames, still, show(i) }: the
   element, how many frames its loop has, the frame to hold when motion is
   reduced, and a function that paints one frame. js/howto.js decides when
   the frames change. Every picture is hidden from screen readers: the words
   beside it on the sheet say everything it shows.

   Exposes one global: HowToArt.
   ========================================================================= */

var HowToArt = (function (CFG, Score, Advice, HowToBoard) {
  'use strict';

  var board = HowToBoard.board;

  /* ---------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  function put(parent, tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return parent ? parent.appendChild(node) : node;
  }

  function labels() { return CFG.copy.howTo.labels; }

  // A run of squares along one row, from `from` up to but not including `to`.
  function along(row, from, to, techId) {
    var cells = [];
    for (var col = from; col < to; col++) { cells.push([col, row, techId]); }
    return cells;
  }

  /* Spans as js/score.js reads them: on the technology asked for, or the
     default one, unless the ground bans it - then on the first that the
     ground allows, so a picture never scores a span the game would refuse. */
  function spans(typeIds, techId) {
    return typeIds.map(function (typeId) {
      return { typeId: typeId, techId: allowedTech(typeId, techId || CFG.defaultTechnology) };
    });
  }

  function allowedTech(typeId, wanted) {
    if (Score.canUseTech(wanted, typeId)) { return wanted; }
    var allowed = CFG.technologies.filter(function (tech) { return Score.canUseTech(tech.id, typeId); });
    return allowed.length ? allowed[0].id : wanted;
  }

  // One decimal place at most, and never "-0" - as js/advice.js writes numbers.
  function num(value) {
    var rounded = Math.round(value * 10) / 10;
    return rounded === 0 ? 0 : rounded;
  }

  /* A picture that never changes. */
  function still(el) {
    return { el: el, frames: 1, still: 0, show: function () {} };
  }

  /* A picture that plays a list of frames through a paint function. */
  function storyboard(el, frames, stillAt, paint) {
    return {
      el: el,
      frames: frames.length,
      still: stillAt,
      show: function (index) { paint(frames[index % frames.length]); }
    };
  }

  /* ---------------------------------------------------------------------
     Pieces of the rail, as the rail draws them
     ------------------------------------------------------------------- */

  /* The meters, with the same markup and classes render.js gives them, so
     they are styled by the same rules. 'only' picks dials; 'threshold'
     draws the line a dial must finish above. */
  function meters(parent, options) {
    options = options || {};
    var box = put(parent, 'div', 'meters');
    var parts = {};

    CFG.dials.forEach(function (dial) {
      if (options.only && options.only.indexOf(dial.id) < 0) { return; }
      var row = put(box, 'div', 'meter');
      var name = put(row, 'span', 'meter-label', dial.label);
      var why = options.why ? put(name, 'span', 'meter-why', CFG.copy.meterWhy) : null;
      var value = put(row, 'span', 'meter-value');
      var bar = put(row, 'div', 'meter-bar');
      var preview = put(bar, 'span', 'meter-preview');
      var marker = put(bar, 'span', 'meter-marker');
      if (options.threshold) {
        var line = put(bar, 'span', 'howto-threshold');
        line.style.left = options.threshold + '%';
        line.dataset.value = options.threshold;
      }
      parts[dial.id] = { row: row, value: value, marker: marker, preview: preview, why: why };
    });

    return {
      el: box,
      parts: parts,
      set: function (dials, ahead) {
        Object.keys(parts).forEach(function (id) {
          var part = parts[id];
          part.value.textContent = dials[id];
          part.marker.style.left = dials[id] + '%';
          var shows = !!ahead && ahead[id] !== dials[id];
          part.preview.hidden = !shows;
          if (shows) {
            part.preview.style.left = ahead[id] + '%';
            part.preview.dataset.way = ahead[id] < dials[id] ? 'worse' : 'better';
          }
        });
      }
    };
  }

  function panel(className) {
    var box = put(null, 'div', 'howto-panel' + (className ? ' ' + className : ''));
    return box;
  }

  function tickBox(parent, text) {
    var label = put(parent, 'span', 'switch howto-switch');
    var box = put(label, 'span', 'howto-check');
    put(label, 'span', '', text);
    return box;
  }

  /* ---------------------------------------------------------------------
     The pictures
     ------------------------------------------------------------------- */

  // The whole game in one strip: a line built out, through a substation, and energised.
  function goal() {
    var map = board(['FWWFVTT', 'PFFXVFD']);
    map.flag(0, 1, CFG.copy.startLabel);
    map.flag(3, 1, CFG.cellTypes.substation.label);
    map.flag(6, 1, CFG.copy.endLabel);

    var frames = [];
    for (var built = 0; built < 7; built++) {
      frames.push({ route: along(1, 0, built), target: [built, 1], arrows: false });
    }
    var done = { route: along(1, 0, 7), done: true };
    frames.push(done, done, done, done);
    return storyboard(map.el, frames, 7, map.paint);
  }

  // Click an arrow, and the line goes that way; click another, and it turns.
  function step() {
    var map = board(['WWFFK', 'FFFFF', 'FTTFS']);
    var rest = [455, 265];
    var one = [[0, 1]];
    var two = [[0, 1], [1, 1]];
    var three = [[0, 1], [1, 1], [2, 1]];
    return storyboard(map.el, [
      { route: one, target: [1, 1], pointer: rest },
      { route: one, target: [1, 1], pointer: [186, 150] },
      { route: two, target: [2, 1], pointer: [186, 150, 'press'] },
      { route: two, target: [2, 1], pointer: [250, 114] },
      { route: three, target: [2, 0], pointer: [250, 114, 'press'] },
      { route: three, target: [2, 0], pointer: [250, 114] },
      { route: three, target: [2, 0], pointer: rest }
    ], 4, map.paint);
  }

  // Press on the square in play and drag: the line follows.
  function drag() {
    var map = board(['FFWWF', 'FFFFF', 'KFFTT']);
    return storyboard(map.el, [
      { route: [[0, 1]], target: [1, 1], pointer: [300, 265] },
      { route: [[0, 1]], target: [1, 1], pointer: [150, 150] },
      { route: [[0, 1]], target: [1, 1], pointer: [150, 150, 'down'] },
      { route: along(1, 0, 2), target: [2, 1], pointer: [250, 150, 'held'] },
      { route: along(1, 0, 3), target: [3, 1], pointer: [350, 150, 'held'] },
      { route: along(1, 0, 4), target: [4, 1], pointer: [450, 150, 'held'] },
      { route: along(1, 0, 4), target: [4, 1], pointer: [450, 150] },
      { route: along(1, 0, 4), target: [4, 1], pointer: [300, 265] }
    ], 5, map.paint);
  }

  // Click a square on the line: the line comes back to it, to choose again.
  function back() {
    var map = board(['FWWFF', 'FFFFF', 'FFSSF']);
    var rest = [455, 265];
    var whole = along(1, 0, 4);
    return storyboard(map.el, [
      { route: whole, target: [4, 1], pointer: rest },
      { route: whole, target: [4, 1], pointer: [150, 150] },
      { route: [[0, 1]], target: [1, 1], pointer: [150, 150, 'press'] },
      { route: [[0, 1]], target: [1, 1], pointer: [150, 114] },
      { route: along(1, 0, 2), target: [1, 0], pointer: [150, 114, 'press'] },
      { route: along(1, 0, 2), target: [1, 0], pointer: [150, 114] },
      { route: along(1, 0, 2), target: [1, 0], pointer: rest }
    ], 4, map.paint);
  }

  // A square in play with a way on, a way into water, and a way into the line.
  function trap() {
    var map = board(['FFFWW', '~FFFW', '~FFTT']);
    var route = [[0, 0], [1, 0], [2, 0], [2, 1]];
    var rest = [455, 265];
    var copy = CFG.copy;
    // Each note hangs under the arrow it is about, as the tooltip does on the map.
    var water = {
      at: [114, 150],
      text: fill(copy.chevronTrapLabel, { side: copy.sides.w, what: copy.trapWater })
    };
    var own = {
      at: [150, 114],
      text: fill(copy.chevronTrapLabel, { side: copy.sides.n, what: copy.trapUsed })
    };
    return storyboard(map.el, [
      { route: route, target: [1, 1], pointer: rest },
      { route: route, target: [1, 1], pointer: [114, 150] },
      { route: route, target: [1, 1], pointer: [114, 150], tip: water },
      { route: route, target: [1, 1], pointer: [114, 150], tip: water },
      { route: route, target: [1, 1], pointer: [150, 114] },
      { route: route, target: [1, 1], pointer: [150, 114], tip: own },
      { route: route, target: [1, 1], pointer: [150, 114], tip: own },
      { route: route, target: [1, 1], pointer: rest }
    ], 2, map.paint);
  }

  /* The three technologies, one above the other: a stretch of line built
     on it, where it is the right answer, and where it may not go.

     Where it is right is a judgement, so it is written in CONFIG
     (copy.howTo.suits); where it may not go is a rule, so it is read off
     bansTerrain. The stretch each line is drawn across is ground that
     technology suits. */
  var STRIPS = { lattice: 'FRF', tpylon: 'HSH', cable: 'TTT' };

  function techs() {
    var box = put(null, 'div', 'howto-techs');
    var suits = CFG.copy.howTo.suits || {};

    CFG.technologies.forEach(function (tech, index) {
      var row = put(box, 'div', 'howto-tech tech-' + tech.id);
      var map = board([STRIPS[tech.id] || 'FFF']);
      map.paint({ route: along(0, 0, 3, tech.id), openEnd: 'e', quiet: true });
      row.appendChild(map.el);

      var about = put(row, 'div', 'howto-tech-about');
      var name = put(about, 'p', 'howto-tech-name');
      put(name, 'span', 'tech-swatch');
      put(name, 'span', '', tech.label);
      put(name, 'kbd', 'howto-key', String(index + 1));
      if (tech.summary) { put(about, 'p', 'howto-tech-summary', tech.summary); }

      var grounds = put(row, 'ul', 'howto-grounds');
      (suits[tech.id] || []).forEach(function (ground) { groundTile(grounds, ground, 'good'); });
      (tech.bansTerrain || []).forEach(function (ground) { groundTile(grounds, ground, 'banned'); });
    });
    return still(box);
  }

  /* One kind of ground, drawn small and named. 'besideHomes' is not a kind
     of ground but a place - any square next to houses - so it is drawn as
     a square with houses beside it. */
  function groundTile(parent, ground, verdict) {
    var item = put(parent, 'li', 'howto-ground is-' + verdict);
    var letters = lettersByType();
    var tile;
    if (ground === 'besideHomes') {
      tile = board(['F' + letters.settlement]);
      tile.paint({ target: [0, 0], arrows: false });
      item.classList.add('is-double');
    } else {
      tile = board([letters[ground] || 'F']);
      tile.paint({});
    }
    item.appendChild(tile.el);
    put(item, 'span', 'howto-ground-mark', verdict === 'good' ? '✓' : '✕');
    put(item, 'span', 'howto-ground-name', ground === 'besideHomes'
      ? labels().besideHomes
      : CFG.cellTypes[ground].label);
  }

  function lettersByType() {
    var letters = {};
    Object.keys(CFG.legend).forEach(function (letter) { letters[CFG.legend[letter]] = letter; });
    return letters;
  }

  // Every kind of ground, drawn as the map draws it, with what a standard span on it costs.
  function land() {
    var said = labels();
    var box = put(null, 'div', 'howto-land');
    var standard = CFG.defaultTechnology;
    put(box, 'p', 'howto-land-key', fill(said.landKey, { tech: Score.technology(standard).label.toLowerCase() }));
    var list = put(box, 'ul', 'howto-lands');
    var letters = lettersByType();

    Object.keys(CFG.cellTypes).forEach(function (typeId) {
      var type = CFG.cellTypes[typeId];
      if (!letters[typeId]) { return; }
      var item = put(list, 'li', 'howto-tile');
      var tile = board([letters[typeId]]);
      tile.paint({});
      item.appendChild(tile.el);
      put(item, 'span', 'howto-tile-name', type.label);

      var nums = put(item, 'span', 'howto-nums');
      if (!type.passable) {
        put(nums, 'span', '', said.cannotCross).dataset.way = 'bad';
        return;
      }

      // Ground the standard line may not cross shows the figures of the one that may.
      var techId = allowedTech(typeId, standard);
      if (techId !== standard) {
        put(item, 'span', 'howto-tile-only', fill(said.onlyTech, { tech: Score.technology(techId).short }));
      }
      var span = Score.scoreSegment(typeId, techId);
      number(nums, span.cost, span.cost < 0 ? 'good' : '');
      nums.appendChild(document.createTextNode(' / '));
      number(nums, span.env, span.env < 0 ? 'bad' : '');
      nums.appendChild(document.createTextNode(' / '));
      number(nums, span.comm, span.comm < 0 ? 'bad' : (span.comm > 0 ? 'good' : ''));
    });
    return still(box);
  }

  function number(parent, value, way) {
    var shown = num(value);
    var node = put(parent, 'span', '', shown > 0 && way === 'good' ? '+' + shown : String(shown));
    if (way) { node.dataset.way = way; }
  }

  /* The technology buttons and the meters: change technology, watch the
     marks move. Over designated land, because it is where the three differ
     most: the T-pylon spares habitat, and the cable costs most and spares none. */
  function preview() {
    var box = panel('howto-preview');
    var ahead = 'sssi';
    var built = spans(['farmland', 'farmland', 'road', 'woodland', 'farmland']);
    var now = Score.scoreRoute(built).dials;

    var head = put(box, 'p', 'howto-preview-head');
    var tile = board([lettersByType()[ahead]]);
    tile.paint({ target: [0, 0], arrows: false });
    head.appendChild(tile.el);
    put(head, 'span', '', fill(labels().nextSpan, { terrain: CFG.cellTypes[ahead].label }));

    var picker = put(box, 'div', 'tech-picker');
    var buttons = CFG.technologies.map(function (tech, index) {
      var button = put(picker, 'span', 'tech tech-' + tech.id);
      put(button, 'span', 'tech-swatch');
      put(button, 'span', 'tech-name', tech.short);
      var span = Advice.spanOn(ahead, tech.id);
      put(button, 'span', 'tech-effect', span.banned ? CFG.copy.techBanned : fill(CFG.copy.techEffect, span));
      put(button, 'span', 'tech-key', String(index + 1));
      return button;
    });

    var gauges = meters(box);
    var frames = [];
    CFG.technologies.forEach(function (tech) { frames.push(tech.id, tech.id); });

    return storyboard(box, frames, 4, function (techId) {
      CFG.technologies.forEach(function (tech, index) {
        buttons[index].classList.toggle('is-chosen', tech.id === techId);
      });
      var after = Score.scoreRoute(built.concat(spans([ahead], techId))).dials;
      gauges.set(now, after);
    });
  }

  // Three dials against the line they must finish above, and the verdict they earn.
  function verdict() {
    var box = panel('howto-verdict');
    var gauges = meters(box, { threshold: CFG.balancedThreshold });
    var line = put(box, 'p', 'howto-verdict-line');

    /* Two finished routes, scored for real. The second is the first with
       one more span, through designated land, so only the environment dial
       moves - and that one dial is enough to change the verdict. */
    var fields = ['farmland', 'farmland', 'farmland', 'farmland', 'farmland', 'farmland'];
    var through = ['woodland', 'woodland', 'woodland', 'road', 'road', 'grant'];
    var welcome = Score.scoreRoute(spans(through.concat(fields))).dials;
    var opposed = Score.scoreRoute(spans(through.concat(['sssi'], fields))).dials;

    return storyboard(box, [welcome, welcome, welcome, opposed, opposed, opposed], 3, function (dials) {
      gauges.set(dials);
      var key = Score.verdictKeyFor(dials);
      Object.keys(gauges.parts).forEach(function (id) {
        gauges.parts[id].row.classList.toggle('is-weakest', key !== 'balanced' && id === key);
      });
      line.textContent = CFG.verdicts[key].title;
      line.dataset.tone = key === 'balanced' ? 'positive' : 'negative';
    });
  }

  // The best finish still open, falling as spans cost points, and the tint on those spans.
  function forecast() {
    var box = put(null, 'div', 'howto-forecast');
    var reading = panel('forecast');
    var top = put(reading, 'p', 'forecast-head');
    put(top, 'span', 'forecast-label', CFG.copy.forecastHeading);
    var value = put(top, 'span', 'forecast-value');
    var line = put(reading, 'p', 'forecast-line');
    box.appendChild(reading);

    var map = board(['FWWFF', 'FFFFT']);
    box.appendChild(map.el);

    var open = function (weakest, verdictKey) {
      return {
        status: 'open', weakest: weakest,
        balanced: weakest >= CFG.balancedThreshold, verdictKey: verdictKey
      };
    };
    var start = open(75.4, 'balanced');
    var slipped = open(72.8, 'balanced');
    var lost = open(67.9, 'env');
    var slip = { at: [1, 0], kind: 'slipped', drop: 2.6 };
    var loss = { at: [2, 0], kind: 'lost', drop: 4.9 };

    var frames = [
      { forecast: start, route: [[0, 0]], target: [1, 0] },
      { forecast: start, route: [[0, 0]], target: [1, 0] },
      { forecast: slipped, route: along(0, 0, 2), target: [2, 0], moods: [slip] },
      { forecast: slipped, route: along(0, 0, 2), target: [2, 0], moods: [slip] },
      { forecast: lost, route: along(0, 0, 3), target: [3, 0], moods: [slip, loss] },
      { forecast: lost, route: along(0, 0, 3), target: [3, 0], moods: [slip, loss] },
      { forecast: lost, route: along(0, 0, 3), target: [3, 0], moods: [slip, loss] }
    ];

    return storyboard(box, frames, 4, function (frame) {
      var said = Advice.forecastLine(frame.forecast);
      reading.dataset.tone = said.tone;
      value.textContent = said.value;
      line.textContent = said.line;
      frame.outlook = said.tone;
      map.paint(frame);
    });
  }

  // Why? opens the list of where a dial's points went.
  function why() {
    var box = panel('howto-why');
    var built = spans(['farmland', 'sssi', 'woodland', 'woodland', 'farmland']);
    var dials = Score.scoreRoute(built).dials;

    var gauges = meters(box, { only: ['env'], why: true });
    gauges.set(dials);
    var link = gauges.parts.env.why;

    var reading = Advice.whyDial('env', built, dials.env);
    var note = put(box, 'div', 'why-note howto-why-note');
    put(note, 'strong', '', reading.heading);
    var list = put(note, 'ul');
    reading.items.forEach(function (item) { put(list, 'li', '', item); });

    var explain = put(box, 'p', 'howto-explain');
    put(explain, 'span', 'btn btn-small', CFG.copy.explainButton);
    put(explain, 'span', '', labels().or);
    put(explain, 'kbd', 'howto-key', 'E');

    return storyboard(box, [false, true, true, true, true], 1, function (open) {
      link.classList.toggle('is-hover', open);
      note.classList.toggle('is-shut', !open);
    });
  }

  // Your route through designated land, and the best one found going round it.
  function best() {
    var said = labels();
    var box = put(null, 'div', 'howto-best');
    var map = board(['FFFWWFF', 'PFSSFXD', 'FFFFFFT']);
    box.appendChild(map.el);

    var yours = along(1, 0, 7);
    var found = [[0, 1], [1, 1], [1, 2], [2, 2], [3, 2], [4, 2], [4, 1], [5, 1], [6, 1]];

    var key = put(box, 'p', 'howto-route-key');
    put(put(key, 'span', 'howto-route-yours'), 'span', 'howto-route-line');
    key.lastChild.appendChild(document.createTextNode(said.yourRoute));
    put(put(key, 'span', 'howto-route-best'), 'span', 'howto-route-line');
    key.lastChild.appendChild(document.createTextNode(said.bestRoute));

    var mine = { route: yours, done: true };
    var both = { route: yours, done: true, ghost: found };
    return storyboard(box, [mine, mine, both, both, both, both], 3, map.paint);
  }

  /* New landscape pressed a few times: each one named, rated and of a kind,
     as the line under the rail shows it - and the name typed back in to
     play one again. The names are made up; the ratings and kinds are the
     game's own. */
  function kinds() {
    var copy = CFG.copy;
    var box = panel('howto-kinds');
    var bar = put(box, 'div', 'howto-buttons');
    var roll = put(bar, 'span', 'btn btn-small', copy.newMapButton);

    var line = put(box, 'p', 'seed-line howto-seed');
    put(line, 'span', '', copy.seedLabel);
    var code = put(line, 'code');
    var difficulty = put(line, 'span', 'difficulty');
    var kind = put(line, 'span', 'archetype');

    var form = put(box, 'div', 'seed-form howto-seed-form');
    var typed = put(form, 'span', 'howto-input');
    put(form, 'span', 'btn btn-small', copy.seedGo);

    var types = CFG.archetypes || [];
    var bands = CFG.difficulty || [];
    var names = ['HWKRTA', 'QPLMVE', 'TZVANO'];
    var states = names.map(function (name, index) {
      var type = types[(index * 2) % Math.max(types.length, 1)];
      var band = bands[index % Math.max(bands.length, 1)];
      return { name: name, kind: type ? type.label : '', difficulty: band ? band.word : '' };
    });

    var frames = [
      { at: 0, press: true }, { at: 0 },
      { at: 1, press: true }, { at: 1 },
      { at: 2, press: true }, { at: 2 },
      { at: 0, typed: names[0].slice(0, 2) }, { at: 0, typed: names[0] }
    ];

    return storyboard(box, frames, 1, function (frame) {
      var state = states[frame.at];
      roll.classList.toggle('is-lit', !!frame.press);
      code.textContent = state.name;
      difficulty.textContent = state.difficulty;
      difficulty.hidden = !state.difficulty;
      kind.textContent = state.kind;
      kind.hidden = !state.kind;
      typed.textContent = frame.typed || copy.seedInputPlaceholder;
      typed.classList.toggle('is-empty', !frame.typed);
    });
  }

  // Committed mode greys out Undo; Blind mode swaps the meters for a note.
  function modes() {
    var copy = CFG.copy;
    var box = put(null, 'div', 'howto-modes');

    var committed = put(box, 'div', 'howto-panel');
    var committedBox = tickBox(committed, copy.committedLabel);
    var buttons = put(committed, 'div', 'howto-buttons');
    var undo = put(buttons, 'span', 'btn btn-small', copy.undo);
    put(buttons, 'span', 'btn btn-small', copy.reset);

    var blind = put(box, 'div', 'howto-panel');
    var blindBox = tickBox(blind, copy.blindLabel);
    var gauges = meters(blind);
    gauges.set(Score.scoreRoute(spans(['woodland', 'road', 'farmland', 'farmland'])).dials);
    var hidden = put(blind, 'p', 'howto-hidden', copy.blindMeters);

    return storyboard(box, [false, false, true, true, true], 3, function (on) {
      committedBox.classList.toggle('is-on', on);
      blindBox.classList.toggle('is-on', on);
      undo.classList.toggle('is-off', on);
      gauges.el.hidden = on;
      hidden.hidden = !on;
    });
  }

  var PICTURES = {
    goal: goal, step: step, drag: drag, back: back, trap: trap,
    techs: techs, land: land,
    preview: preview, verdict: verdict, forecast: forecast, why: why,
    best: best, kinds: kinds, modes: modes
  };

  // The picture named in CONFIG.copy.howTo, or null for a name with none.
  function draw(name) {
    return PICTURES[name] ? PICTURES[name]() : null;
  }

  return { draw: draw };

}(CONFIG, Score, Advice, HowToBoard));
