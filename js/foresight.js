/* =========================================================================
   Connecting the Grid - the best finish still open
   =========================================================================

   Answers one question about a half-built line: if the player routed
   perfectly from here on, how well could the connection still finish?

   The balance search in js/balance.js already asks that question once per
   landscape, from the generation site, before the map is shown. This file
   asks it again from wherever the line has got to, after every span. The
   difference between two answers is the most useful thing the game can
   tell a player mid-route: "that span cost you three points you can never
   get back", said the moment it happens rather than at the verdict.

   What it deliberately does NOT say is which way to go. It reports a
   number and the verdict that number would earn, never the route that
   earns it. Drawn on the map it would be an answer key, and the game only
   offers that once the connection is finished.

   How the search differs from the one it borrows
   ----------------------------------------------
   Two changes, and nothing else.

     * It starts on the highlighted square, carrying the totals the line
       has already run up, instead of starting on the generation site with
       nothing spent.
     * The squares the line already runs through are closed, because the
       route may never cross itself.

   Everything else - what a span costs on each technology, which states are
   worth keeping, the packing that makes it fast - is Balance's own code,
   lent through Balance.core. The first forecast on an empty board is
   therefore exactly the par figure the landscape was accepted on, and the
   self test below holds it to that.

   Like Balance, the search never doubles back west. So it is the best
   finish FOUND, not a proof of the best possible, and the copy in
   config.js says "found" on purpose.

   Pure: no page, no game state. Loads in the browser and under Node.
   Exposes one global: Foresight.
   ========================================================================= */

