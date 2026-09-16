/* =========================================================================
   Connecting the Grid - advice
   =========================================================================

   Turns numbers the game already has into sentences a player can act on:

     * what the last span did, and what it cost of the best finish still
       open                                            ("Explain last span")
     * where a dial's points went                      (the "Why?" notes)
     * what lies down one of the arrows, before building (Shift + arrow)
     * whether an arrow leads somewhere the line would be stuck
     * how a span changed the best finish still open   (the route's mood)

   It works nothing out that Score or Foresight has not already worked out,
   and it decides no rules - an arrow into water is still a legal move, it
   is only a foolish one, and this file only says so. Every word comes from
   CONFIG.copy.

   Pure: no page, no game state. Loads in the browser and under Node.
   Exposes one global: Advice.
   ========================================================================= */

var Advice = (function (CFG, Score) {
  'use strict';

  var STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  /* ---------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  // One decimal place at most, and never "-0".
  function num(value) {
    var rounded = Math.round(value * 10) / 10;
    return String(rounded === 0 ? 0 : rounded);
  }

  // With a sign in front when it gives something back.
  function signed(value) {
    var text = num(value);
    return value > 0 ? '+' + text : text;
  }

  // "a", "a and b", "a, b and c".
  function listOf(items) {
    if (items.length < 2) { return items.join(''); }
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function dial(id) {
    for (var i = 0; i < CFG.dials.length; i++) {
      if (CFG.dials[i].id === id) { return CFG.dials[i]; }
    }
    return null;
  }

  function onBoard(col, row) {
    return col >= 0 && col < CFG.grid.cols && row >= 0 && row < CFG.grid.rows;
  }

  // A reading of the finish, whether forecast or actually reached.
  function scored(forecast) {
    return !!forecast && (forecast.status === 'open' || forecast.status === 'done');
  }

  /* ---------------------------------------------------------------------
     One span, on one kind of ground, on one technology
     ------------------------------------------------------------------- */

  /* `beside` is whether the square shares an edge with houses - for one
     square of the map in play, Score.besideHomes(col, row). */
  function spanOn(typeId, techId, beside) {
    var type = CFG.cellTypes[typeId];
    if (!type || !type.passable) { return { banned: true, impassable: true }; }
    if (!Score.canUseTech(techId, typeId)) { return { banned: true }; }
    var span = Score.scoreSegment(typeId, techId, beside);
    return { banned: false, cost: num(span.cost), env: num(span.env), comm: num(span.comm) };
  }

  // The ground's name, and whether the square is beside houses.
  function placeName(typeId, beside) {
    var label = CFG.cellTypes[typeId].label;
    return beside ? fill(CFG.copy.besideHomesLabel, { terrain: label }) : label;
  }

  /* ---------------------------------------------------------------------
     How a span changed the best finish still open
     ---------------------------------------------------------------------
     Four kinds, from the forecast before the span and the one after it:

       kept     nothing that matters was lost
       slipped  points came off the best finish, at least guidance.slipNotice
       lost     a balanced finish was open before this span and is not now
       blocked  there was a way through before this span and there is not now

     Whatever the span did, it can only take away: the forecast before it
     already counted every way this span could have been built. So a rise
     is never reported as good news - it only happens when the line has
     doubled back west, where the search does not look, and is read as kept.
     ------------------------------------------------------------------- */

  function moodOf(before, after) {
    var kept = { kind: 'kept', drop: 0 };
    if (!before || !after) { return kept; }

    if (after.status === 'blocked') {
      return before.status === 'blocked' ? kept : { kind: 'blocked', drop: null };
    }

    if (!scored(before)) { return kept; }

    if (after.status === 'belowFloor') {
      return { kind: before.balanced ? 'lost' : 'slipped', drop: null };
    }

    var drop = Math.round((before.weakest - after.weakest) * 10) / 10;
    if (before.balanced && !after.balanced) { return { kind: 'lost', drop: drop }; }

    var notice = (CFG.guidance && CFG.guidance.slipNotice) || 1;
    if (drop >= notice) { return { kind: 'slipped', drop: drop }; }
    return kept;
  }

  // What the status line says about it, if anything. Null means "nothing".
  function moodSentence(mood, spans, committed) {
    var copy = CFG.copy;
    if (!mood) { return null; }
    if (mood.kind === 'lost') {
      return fill(committed ? copy.moodLostCommitted : copy.moodLost, { threshold: CFG.balancedThreshold });
    }
    if (mood.kind === 'blocked') { return committed ? copy.moodBlockedCommitted : copy.moodBlocked; }
    if (mood.kind === 'slipped' && mood.drop !== null) {
      return fill(copy.moodSlipped, { n: spans, drop: num(mood.drop) });
    }
    return null;
  }

  // The same, said about a span already on the map (tooltip, cell label).
  function routeMoodNote(mood) {
    if (!mood) { return ''; }
    if (mood.kind === 'lost') { return fill(CFG.copy.routeMoodLost, { threshold: CFG.balancedThreshold }); }
    if (mood.kind === 'blocked') { return CFG.copy.routeMoodBlocked; }
    if (mood.kind === 'slipped' && mood.drop !== null) {
      return fill(CFG.copy.routeMoodSlipped, { drop: num(mood.drop) });
    }
    return '';
  }

  // The badge on the span: how much it cost, or "!" when it cost the verdict.
  function moodBadge(mood) {
    if (!mood || mood.kind === 'kept') { return ''; }
    if (mood.kind === 'slipped' && mood.drop !== null) { return '-' + num(mood.drop); }
    return '!';
  }

  /* ---------------------------------------------------------------------
     The best finish still open, as the rail shows it
     ------------------------------------------------------------------- */

  function forecastLine(forecast) {
    var copy = CFG.copy;
    if (!forecast) { return null; }

    if (scored(forecast)) {
      var verdict = CFG.verdicts[forecast.verdictKey].title;
      var template = forecast.status === 'done'
        ? copy.forecastDone
        : (forecast.balanced ? copy.forecastOnCourse : copy.forecastAtBest);
      return {
        value: num(forecast.weakest),
        line: fill(template, { verdict: verdict }),
        tone: forecast.balanced ? 'positive' : 'warning'
      };
    }
    if (forecast.status === 'belowFloor') {
      return {
        value: '<' + forecast.floor,
        line: fill(copy.forecastBelowFloor, { floor: forecast.floor }),
        tone: 'negative'
      };
    }
    return { value: '-', line: copy.forecastBlocked, tone: 'negative' };
  }

  /* ---------------------------------------------------------------------
     Explain last span
     ------------------------------------------------------------------- */

  /* Which way the last span sends the line, and onto what ground. Null
     when it leaves the map - off the demand centre, which is the finish,
     or off an edge, which the status line already complains about. */
  function headingOf(route) {
    var last = route[route.length - 1];
    var previous = route[route.length - 2];
    if (!last || !last.pieceId) { return null; }

    var cameIn = CFG.start.entry;
    if (previous) {
      if (previous.row < last.row) { cameIn = 'n'; }
      else if (previous.row > last.row) { cameIn = 's'; }
      else if (previous.col > last.col) { cameIn = 'e'; }
      else { cameIn = 'w'; }
    }
    var ends = Score.piece(last.pieceId).connectors;
    var side = ends[0] === cameIn ? ends[1] : ends[0];
    var col = last.col + STEP[side][0];
    var row = last.row + STEP[side][1];
    var typeId = onBoard(col, row) ? Score.typeIdAt(col, row) : null;
    if (!typeId) { return null; }
    return { side: side, terrain: CFG.cellTypes[typeId].label };
  }

  /* `forecasts[i]` is the best finish still open with i spans laid, as
     game.js keeps it. `quiet` leaves out every sentence that gives a score
     away, for a game being played without the meters. */
  function explainLast(route, forecasts, quiet) {
    var copy = CFG.copy;
    if (!route.length) { return copy.explainNothing; }

    var n = route.length;
    var last = route[n - 1];
    var type = CFG.cellTypes[last.typeId];
    var tech = Score.technology(last.techId);
    var span = spanOn(last.typeId, last.techId, last.beside);

    var parts = [fill(copy.explainSpan, {
      n: n,
      terrain: placeName(last.typeId, last.beside),
      tech: tech.label,
      cost: span.cost,
      env: span.env,
      comm: span.comm
    })];

    var heading = headingOf(route);
    if (heading) {
      parts.push(fill(copy.explainHeading, {
        side: copy.sides[heading.side], terrain: heading.terrain.toLowerCase()
      }));
    }

    if (!quiet) {
      var before = Score.scoreRoute(route.slice(0, -1)).dials;
      var after = Score.scoreRoute(route).dials;
      var changes = CFG.dials.filter(function (d) {
        return before[d.id] !== after[d.id];
      }).map(function (d) {
        return fill(copy.explainChange, {
          dial: d.label.toLowerCase(), from: before[d.id], to: after[d.id]
        });
      });
      parts.push(changes.length
        ? fill(copy.explainMoved, { changes: listOf(changes) })
        : copy.explainStill);

      var was = forecasts && forecasts[n - 1];
      var now = forecasts && forecasts[n];
      if (was && now) {
        if (now.status === 'blocked' && was.status !== 'blocked') {
          parts.push(copy.explainBlocked);
        } else if (now.status === 'belowFloor' && was.status !== 'belowFloor') {
          parts.push(fill(copy.explainGone, { floor: now.floor }));
        } else if (scored(was) && scored(now)) {
          var values = { before: num(was.weakest), after: num(now.weakest), threshold: CFG.balancedThreshold };
          if (was.balanced && !now.balanced) {
            parts.push(fill(copy.explainLost, values));
          } else if (now.weakest < was.weakest) {
            parts.push(fill(copy.explainDropped, values));
          } else {
            parts.push(fill(copy.explainKept, values));
          }
        }
      }
    }

    if (type.tip) { parts.push(type.tip); }
    if (last.beside) { parts.push(copy.besideHomesNote); }
    return parts.join(' ');
  }

  /* ---------------------------------------------------------------------
     Why is a dial where it is
     ------------------------------------------------------------------- */

  var WHY_ITEMS = 4;

  function whyDial(dialId, route, value) {
    var copy = CFG.copy;
    var d = dial(dialId);

    var groups = Score.contributions(route).filter(function (g) {
      return g.points[dialId] !== 0;
    }).sort(function (a, b) {
      return a.points[dialId] - b.points[dialId];   // the biggest loss first
    });

    return {
      heading: fill(copy.meterWhyHeading, {
        dial: d.label, value: value, band: Score.bandFor(value)
      }),
      items: groups.slice(0, WHY_ITEMS).map(function (g) {
        return fill(copy.meterWhyItem, {
          terrain: placeName(g.typeId, g.beside),
          count: g.count,
          tech: Score.technology(g.techId).short,
          points: signed(g.points[dialId])
        });
      }),
      more: groups.length > WHY_ITEMS ? fill(copy.meterWhyMore, { n: groups.length - WHY_ITEMS }) : '',
      empty: groups.length ? '' : copy.meterWhyNone,
      hint: d.whyHint || ''
    };
  }

  // The same note as one run of sentences, for the status line.
  function whySpoken(why) {
    return [why.heading + '.', why.empty || why.items.join('. ') + '.', why.more, why.hint]
      .filter(Boolean).join(' ');
  }

  /* ---------------------------------------------------------------------
     Looking down an arrow
     ------------------------------------------------------------------- */

  /* Where an arrow leads, if the line would be stuck there: 'offMap',
     'water' or 'used'. 'finish' for the one way off the map that is the
     point of the game. Null for ordinary ground. */
  function trapOf(state, exit) {
    var to = exit.to;
    if (!onBoard(to.col, to.row)) {
      var onEnd = state.target &&
        state.target.col === CFG.end.col && state.target.row === CFG.end.row;
      return onEnd && exit.dir === CFG.end.exit ? 'finish' : 'offMap';
    }
    var typeId = Score.typeIdAt(to.col, to.row);
    if (!CFG.cellTypes[typeId].passable) { return 'water'; }
    for (var i = 0; i < state.route.length; i++) {
      if (state.route[i].col === to.col && state.route[i].row === to.row) { return 'used'; }
    }
    return null;
  }

  function trapWords(trap) {
    return { offMap: CFG.copy.trapOffMap, water: CFG.copy.trapWater, used: CFG.copy.trapUsed }[trap] || '';
  }

  function lookAhead(state, dir) {
    var copy = CFG.copy;
    var exit = null;
    (state.exits || []).forEach(function (e) { if (e.dir === dir) { exit = e; } });
    if (!exit) { return null; }

    var side = copy.sides[dir];
    var trap = trapOf(state, exit);
    if (trap === 'finish') { return fill(copy.previewFinish, { side: side }); }
    if (trap === 'offMap') { return fill(copy.previewOffMap, { side: side }); }
    if (trap === 'water') { return fill(copy.previewWater, { side: side }); }
    if (trap === 'used') { return fill(copy.previewUsed, { side: side }); }

    var typeId = Score.typeIdAt(exit.to.col, exit.to.row);
    var beside = Score.besideHomes(exit.to.col, exit.to.row);
    var tech = Score.technology(state.currentTech);
    var span = spanOn(typeId, state.currentTech, beside);
    var terrain = placeName(typeId, beside);
    if (span.banned) {
      return fill(copy.previewBanned, { side: side, terrain: terrain, tech: tech.short });
    }
    return fill(copy.previewExit, {
      side: side, terrain: terrain, tech: tech.short,
      cost: span.cost, env: span.env, comm: span.comm
    });
  }

  /* ---------------------------------------------------------------------
     Self test: node js/advice.js --self-test
     ------------------------------------------------------------------- */

  function selfTest(log) {
    var say = log || function (line) { console.log(line); };
    var passed = 0;
    var failed = 0;

    function check(description, actual, expected) {
      var ok = actual === expected;
      if (ok) { passed++; } else { failed++; }
      if (!ok) { say('  FAIL  ' + description + '\n          expected ' + expected + ', got ' + actual); }
    }

    function open(weakest) {
      return { status: 'open', weakest: weakest, balanced: weakest >= CFG.balancedThreshold, verdictKey: 'balanced' };
    }

    say('');
    say('Connecting the Grid - advice self test');
    say('======================================');

    check('same finish is kept', moodOf(open(74), open(74)).kind, 'kept');
    check('a small drop is kept', moodOf(open(74), open(73.5)).kind, 'kept');
    check('a notable drop slips', moodOf(open(78), open(75)).kind, 'slipped');
    check('the drop is measured', moodOf(open(78), open(75)).drop, 3);
    check('falling under the threshold loses the verdict', moodOf(open(70.2), open(69.9)).kind, 'lost');
    check('running out of ways through is blocked', moodOf(open(74), { status: 'blocked' }).kind, 'blocked');
    check('already blocked stays quiet', moodOf({ status: 'blocked' }, { status: 'blocked' }).kind, 'kept');
    check('a balanced line dropping under the floor loses the verdict',
      moodOf(open(72), { status: 'belowFloor', floor: 55 }).kind, 'lost');
    check('the badge carries the number', moodBadge({ kind: 'slipped', drop: 2.5 }), '-2.5');
    check('the badge marks a lost verdict', moodBadge({ kind: 'lost', drop: 0.3 }), '!');
    check('nothing to say about a kept span', moodSentence({ kind: 'kept', drop: 0 }, 3, false), null);
    check('a lost verdict names the threshold',
      routeMoodNote({ kind: 'lost', drop: 0.3 }).indexOf(CFG.balancedThreshold + ' or more') !== -1, true);
    check('a dead end is not called a lost verdict',
      routeMoodNote({ kind: 'blocked', drop: null }) === routeMoodNote({ kind: 'lost', drop: 0.3 }), false);

    check('numbers lose floating point dust', num(-3 * 0.7), '-2.1');
    check('and never read "-0"', num(-0.001), '0');
    check('lists read naturally', listOf(['a', 'b', 'c']), 'a, b and c');

    var woods = [
      { col: 0, row: 4, typeId: 'farmland', techId: 'lattice' },
      { col: 1, row: 4, typeId: 'woodland', techId: 'lattice' }
    ];
    var told = explainLast(woods, [open(74), open(74), open(71)]);
    check('explain names the span', told.indexOf('Span 2: Woodland on Lattice pylons') === 0, true);
    check('explain names the dial that moved', told.indexOf('environment from 100 to 92.5') !== -1, true);
    check('explain says what the forecast did', told.indexOf('fell from 74 to 71') !== -1, true);
    check('explain in quiet mode gives no score away',
      explainLast(woods, [open(74), open(74), open(71)], true).indexOf('92.5'), -1);

    var why = whyDial('env', woods.concat([{ col: 2, row: 4, typeId: 'sssi', techId: 'lattice' }]), 72.5);
    check('why lists the worst first', why.items[0].indexOf('Designated land') === 0, true);
    check('why leaves out ground that cost nothing', why.items.length, 2);

    say(failed === 0 ? 'All ' + passed + ' checks passed.' : passed + ' passed, ' + failed + ' FAILED.');
    say('');
    return failed === 0;
  }

  return {
    spanOn: spanOn,
    moodOf: moodOf,
    moodSentence: moodSentence,
    routeMoodNote: routeMoodNote,
    moodBadge: moodBadge,
    forecastLine: forecastLine,
    explainLast: explainLast,
    whyDial: whyDial,
    whySpoken: whySpoken,
    trapOf: trapOf,
    trapWords: trapWords,
    lookAhead: lookAhead,
    selfTest: selfTest
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js'),
  typeof Score !== 'undefined' ? Score : require('./score.js')));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = Advice;
}

/* Command line: node js/advice.js --self-test */
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  process.exit(Advice.selfTest() ? 0 : 1);
}
