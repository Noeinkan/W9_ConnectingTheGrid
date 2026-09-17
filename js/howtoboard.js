/* =========================================================================
   Connecting the Grid - a piece of map, for the How to play pictures
   =========================================================================

   A few squares of landscape with a line on them, drawn the way the map
   draws them: region outlines from js/mapart.js, the line and its towers
   from js/routeart.js, the two ends from js/mapsymbols.js. Over them go
   the square in play, its arrows and the way back, the tinted spans, pins,
   the numbered technology buttons, a land card and a mouse pointer - everything a
   picture on the sheet needs to show a move.

   The numbered buttons and the land card are the game's own markup and
   classes (css/techpick.css, css/style.css, js/guidance.js), laid inside the
   picture the way the map lays them over itself: in squares, from --cols
   and --rows on the picture's box.

   The map symbols are not defined a second time. Every <use> here points at
   the <symbol> the live map has already put on the page, because a second
   copy would put every one of those ids on the page twice.

   Split out of js/howtoart.js because drawing a piece of map is one job and
   deciding what each picture shows is another.

   Exposes one global: HowToBoard.
   ========================================================================= */

var HowToBoard = (function (CFG, Rng, Score, Advice, Guidance, MapArt, RouteArt, MapSymbols) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var U = MapArt.units;
  var STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  // The arrow on a chevron, pointing north: the same shape as in render.js.
  var ARROW = 'M50 14 88 66H62v22H38V66H12z';
  var TURN = { n: 0, e: 90, s: 180, w: 270 };

  // A mouse pointer with its tip at (0, 0), in map units.
  var POINTER = 'M0 0V40L10 31 17 46 25 43 18 28H31Z';

  /* A smaller copy of the tables in js/mapart.js, which keeps its own to
     itself. Fewer symbols to a square: a square in a picture is drawn at
     about the size of one on the map, and the map's counts crowd it. */
  var REGIONS = ['woodland', 'hilly', 'rocky', 'sssi', 'settlement', 'river', 'water'];
  var RAISED = { woodland: true, hilly: true, rocky: true, settlement: true };
  var HATCHED = { sssi: 'hatch-sssi', water: 'hatch-water' };
  var LANDMARKS = {
    substation: 'mark-substation', customer: 'mark-customer',
    benefit: 'mark-benefit', grant: 'mark-grant'
  };
  var COVER = {
    woodland: { symbols: ['tree', 'pine', 'tree', 'tree'], tints: 3, scale: [0.3, 0.4] },
    hilly: { symbols: ['hill', 'hill'], scale: [0.42, 0.52] },
    rocky: { symbols: ['rock', 'rock', 'rock'], scale: [0.22, 0.3] },
    sssi: { symbols: ['reed', 'reed', 'reed', 'reed'], scale: [0.22, 0.3] },
    settlement: { symbols: ['house', 'house', 'house'], tints: 3, scale: [0.3, 0.38] },
    water: { symbols: ['ripple', 'ripple'], scale: [0.4, 0.5] }
  };
  // Where in its square each symbol stands, by how many there are.
  var SLOTS = {
    2: [[0.32, 0.4], [0.68, 0.7]],
    3: [[0.28, 0.36], [0.72, 0.4], [0.48, 0.74]],
    4: [[0.27, 0.3], [0.73, 0.32], [0.3, 0.72], [0.72, 0.74]]
  };

  /* ---------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */

  function add(parent, name, attributes) {
    var node = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    return parent.appendChild(node);
  }

  function put(parent, tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return parent ? parent.appendChild(node) : node;
  }

  function n(value) { return Math.round(value * 100) / 100; }

  function sideBetween(from, to) {
    if (to.row < from.row) { return 'n'; }
    if (to.row > from.row) { return 's'; }
    if (to.col > from.col) { return 'e'; }
    return 'w';
  }

  // The same corner rounding as js/mapart.js, without the wobble.
  function roundedLoop(points, radius) {
    var count = points.length;
    var parts = [];
    for (var i = 0; i < count; i++) {
      var previous = points[(i - 1 + count) % count];
      var here = points[i];
      var next = points[(i + 1) % count];
      var inX = here[0] - previous[0];
      var inY = here[1] - previous[1];
      var outX = next[0] - here[0];
      var outY = next[1] - here[1];
      var inLength = Math.sqrt(inX * inX + inY * inY) || 1;
      var outLength = Math.sqrt(outX * outX + outY * outY) || 1;
      var r = Math.min(radius, inLength / 2, outLength / 2);
      parts.push((i === 0 ? 'M' : 'L') +
        n(here[0] - inX / inLength * r) + ' ' + n(here[1] - inY / inLength * r));
      parts.push('Q' + n(here[0]) + ' ' + n(here[1]) + ' ' +
        n(here[0] + outX / outLength * r) + ' ' + n(here[1] + outY / outLength * r));
    }
    return parts.join(' ') + ' Z';
  }

  /* ---------------------------------------------------------------------
     A piece of map
     ---------------------------------------------------------------------
     Drawn from rows of CONFIG.legend letters, plus P and D for the power
     station and the grid supply point. Rivers and roads are drawn as lines
     running straight down the picture, which is how every picture here
     uses them.
     ------------------------------------------------------------------- */

  function board(rows) {
    var cols = rows[0].length;
    var count = rows.length;
    var width = cols * U;
    var height = count * U;

    function letterAt(col, row) { return rows[row].charAt(col); }
    function typeAt(col, row) { return CFG.legend[letterAt(col, row)] || 'farmland'; }
    function onBoard(col, row) { return col >= 0 && col < cols && row >= 0 && row < count; }

    // Rows of cell type ids, as Score.besideHomes reads a landscape.
    var grid = rows.map(function (line, row) {
      return line.split('').map(function (letter, col) { return typeAt(col, row); });
    });
    function beside(col, row) {
      return CFG.cellTypes[typeAt(col, row)].passable && Score.besideHomes(col, row, grid);
    }

    var wrap = put(null, 'div', 'howto-board');
    wrap.style.setProperty('--cols', cols);
    wrap.style.setProperty('--rows', count);
    var sheet = add(wrap, 'svg', {
      class: 'howto-map', viewBox: '0 0 ' + width + ' ' + height,
      focusable: 'false', 'aria-hidden': 'true'
    });

    add(sheet, 'rect', { class: 'art-base', width: width, height: height });
    drawFields(sheet, cols, count, typeAt);
    drawRegions(sheet, cols, count, typeAt);
    drawWay(sheet, cols, count, typeAt, 'river', ['art-river-deep', 'art-river-core']);
    drawWay(sheet, cols, count, typeAt, 'road', ['art-road-case', 'art-road-top', 'art-road-dash']);
    drawCover(sheet, cols, count, typeAt);
    drawLandmarks(sheet, cols, count, typeAt);
    drawGrid(sheet, cols, count);

    var ends = add(sheet, 'g', { class: 'art-ends' });
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < cols; col++) {
        if (letterAt(col, row) === 'P') { MapSymbols.drawGenerationSite(ends, col * U, row * U); }
        if (letterAt(col, row) === 'D') { MapSymbols.drawDemandCentre(ends, col * U, row * U); }
      }
    }

    var ghostLayer = add(sheet, 'g', { class: 'art-ghost' });
    var routeLayer = add(sheet, 'g', { class: 'art-route' });
    var moodLayer = add(sheet, 'g', { class: 'howto-moods' });
    var ring = add(sheet, 'rect', { class: 'howto-target', width: U - 8, height: U - 8, rx: 3 });
    var arrows = add(sheet, 'g', { class: 'howto-chevrons' });
    var notes = put(wrap, 'div', 'howto-notes');
    // The buttons and the land card go here, under the pointer's own sheet.
    var extras = put(wrap, 'div', 'howto-extras');
    var over = add(wrap, 'svg', {
      class: 'howto-map howto-over', viewBox: '0 0 ' + width + ' ' + height,
      focusable: 'false', 'aria-hidden': 'true'
    });
    var hand = pointer(over);

    // Where a point in map units sits on the picture, as percentages.
    function place(node, x, y) {
      node.style.left = n(x / width * 100) + '%';
      node.style.top = n(y / height * 100) + '%';
    }

    function cellsOf(list) {
      return (list || []).map(function (at) {
        return { col: at[0], row: at[1], typeId: typeAt(at[0], at[1]), techId: at[2] || CFG.defaultTechnology };
      });
    }

    /* The arrows on the square in play. One leading off the picture is left
       out: the edge of a picture is not the edge of the map, and marking it
       as a dead end would teach the wrong thing. */
    function paintArrows(target, cells) {
      var at = { col: target[0], row: target[1] };
      var head = cells[cells.length - 1];
      var entry = head ? sideBetween(at, head) : CFG.start.entry;

      ['n', 'e', 's', 'w'].forEach(function (dir) {
        if (dir === entry) { return; }
        var col = at.col + STEP[dir][0];
        var row = at.row + STEP[dir][1];
        if (!onBoard(col, row)) { return; }

        var used = cells.some(function (cell) { return cell.col === col && cell.row === row; });
        var trap = used || !CFG.cellTypes[typeAt(col, row)].passable;
        var chevron = add(arrows, 'g', {
          class: 'howto-chevron' + (trap ? ' is-trap' : ''),
          transform: 'translate(' + n((at.col + 0.5 + STEP[dir][0] * 0.36) * U) + ' ' +
                     n((at.row + 0.5 + STEP[dir][1] * 0.36) * U) + ')'
        });
        add(chevron, 'circle', { r: 23 });
        add(chevron, 'path', {
          d: ARROW, transform: 'rotate(' + TURN[dir] + ') translate(-13.8 -13.8) scale(0.276)'
        });
      });
    }

    /* The way back: the small dark arrow on the last span, on the leg the
       line came in by, pointing back along it. Placed as render.js places it. */
    function paintBack(cells) {
      var last = cells[cells.length - 1];
      var before = cells[cells.length - 2];
      var side = before ? sideBetween(last, before) : CFG.start.entry;
      var chevron = add(arrows, 'g', {
        class: 'howto-chevron is-back',
        transform: 'translate(' + n((last.col + 0.5 + STEP[side][0] * 0.3) * U) + ' ' +
                   n((last.row + 0.5 + STEP[side][1] * 0.3) * U) + ')'
      });
      add(chevron, 'circle', { r: 16 });
      add(chevron, 'path', {
        d: ARROW, transform: 'rotate(' + TURN[side] + ') translate(-9.6 -9.6) scale(0.192)'
      });
    }

    /* The numbered buttons in a square ahead of the one in play, as
       js/techpick.js dresses them: they build on the square in play, so they
       read its ground - struck through where not allowed, starred where they
       suit it. `chosen` is the technology in use, which is ringed. */
    var keysShown = null;
    var cardShown = null;

    function paintKeys(at, target, chosen) {
      // Left alone while nothing about them changes, or they would fade in again every frame.
      var said = at && target ? [at, target, chosen].join('|') : null;
      if (said === keysShown) { return; }
      keysShown = said;
      extras.querySelectorAll('.techpick').forEach(function (layer) { layer.remove(); });
      if (!said) { return; }

      var dir = sideBetween({ col: target[0], row: target[1] }, { col: at[0], row: at[1] });
      var typeId = typeAt(target[0], target[1]);
      var near = beside(target[0], target[1]);
      var type = CFG.cellTypes[typeId];
      var suits = near && type.pickBeside ? type.pickBeside : type.pick;

      var layer = put(extras, 'div', 'techpick');
      layer.dataset.axis = dir === 'n' || dir === 's' ? 'across' : 'down';
      layer.style.setProperty('--x', at[0] + 0.5);
      layer.style.setProperty('--y', at[1] + 0.5);
      put(layer, 'span', 'techpick-back');

      CFG.technologies.forEach(function (tech, index) {
        var key = put(layer, 'span', 'techpick-key tech-' + tech.id, String(index + 1));
        key.style.setProperty('--i', index - (CFG.technologies.length - 1) / 2);
        var span = Advice.spanOn(typeId, tech.id, near);
        key.classList.toggle('is-chosen', chosen === tech.id);
        key.classList.toggle('is-banned', !!span.banned);
        key.classList.toggle('is-pick', !span.banned && suits === tech.id);
      });
    }

    /* The land card over a square: its name and short line from render.js's
       card, and the rows of figures js/guidance.js adds under them. */
    function paintCard(at, chosen) {
      var said = at ? [at, chosen].join('|') : null;
      if (said === cardShown) { return; }
      cardShown = said;
      extras.querySelectorAll('.tip').forEach(function (card) { card.remove(); });
      if (!said) { return; }

      var typeId = typeAt(at[0], at[1]);
      var type = CFG.cellTypes[typeId];
      var card = put(extras, 'div', 'tip howto-land-card');
      var head = put(card, 'span', 'tip-head');
      var icon = put(head, 'span', 'tip-icon');
      icon.style.setProperty('--land', 'var(--brand-land-' + typeId + ', var(--brand-land-farmland))');
      if (type.icon) { icon.style.backgroundImage = 'url("' + type.icon + '")'; }
      put(head, 'strong', 'tip-name', type.label);
      put(head, 'span', 'tip-brief', type.brief || type.description);

      // The note only where a technology allowed here pays extra for being seen.
      var near = beside(at[0], at[1]);
      var seen = near && CFG.besideHomes && CFG.technologies.some(function (tech) {
        return (CFG.besideHomes.comm[tech.id] || 0) !== 0 && Score.canUseTech(tech.id, typeId);
      });
      if (seen) { put(card, 'span', 'tip-beside', CFG.copy.besideHomesNote); }
      if (type.passable) {
        card.appendChild(Guidance.techRows(typeId, near,
          near && type.pickBeside ? type.pickBeside : type.pick, chosen));
      }

      // Above the square, or below it where there is no room above.
      var below = at[1] < 2;
      card.style.setProperty('--cx', at[0] + 0.5);
      card.style.setProperty('--cy', below ? at[1] + 1 : at[1]);
      if (below) { card.setAttribute('data-below', ''); }
      card.dataset.edge = at[0] === 0 ? 'left' : at[0] === cols - 1 ? 'right' : '';
    }

    function paintMoods(moods) {
      moodLayer.innerHTML = '';
      Array.prototype.slice.call(notes.querySelectorAll('.howto-badge')).forEach(function (badge) {
        badge.remove();
      });
      (moods || []).forEach(function (mood) {
        add(moodLayer, 'rect', {
          class: 'howto-mood is-' + mood.kind,
          x: mood.at[0] * U, y: mood.at[1] * U, width: U, height: U
        });
        var badge = put(notes, 'span', 'howto-badge is-' + mood.kind, Advice.moodBadge(mood));
        place(badge, (mood.at[0] + 0.95) * U, (mood.at[1] + 0.05) * U);
      });
    }

    function paintTip(tip) {
      var old = notes.querySelector('.howto-tip');
      if (old) { old.remove(); }
      if (!tip) { return; }
      var box = put(notes, 'span', 'howto-tip', tip.text);
      place(box, tip.at[0], tip.at[1]);
    }

    function paint(frame) {
      frame = frame || {};
      var cells = cellsOf(frame.route);
      var head = cells[cells.length - 1];
      var target = frame.target || null;

      var openEnd = frame.openEnd || null;
      if (frame.done) { openEnd = CFG.end.exit; }
      if (head && target) { openEnd = sideBetween(head, { col: target[0], row: target[1] }); }

      RouteArt.paint(routeLayer, {
        phase: frame.done ? 'complete' : 'routing',
        route: cells,
        openEnd: openEnd
      });
      // A finished picture of a line, not a line still being built.
      if (frame.quiet) {
        Array.prototype.slice.call(routeLayer.querySelectorAll('.art-head, .art-head-dot, .run-flow'))
          .forEach(function (node) { node.remove(); });
      }
      RouteArt.paintGhost(ghostLayer, frame.ghost ? cellsOf(frame.ghost) : null);

      ring.style.display = target ? '' : 'none';
      if (target) {
        ring.setAttribute('x', target[0] * U + 4);
        ring.setAttribute('y', target[1] * U + 4);
      }
      arrows.innerHTML = '';
      if (frame.arrows !== false) {
        if (target) { paintArrows(target, cells); }
        if (cells.length && !frame.quiet) { paintBack(cells); }
      }

      if (frame.outlook) { wrap.dataset.outlook = frame.outlook; } else { delete wrap.dataset.outlook; }
      paintMoods(frame.moods);
      paintTip(frame.tip);
      var chosen = frame.tech || CFG.defaultTechnology;
      paintKeys(frame.keys, target, chosen);
      paintCard(frame.card, chosen);
      movePointer(hand, frame.pointer);
    }

    // The little pins naming a square, like the two on the map.
    function flag(col, row, text) {
      var pin = put(notes, 'span', 'howto-flag', text);
      place(pin, (col + 0.5) * U, row * U);
      if (col === 0) { pin.dataset.edge = 'start'; }
      if (col === cols - 1) { pin.dataset.edge = 'end'; }
    }

    return { el: wrap, paint: paint, flag: flag };
  }

  function drawFields(parent, cols, count, typeAt) {
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < cols; col++) {
        if (REGIONS.indexOf(typeAt(col, row)) >= 0) { continue; }
        var box = { x: col * U, y: row * U, width: U, height: U };
        box.class = 'art-field-' + Math.floor(Rng.hash2(col, row, 71) * 4);
        add(parent, 'rect', box);
        if (Rng.hash2(col, row, 73) < 0.5) {
          add(parent, 'rect', {
            x: box.x, y: box.y, width: U, height: U,
            fill: 'url(#art-furrow-' + Math.floor(Rng.hash2(col, row, 79) * 3) + ')'
          });
        }
      }
    }
  }

  function drawRegions(parent, cols, count, typeAt) {
    var relief = add(parent, 'g', { class: 'art-relief' });

    REGIONS.forEach(function (typeId) {
      var loops = MapArt.traceRegion(cols, count, function (col, row) {
        return typeAt(col, row) === typeId;
      });
      if (!loops.length) { return; }

      var d = loops.map(function (loop) {
        return roundedLoop(loop.map(function (point) { return [point[0] * U, point[1] * U]; }), 26);
      }).join(' ');

      if (RAISED[typeId]) {
        add(relief, 'path', { class: 'art-shade', d: d, 'fill-rule': 'evenodd', transform: 'translate(6 9)' });
      }
      add(parent, 'path', {
        class: 'art-region art-' + typeId,
        style: 'fill: var(--brand-land-' + typeId + ', var(--brand-land-farmland))',
        d: d, 'fill-rule': 'evenodd'
      });
      if (HATCHED[typeId]) {
        add(parent, 'path', {
          class: 'art-hatch', d: d, 'fill-rule': 'evenodd', fill: 'url(#' + HATCHED[typeId] + ')'
        });
      }
    });
  }

  // A river or a road: one line down the picture through its squares.
  function drawWay(parent, cols, count, typeAt, typeId, classes) {
    var points = [];
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < cols; col++) {
        if (typeAt(col, row) === typeId) { points.push([(col + 0.5) * U, (row + 0.5) * U]); }
      }
    }
    if (!points.length) { return; }
    points.unshift([points[0][0], 0]);
    points.push([points[points.length - 1][0], count * U]);

    var d = MapArt.throughPoints(points);
    classes.forEach(function (className) {
      add(parent, 'path', { class: className, d: d, fill: 'none' });
    });
  }

  function drawCover(parent, cols, count, typeAt) {
    var planted = [];

    for (var row = 0; row < count; row++) {
      for (var col = 0; col < cols; col++) {
        var typeId = typeAt(col, row);
        var plan = COVER[typeId];
        if (!plan) { continue; }

        plan.symbols.forEach(function (symbol, k) {
          var slot = SLOTS[plan.symbols.length][k];
          var salt = 101 + k * 31;
          var size = U * (plan.scale[0] + Rng.hash2(col, row, salt) * (plan.scale[1] - plan.scale[0]));
          planted.push({
            symbol: symbol,
            size: size,
            x: (col + slot[0] + (Rng.hash2(col, row, salt + 1) - 0.5) * 0.14) * U,
            y: (row + slot[1] + (Rng.hash2(col, row, salt + 2) - 0.5) * 0.14) * U,
            tint: plan.tints
              ? 'art-tint-' + typeId + '-' + Math.floor(Rng.hash2(col, row, salt + 3) * plan.tints)
              : ''
          });
        });
      }
    }

    // Nearest the bottom drawn last, so nothing is sliced by what stands behind it.
    planted.sort(function (a, b) { return a.y - b.y; });
    var group = add(parent, 'g', { class: 'art-cover' });
    planted.forEach(function (item) {
      var attributes = {
        href: '#' + item.symbol,
        x: n(item.x - item.size / 2), y: n(item.y - item.size / 2),
        width: n(item.size), height: n(item.size)
      };
      if (item.tint) { attributes.class = item.tint; }
      add(group, 'use', attributes);
    });
  }

  function drawLandmarks(parent, cols, count, typeAt) {
    var group = add(parent, 'g', { class: 'art-marks' });
    var span = U * 0.78;
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < cols; col++) {
        var mark = LANDMARKS[typeAt(col, row)];
        if (!mark) { continue; }
        add(group, 'use', {
          href: '#' + mark,
          x: n((col + 0.5) * U - span / 2), y: n((row + 0.5) * U - span / 2),
          width: n(span), height: n(span)
        });
      }
    }
  }

  function drawGrid(parent, cols, count) {
    var lines = add(parent, 'g', { class: 'art-grid' });
    for (var col = 1; col < cols; col++) {
      add(lines, 'line', { x1: col * U, y1: 0, x2: col * U, y2: count * U });
    }
    for (var row = 1; row < count; row++) {
      add(lines, 'line', { x1: 0, y1: row * U, x2: cols * U, y2: row * U });
    }
  }

  /* The pointer. Moved by a CSS transition, so a frame only says where it
     should be and the movement between frames comes for free. A press is
     a ring that spreads and fades; held down, a dot stays under the tip. */
  function pointer(parent) {
    var group = add(parent, 'g', { class: 'howto-pointer is-away' });
    add(group, 'circle', { class: 'howto-hold', r: 11 });
    var presses = add(group, 'g');
    add(group, 'path', { class: 'howto-hand', d: POINTER });
    return { group: group, presses: presses };
  }

  // `at` is [x, y] in map units, with 'press', 'down' or 'held' after it.
  function movePointer(hand, at) {
    hand.group.classList.toggle('is-away', !at);
    if (!at) { return; }
    hand.group.style.transform = 'translate(' + at[0] + 'px, ' + at[1] + 'px)';
    hand.group.classList.toggle('is-held', at[2] === 'held' || at[2] === 'down');
    if (at[2] === 'press' || at[2] === 'down') {
      hand.presses.innerHTML = '';
      add(hand.presses, 'circle', { class: 'howto-press', r: 22 });
    }
  }

  return { board: board };

}(CONFIG, Rng, Score, Advice, Guidance, MapArt, RouteArt, MapSymbols));
