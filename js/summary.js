/* =========================================================================
   Connecting the Grid - the route so far, in facts
   =========================================================================

   What the line as built amounts to: how long it is, what ground it has
   crossed, what it was built with, and which dial would decide the verdict
   if it finished now.

   Facts only, on purpose. What the route could still become is the
   forecast's question (js/foresight.js), and what each span did to it is
   the guidance's (js/guidance.js). This file never looks ahead further
   than the plain distance still to cover, so the two cannot disagree and a
   screen reader never hears the same news twice.

   Pure: no page, no game state of its own. Loads in the browser and under
   Node. Exposes one global: Summary.
   ========================================================================= */

var Summary = (function (CFG, Score) {
  'use strict';

  /* Counts per id, in the order CONFIG lists them, leaving out anything the
     route has not touched. CONFIG order rather than most-first, so a kind
     of ground does not jump about the panel as the counts change. */
  function tally(route, field, order, labelOf) {
    var counts = Object.create(null);
    route.forEach(function (segment) {
      counts[segment[field]] = (counts[segment[field]] || 0) + 1;
    });
    return order
      .filter(function (id) { return counts[id]; })
      .map(function (id) { return { id: id, label: labelOf(id), count: counts[id] }; });
  }

  /* The fewest spans that could still reach the demand centre: every
     column and row between the square in play and it, plus the square in
     play itself. A floor, never a promise - the ground in between may make
     the real number longer. */
  function spansAhead(target) {
    if (!target) { return null; }
    return Math.abs(CFG.end.col - target.col) + Math.abs(CFG.end.row - target.row) + 1;
  }

  /* The summary of a route.

       route    the spans laid, as game.js keeps them
       dials    the three dial readings now, as Score.scoreRoute gives them
       target   the square the next span goes on, or null
       phase    game.js's phase, so a finished route says it has arrived

     Returns { spans, ahead, arrived, ground[], tech[], holding }. `holding`
     is the dial that would decide the verdict if the route finished now -
     { key, label, value, threshold } - or null when all three clear the
     threshold or nothing has been built. */
  function of(route, dials, target, phase) {
    var spans = route.length;
    var holding = null;

    if (spans && dials) {
      var lowest = Score.lowestDial(dials);
      if (lowest.value < CFG.balancedThreshold) {
        var label = lowest.key;
        CFG.dials.forEach(function (dial) { if (dial.id === lowest.key) { label = dial.label; } });
        holding = { key: lowest.key, label: label, value: lowest.value, threshold: CFG.balancedThreshold };
      }
    }

    return {
      spans: spans,
      arrived: phase === 'complete',
      ahead: phase === 'complete' ? 0 : spansAhead(target),
      ground: tally(route, 'typeId', Object.keys(CFG.cellTypes), function (id) {
        return CFG.cellTypes[id].label;
      }),
      tech: tally(route, 'techId', CFG.technologies.map(function (t) { return t.id; }), function (id) {
        return Score.technology(id).short;
      }),
      holding: holding
    };
  }

  /* ---------------------------------------------------------------------
     Self test. Run with: node js/summary.js
     ------------------------------------------------------------------- */

  function selfTest(log) {
    var say = log || function (line) { console.log(line); };
    var passed = 0;
    var failed = 0;

    function check(description, actual, expected) {
      var ok = JSON.stringify(actual) === JSON.stringify(expected);
      if (ok) { passed++; } else { failed++; }
      say((ok ? '  PASS  ' : '  FAIL  ') + description +
          (ok ? '' : '\n          expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)));
    }

    say('');
    say('Connecting the Grid - route summary self test');
    say('=============================================');

    var empty = of([], { cost: 100, env: 100, comm: 100 }, { col: CFG.start.col, row: CFG.start.row }, 'ready');
    check('nothing built: no spans', empty.spans, 0);
    check('nothing built: no verdict to hold back yet', empty.holding, null);
    check('nothing built: the whole width still to cover',
      empty.ahead, Math.abs(CFG.end.col - CFG.start.col) + Math.abs(CFG.end.row - CFG.start.row) + 1);

    var route = [
      { col: 0, row: 4, typeId: 'farmland', techId: 'lattice' },
      { col: 1, row: 4, typeId: 'road', techId: 'cable' },
      { col: 2, row: 4, typeId: 'farmland', techId: 'lattice' },
      { col: 3, row: 4, typeId: 'sssi', techId: 'lattice' },
      { col: 4, row: 4, typeId: 'sssi', techId: 'lattice' }
    ];
    var scored = Score.scoreRoute(route);
    var mid = of(route, scored.dials, { col: 5, row: 4 }, 'routing');

    check('five spans counted', mid.spans, 5);
    check('ground listed in CONFIG order, untouched ground left out',
      mid.ground.map(function (g) { return g.id + ' ' + g.count; }),
      ['farmland 2', 'road 1', 'sssi 2']);
    check('technology listed in CONFIG order',
      mid.tech.map(function (t) { return t.id + ' ' + t.count; }), ['lattice 4', 'cable 1']);
    check('the environment dial is the one holding the verdict back',
      mid.holding && mid.holding.key, 'env');
    check('and it says what the threshold is', mid.holding && mid.holding.threshold, CFG.balancedThreshold);
    check('the distance still to cover is a floor from the square in play',
      mid.ahead, Math.abs(CFG.end.col - 5) + Math.abs(CFG.end.row - 4) + 1);

    var clean = of(route.slice(0, 3), Score.scoreRoute(route.slice(0, 3)).dials, { col: 3, row: 4 }, 'routing');
    check('a route clearing every dial holds nothing back', clean.holding, null);

    var done = of(route, scored.dials, null, 'complete');
    check('a finished route has arrived', done.arrived, true);
    check('and has nothing ahead', done.ahead, 0);

    var stuck = of(route, scored.dials, null, 'stuck');
    check('a route with nowhere to go has no distance to quote', stuck.ahead, null);

    say('');
    say('=============================================');
    say(failed === 0 ? 'All ' + passed + ' checks passed.' : passed + ' passed, ' + failed + ' FAILED.');
    say('');
    return failed === 0;
  }

  return {
    of: of,
    selfTest: selfTest
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js'),
  typeof Score !== 'undefined' ? Score : require('./score.js')));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = Summary;
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  process.exit(Summary.selfTest() ? 0 : 1);
}