var Foresight = (function (CFG, Score, Balance) {
  'use strict';

  var core = Balance.core;

  /* ---------------------------------------------------------------------
     The sweep
     ---------------------------------------------------------------------
     Column by column eastward from the highlighted square, exactly as
     Balance.explore walks the whole board from the generation site: enter
     a column, run up or down inside it, step east.

     Written once, with the two things that differ between callers passed
     in - what one more square does to a bundle of states, and how a pile of
     states is tidied at the end of a column. The value search passes
     Balance's own; the plain "is there any way through" question passes
     a version that only remembers yes or no.
     ------------------------------------------------------------------- */

  function sweep(grid, near, closed, target, start, step, tidy) {
    var rowCount = CFG.grid.rows;
    var entering = null;

    for (var col = target.col; col < CFG.grid.cols; col++) {
      var leaving = core.emptyStates(rowCount);

      for (var rIn = 0; rIn < rowCount; rIn++) {
        for (var sub = 0; sub < 2; sub++) {
          var bundle;
          if (col === target.col) {
            // The first column is entered at one square only: the one in play.
            if (rIn !== target.row || sub !== start.sub) { continue; }
            bundle = start;
          } else {
            if (!entering[rIn][sub].length) { continue; }
            bundle = { sub: sub, list: entering[rIn][sub] };
          }
          if (closed[rIn][col]) { continue; }

          var atEntry = step(bundle, grid[rIn][col], near[rIn][col]);
          if (!atEntry) { continue; }
          core.merge(leaving[rIn][atEntry.sub], atEntry.list);

          for (var d = 0; d < 2; d++) {
            var dir = d === 0 ? -1 : 1;
            var run = atEntry;
            for (var r = rIn + dir; r >= 0 && r < rowCount; r += dir) {
              // The line may not cross itself, so its own squares end a run.
              if (closed[r][col]) { break; }
              run = step(run, grid[r][col], near[r][col]);
              if (!run) { break; }
              core.merge(leaving[r][run.sub], run.list);
            }
          }
        }
      }

      for (var pr = 0; pr < rowCount; pr++) {
        leaving[pr][0] = tidy(leaving[pr][0]);
        leaving[pr][1] = tidy(leaving[pr][1]);
      }
      entering = leaving;
    }

    // Leaving the last column eastward, on the demand centre's row, is arriving.
    var finished = entering[CFG.end.row][1].slice();
    if (!CFG.rules.requireSubstation) {
      core.merge(finished, entering[CFG.end.row][0]);
    }
    return tidy(finished);
  }

  // The yes-or-no version of one more square: passable or not, nothing counted.
  function passStep(bundle, typeId) {
    if (!CFG.cellTypes[typeId].passable) { return null; }
    return { sub: bundle.sub || (typeId === 'substation' ? 1 : 0), list: [0] };
  }

  function passTidy(list) { return list.length ? [0] : list; }

  /* ---------------------------------------------------------------------
     The forecast
     ------------------------------------------------------------------- */

  function closedBy(route) {
    var closed = [];
    for (var r = 0; r < CFG.grid.rows; r++) {
      var line = [];
      for (var c = 0; c < CFG.grid.cols; c++) { line.push(false); }
      closed.push(line);
    }
    route.forEach(function (segment) { closed[segment.row][segment.col] = true; });
    return closed;
  }

  /* The best finish still open from `target`, the square the next span goes
     on, given the spans already in `route`.

       rows    the landscape, as Score.mapRows() gives it
       route   the spans laid so far, as game.js keeps them
       target  { col, row }, or null once there is nowhere left to build
       floor   optional; see DEFAULT_FLOOR in balance.js. Leave it off and
               the reading is comparable with the par figure.

     Returns one of:

       { status: 'open', weakest, lowest, dials, verdictKey, balanced }
           the best finish found, and what it would score
       { status: 'belowFloor', floor }
           there is a way through, but every one found leaves at least one
           dial under the floor, so an exact figure would be made up
       { status: 'blocked' }
           no way on to the demand centre that does not double back */
  function ahead(rows, route, target, floor) {
    if (!target) { return { status: 'blocked' }; }

    var reportFloor = typeof floor === 'number' ? floor : core.DEFAULT_FLOOR;
    var grid = Balance.gridFrom(rows);
    var closed = closedBy(route);
    if (target.row < 0 || target.row >= CFG.grid.rows ||
        target.col < 0 || target.col >= CFG.grid.cols || closed[target.row][target.col]) {
      return { status: 'blocked' };
    }

    var scored = Score.scoreRoute(route);
    var totals = scored.totals;
    var sub = scored.crossesSubstation ? 1 : 0;

    /* Totals always land on exact tenths - see the note at the top of
       balance.js - so rounding here only removes floating point dust. */
    var start = {
      sub: sub,
      list: [core.pack(
        Math.round(totals.cost * 10),
        Math.round(totals.env * 10),
        Math.round(totals.comm * 10)
      )]
    };

    var limits = core.limitsFor(grid, reportFloor);
    var near = Score.besideHomesGrid(grid);
    var finished = sweep(grid, near, closed, target, start, function (bundle, typeId, beside) {
      return core.advance(bundle, typeId, beside, limits);
    }, core.prune);

    if (!finished.length) {
      /* Nothing scored above the floor. Whether that is because nothing
         gets through at all is a separate, much cheaper question. */
      var through = sweep(grid, near, closed, target, { sub: sub, list: [0] }, passStep, passTidy);
      return through.length
        ? { status: 'belowFloor', floor: reportFloor }
        : { status: 'blocked' };
    }

    /* Same choice, in the same order, as Balance's summarise(): the first
       state with the best weakest dial. That is what makes the forecast on
       an empty board equal the par figure to the decimal. */
    var best = null;
    finished.forEach(function (state) {
      var reading = core.readingFor(state);
      if (!best || reading.weakest > best.weakest) { best = reading; }
    });

    /* Under the floor the figure is not exact. A state thrown away for
       overspending might still have finished a whisker better than the one
       kept, so the honest reading is the floor itself - the same rule
       Balance.verdict applies before it quotes a number. */
    if (best.weakest < reportFloor) {
      return { status: 'belowFloor', floor: reportFloor };
    }

    return {
      status: 'open',
      weakest: best.weakest,
      lowest: best.lowest,
      dials: best.dials,
      verdictKey: Score.verdictKeyFor(best.dials),
      balanced: best.weakest >= CFG.balancedThreshold
    };
  }

  /* ---------------------------------------------------------------------
     Self test
     ---------------------------------------------------------------------
     Run with: node js/foresight.js --self-test

     The checks are about agreeing with the search it borrows from, because
     a forecast that disagrees with par is worse than no forecast.
     ------------------------------------------------------------------- */

  function selfTest(MapGen, log) {
    var say = log || function (line) { console.log(line); };
    var passed = 0;
    var failed = 0;
    var timings = [];

    function check(description, ok, detail) {
      if (ok) { passed++; } else { failed++; say('  FAIL  ' + description + (detail ? '\n          ' + detail : '')); }
    }

    function timed(rows, route, target, floor) {
      var began = Date.now();
      var out = ahead(rows, route, target, floor);
      timings.push(Date.now() - began);
      return out;
    }

    var SEEDS = ['9MA7JX', 'K3F9QZ', 'A1B2C3', 'PYLON1', 'RIVER7', 'WOODS4', 'GRID42', 'TOWN88'];

    say('');
    say('Connecting the Grid - forecast self test');
    say('========================================');

    SEEDS.forEach(function (seed) {
      var built = MapGen.generate(seed, Balance.verdict);
      var rows = built.rows;
      var par = built.verdict.found.allRound;
      Score.setMap(rows);

      // 1. On an empty board the forecast IS par.
      var first = timed(rows, [], { col: CFG.start.col, row: CFG.start.row });
      check(seed + ': empty board forecast equals par',
        first.status === 'open' && first.weakest === par.weakest,
        'par ' + par.weakest + ', forecast ' + JSON.stringify(first));

      // 2. Following the best route found never loses a point of it.
      var chain = Balance.traceBest(rows, par.packed);
      check(seed + ': best route traces', !!chain && chain.length > 0);
      if (chain) {
        var steady = true;
        var where = '';
        for (var k = 1; k < chain.length; k++) {
          var prefix = chain.slice(0, k);
          var reading = timed(rows, prefix, { col: chain[k].col, row: chain[k].row });
          if (reading.status !== 'open' || reading.weakest !== par.weakest) {
            steady = false;
            where = 'after ' + k + ' spans: ' + JSON.stringify(reading);
            break;
          }
        }
        check(seed + ': following the best route keeps the forecast at par', steady, where);
      }

      /* 3. A span can only take away. Random walks that never step west,
            checking that no span ever raises the best finish still open. */
      var rng = 0;
      for (var i = 0; i < seed.length; i++) { rng = (rng * 31 + seed.charCodeAt(i)) >>> 0; }
      function roll(n) { rng = (rng * 1103515245 + 12345) >>> 0; return rng % n; }

      for (var walk = 0; walk < 6; walk++) {
        var route = [];
        var at = { col: CFG.start.col, row: CFG.start.row };
        var before = first;
        var monotone = true;
        var note = '';

        for (var s = 0; s < 30 && before.status !== 'blocked'; s++) {
          var typeId = Score.typeIdAt(at.col, at.row);
          if (!typeId || !CFG.cellTypes[typeId].passable) { break; }
          var techs = CFG.technologies.filter(function (t) { return t.bansTerrain.indexOf(typeId) === -1; });
          route.push({ col: at.col, row: at.row, typeId: typeId, techId: techs[roll(techs.length)].id,
            beside: Score.besideHomes(at.col, at.row) });

          var options = [[1, 0], [0, -1], [0, 1]].map(function (d) {
            return { col: at.col + d[0], row: at.row + d[1] };
          }).filter(function (p) {
            return p.col < CFG.grid.cols && p.row >= 0 && p.row < CFG.grid.rows &&
              !route.some(function (q) { return q.col === p.col && q.row === p.row; });
          });
          if (!options.length) { break; }
          at = options[roll(options.length)];

          var after = timed(rows, route, at);
          if (before.status === 'open' && after.status === 'open' && after.weakest > before.weakest) {
            monotone = false;
            note = 'span ' + route.length + ': ' + before.weakest + ' -> ' + after.weakest;
            break;
          }
          if (before.status !== 'open' && after.status === 'open') {
            monotone = false;
            note = 'span ' + route.length + ': ' + before.status + ' -> open';
            break;
          }
          before = after;
        }
        check(seed + ': walk ' + walk + ' never raises the forecast', monotone, note);
      }

      // 4. A line that has already overspent reports the floor, not a guess.
      var costly = [];
      for (var c = 0; c < CFG.end.col; c++) {
        var t = Score.typeIdAt(c, CFG.end.row);
        if (!CFG.cellTypes[t].passable) { costly = null; break; }
        costly.push({ col: c, row: CFG.end.row, typeId: t, techId: t === 'river' ? 'lattice' : 'cable',
          beside: Score.besideHomes(c, CFG.end.row) });
      }
      if (costly && Score.scoreRoute(costly).dials.cost < core.DEFAULT_FLOOR) {
        var broke = timed(rows, costly, { col: CFG.end.col, row: CFG.end.row });
        check(seed + ': an overspent line reads below the floor',
          broke.status === 'belowFloor', JSON.stringify(broke));
      }
    });

    // 5. Squares the line cannot use.
    var trapped = ahead(Score.mapRows(), [{ col: 0, row: 4, typeId: 'farmland', techId: 'lattice' }],
      { col: 0, row: 4 });
    check('a target the line already runs through is blocked', trapped.status === 'blocked');
    check('no target at all is blocked', ahead(Score.mapRows(), [], null).status === 'blocked');

    timings.sort(function (a, b) { return a - b; });
    var total = timings.reduce(function (sum, ms) { return sum + ms; }, 0);

    say('');
    say('  ' + timings.length + ' forecasts: median ' + timings[Math.floor(timings.length / 2)] +
        'ms, slowest ' + timings[timings.length - 1] + 'ms, mean ' +
        (total / timings.length).toFixed(1) + 'ms');
    say('');
    say(failed === 0
      ? 'All ' + passed + ' checks passed.'
      : passed + ' passed, ' + failed + ' FAILED.');
    say('');
    return failed === 0;
  }

  return {
    ahead: ahead,
    selfTest: selfTest
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js'),
  typeof Score !== 'undefined' ? Score : require('./score.js'),
  typeof Balance !== 'undefined' ? Balance : require('./balance.js')));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = Foresight;
}

/* Command line: node js/foresight.js --self-test */
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  process.exit(Foresight.selfTest(require('./mapgen.js')) ? 0 : 1);
}
