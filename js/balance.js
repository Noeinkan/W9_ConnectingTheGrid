/* =========================================================================
   Connecting the Grid - balance search
   =========================================================================

   Answers one question about a map: is it worth playing?

   A generated map can be well formed and still be a bad puzzle. It can be
   unwinnable, so a player chasing the balanced verdict is being asked to do
   something impossible. Or it can be trivial, so the greedy answer - go
   straight, spend the least - is also the best answer, and there is no
   decision in the game at all. Both are rejected here, before the map is
   ever shown.

   How the search works
   --------------------
   The route may never revisit a cell, and a naive shortest-path relaxation
   cannot express that: community benefit land carries a POSITIVE community
   value, so a loop around it improves the score for ever and the search
   never terminates.

   The fix is structural. A route is searched as: enter a column on its
   western side, run vertically inside that column, then step east. That
   covers every route that never doubles back west, and because each column
   is entered exactly once, revisits are impossible by construction. The
   search terminates because there are only eleven columns.

   It is not quite every legal route - one that loops back west is not
   considered. That is the right trade. Doubling back always costs extra
   cells to end up somewhere you could have reached directly, so the
   frontier found here is the frontier that matters.

   Three numbers move independently - cost, environment, community - so
   there is no single best route. The search carries a Pareto frontier: the
   set of outcomes where you cannot improve one number without giving up
   another. That frontier is the map's real design.

   Exposes one global: Balance.
   ========================================================================= */

var Balance = (function (CFG, Score) {
  'use strict';

  /* ---------------------------------------------------------------------
     How a state is held
     ---------------------------------------------------------------------
     One number. Not three, and not an object.

     A state is a running total of cost, environment and community. All three
     land on exact tenths - the technology multipliers are 1.0, 1.4, 0.7, 6.0
     and 0.2, so every product with a whole-number terrain value is one - so
     they are carried as whole numbers of tenths and no floating point dust
     ever appears.

     Those three whole numbers are then packed into a single one, and that is
     what makes the search fast enough to run when somebody clicks a button.
     Three things fall out of it:

       * ORDER IS FREE. The packing puts cost in the high digits, then
         environment, then community, each stored so that "smaller number" and
         "better" agree. Sorting states is then an ordinary numeric sort, and
         comparing two of them is one machine comparison rather than six.

       * ADDING A CELL IS ONE ADDITION. Laying a piece changes all three
         totals by fixed amounts, so it changes the packed number by a fixed
         amount too. Each technology on each kind of ground is one constant,
         worked out once.

       * DUPLICATES ARE ADJACENT once sorted, so removing them needs no set
         and no string keys.

     The fields are sized for the worst route the board can hold - ninety-nine
     cells of the most damaging ground - so nothing can spill from one field
     into the next. The whole packed value stays far inside the range where
     JavaScript numbers are exact integers.
     ------------------------------------------------------------------- */

  var FIELD = 16384;              // room per field, in tenths
  var SPAN = FIELD * FIELD;       // where the cost field starts
  var ZERO = 8192;                // what a total of nought packs to

  function pack(cost, env, comm) {
    return cost * SPAN + (ZERO - env) * FIELD + (ZERO - comm);
  }

  /* How much one cell adds. Environment and community are stored inverted,
     so that lower always means better and the numeric order below is the
     order the search wants. */
  function delta(cost, env, comm) {
    return cost * SPAN - env * FIELD - comm;
  }

  function unpack(value) {
    var cost = Math.floor(value / SPAN);
    var rest = value - cost * SPAN;
    var env = Math.floor(rest / FIELD);
    return { cost: cost / 10, env: (ZERO - env) / 10, comm: (ZERO - (rest - env * FIELD)) / 10 };
  }

  // The two lower fields on their own, which is all the pruning below needs.
  function envPart(value) { return Math.floor((value % SPAN) / FIELD); }
  function commPart(value) { return value % FIELD; }

  /* How bad a route is still worth carrying, as a dial reading.

     The search does not need every route on the board. It needs to know
     whether a balanced one exists, how close the best one gets, and what the
     cheapest one scores. A route already down at 40 on cost or environment
     answers none of those - it is being rejected either way - and carrying it
     means carrying everything that grows out of it too.

     Both bounds only ever tighten as a route gets longer: cost only rises and
     environment only falls, because no cell refunds either. So a route past
     one of them can never come back, and dropping it loses nothing that would
     have been reported. Community is NOT bounded here, and must not be:
     connection customers and benefit land pay it back.

     Where to put it is a trade, and the two callers want different answers.
     The game only needs the accept-or-reject decision, and wants it while a
     button click still feels instant; the design tool wants the actual number
     a rejected map reached, however far below the threshold that is. So it is
     a parameter, defaulting to the fast setting, and the command line asks for
     the exact one. Verified across 250 seeds: 0, 40, 55 and 60 all give the
     same verdict on every map, and take 106ms, 46ms, 24ms and 15ms to do it. */
  var DEFAULT_FLOOR = 55;

  /* A safety valve, not a design parameter. If a future rebalance made the
     numbers much finer this stops the search stalling, at the price of
     possibly missing a route. It is reported whenever it bites. */
  var MAX_FRONTIER = 4000;
  var capHits = 0;

  function ascending(a, b) { return a - b; }

  /* Reduces an ORDERED bag of states to the ones that are not beaten
     outright.

     Done naively this is the hot spot of the whole file - every state
     against every other, at every cell of every route. Two things fix it.

     Because the bag is in order, anything already kept is at least as cheap
     as whatever comes next, so the three-way test collapses to a two-way one
     on environment and community.

     Those two are then kept as a STAIRCASE, ordered by environment. Community
     then runs the other way along it, because any pair breaking that order
     would already have been thrown away. So a binary search finds the best
     community value available at a given environment value or better, and one
     comparison against it settles the question. */
  function pruneSorted(sorted) {
    if (sorted.length < 2) { return sorted; }

    var kept = [];
    var envs = [];   // staircase: environment, best first
    var comms = [];  // the matching community values, running the other way
    var previous = -1;

    for (var i = 0; i < sorted.length; i++) {
      var state = sorted[i];

      // Duplicates are common, and in this order they are always adjacent.
      if (state === previous) { continue; }
      previous = state;

      var e = envPart(state);
      var c = commPart(state);

      // First staircase entry whose environment is worse than this one.
      var lo = 0;
      var hi = envs.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (envs[mid] <= e) { lo = mid + 1; } else { hi = mid; }
      }

      // Everything before `lo` is at least as good on environment, and the
      // last of them is the best of them on community.
      if (lo > 0 && comms[lo - 1] <= c) { continue; }

      kept.push(state);

      // This state beats any staircase entry below it on both counts.
      var drop = lo;
      while (drop < envs.length && comms[drop] >= c) { drop++; }
      envs.splice(lo, drop - lo, e);
      comms.splice(lo, drop - lo, c);
    }

    if (kept.length > MAX_FRONTIER) {
      capHits++;
      kept.length = MAX_FRONTIER;
    }
    return kept;
  }

  function prune(states) {
    if (states.length < 2) { return states; }
    states.sort(ascending);
    return pruneSorted(states);
  }

  /* Merges lists that are each already in order, into one that is.

     This is what keeps the sort out of the inner loop. Adding a technology's
     numbers to an ordered list shifts every entry by the same amount, so the
     result is still ordered - and the three technology branches are three
     ordered lists that only need interleaving, never re-sorting. */
  function mergeSorted(lists) {
    if (lists.length === 1) { return lists[0]; }

    var heads = [];
    var total = 0;
    var i;
    for (i = 0; i < lists.length; i++) { heads.push(0); total += lists[i].length; }

    var out = new Array(total);
    for (var n = 0; n < total; n++) {
      var pick = -1;
      for (i = 0; i < lists.length; i++) {
        if (heads[i] >= lists[i].length) { continue; }
        if (pick < 0 || lists[i][heads[i]] < lists[pick][heads[pick]]) { pick = i; }
      }
      out[n] = lists[pick][heads[pick]++];
    }
    return out;
  }

  function merge(into, states) {
    for (var i = 0; i < states.length; i++) { into.push(states[i]); }
  }

  /* ---------------------------------------------------------------------
     The map, and what each cell costs on each technology
     ------------------------------------------------------------------- */

  function gridFrom(rows) {
    return rows.map(function (line) {
      return line.split('').map(function (letter) {
        var typeId = CFG.legend[letter];
        if (!typeId) {
          throw new Error('Map letter "' + letter + '" is not in CONFIG.legend');
        }
        return typeId;
      });
    });
  }

  /* The technologies worth considering on one kind of ground. Pruning here
     rather than in the inner loop is the biggest single saving in the whole
     search: on plain farmland every other technology costs more and spares
     nothing, so two of the three branches disappear before the search
     starts. On woodland all three survive, and should. */
  var optionCache = Object.create(null);

  function optionsFor(typeId) {
    if (typeId in optionCache) { return optionCache[typeId]; }
    var type = CFG.cellTypes[typeId];
    var options = null;

    if (type.passable) {
      var raw = [];
      CFG.technologies.forEach(function (tech) {
        if (tech.bansTerrain.indexOf(typeId) !== -1) { return; }
        raw.push(pack(
          Math.round(type.cost * tech.costMult * 10),
          Math.round(type.envImpact * tech.impactMult * 10),
          Math.round(type.commImpact * tech.impactMult * 10)
        ));
      });
      /* Pruned as if they were whole states, which they are - a one-cell
         route - and then turned back into the amount each one ADDS, which is
         what the search actually adds to a running total. */
      options = raw.length ? prune(raw).map(function (state) {
        var totals = unpack(state);
        return delta(
          Math.round(totals.cost * 10),
          Math.round(totals.env * 10),
          Math.round(totals.comm * 10)
        );
      }) : null;
    }

    optionCache[typeId] = options;
    return options;
  }

  /* ---------------------------------------------------------------------
     Is there a route at all?
     ---------------------------------------------------------------------
     Asked on its own, with the numbers ignored, because the value search
     below throws away anything that has already overspent - and a map whose
     only route is ruinously expensive is still a map with a route on it.
     ------------------------------------------------------------------- */

  function reachable(grid) {
    var rowCount = CFG.grid.rows;
    var seen = [];
    var r;
    for (r = 0; r < rowCount; r++) { seen.push([false, false]); }
    seen[CFG.start.row][0] = true;

    for (var col = 0; col < CFG.grid.cols; col++) {
      var next = [];
      for (r = 0; r < rowCount; r++) { next.push([false, false]); }

      for (var rIn = 0; rIn < rowCount; rIn++) {
        for (var sub = 0; sub < 2; sub++) {
          if (!seen[rIn][sub]) { continue; }
          for (var d = 0; d < 2; d++) {
            var step = d === 0 ? -1 : 1;
            var carried = sub;
            for (var row = rIn; row >= 0 && row < rowCount; row += step) {
              var typeId = grid[row][col];
              if (!CFG.cellTypes[typeId].passable) { break; }
              if (typeId === 'substation') { carried = 1; }
              next[row][carried] = true;
            }
          }
        }
      }
      seen = next;
    }

    return CFG.rules.requireSubstation
      ? seen[CFG.end.row][1]
      : (seen[CFG.end.row][0] || seen[CFG.end.row][1]);
  }

  /* ---------------------------------------------------------------------
     What the very cheapest route costs
     ---------------------------------------------------------------------
     Asked on its own, and it has to be, because of the environment bound
     above. The cheapest route across a map is often the one that ploughs
     straight through the designated land - which is exactly the route that
     bound throws away. Left to the value search, "cheapest" would quietly
     come back as the cheapest route that happened to be clean, which is a
     different thing and would let a trivial map through.

     Cost only, no Pareto set, no technology branching - laying a span on
     anything other than a lattice tower only ever costs more - so this is a
     handful of additions per cell.
     ------------------------------------------------------------------- */

  var floorCache = Object.create(null);

  /* Read from CONFIG rather than picked out of a packed value. Pulling the
     cost field back out of one of those is only safe while the fields below
     it are positive, and community is not: land offered under a benefit
     scheme carries a positive one, which borrows from the field above and
     makes the cost come back a tenth light. Three such cells on a route and
     the cheapest route looks cheaper than any route really is - which then
     reads as "the real cheapest was thrown away", and lets a map through
     whose cheapest route was in fact perfectly balanced. Exactly the kind of
     map this file exists to reject. */
  function cheapestCellCost(typeId) {
    if (typeId in floorCache) { return floorCache[typeId]; }
    var type = CFG.cellTypes[typeId];
    var lowest = null;

    if (type.passable) {
      CFG.technologies.forEach(function (tech) {
        if (tech.bansTerrain.indexOf(typeId) !== -1) { return; }
        var cost = Math.round(type.cost * tech.costMult * 10);
        if (lowest === null || cost < lowest) { lowest = cost; }
      });
    }

    floorCache[typeId] = lowest;
    return lowest;
  }

  function cheapestCost(grid) {
    var colCount = CFG.grid.cols;
    var rowCount = CFG.grid.rows;
    var r;

    function blank() {
      var out = [];
      for (var i = 0; i < rowCount; i++) { out.push([Infinity, Infinity]); }
      return out;
    }

    var best = blank();
    best[CFG.start.row][0] = 0;

    for (var col = 0; col < colCount; col++) {
      var next = blank();

      for (var rIn = 0; rIn < rowCount; rIn++) {
        for (var sub = 0; sub < 2; sub++) {
          if (best[rIn][sub] === Infinity) { continue; }

          for (var d = 0; d < 2; d++) {
            var step = d === 0 ? -1 : 1;
            var running = best[rIn][sub];
            var carried = sub;

            for (var row = rIn; row >= 0 && row < rowCount; row += step) {
              var typeId = grid[row][col];
              var cost = cheapestCellCost(typeId);
              if (cost === null) { break; }
              running += cost;
              if (typeId === 'substation') { carried = 1; }
              if (running < next[row][carried]) { next[row][carried] = running; }
            }
          }
        }
      }
      best = next;
    }

    var finished = CFG.rules.requireSubstation
      ? best[CFG.end.row][1]
      : Math.min(best[CFG.end.row][0], best[CFG.end.row][1]);
    return finished;
  }

  /* ---------------------------------------------------------------------
     The value search
     ------------------------------------------------------------------- */

  // states[row][substationSeen] -> array of [cost, env, comm]
  function emptyStates(rowCount) {
    var out = [];
    for (var r = 0; r < rowCount; r++) { out.push([[], []]); }
    return out;
  }

  /* Pays for one more cell. Every state in a bundle reached this cell along
     the same cells, so they all share one substation flag.

     Anything that has already spent the whole budget is dropped. Its cost
     dial is pinned at zero, so it can be neither the balanced route nor the
     cheapest one, and carrying it on would double the search for nothing.
     Whether a route EXISTS is answered separately, above, so this cannot
     make an expensive map look like an impossible one. */
  function advance(bundle, typeId, limits) {
    var options = optionsFor(typeId);
    if (!options) { return null; }          // open water: the run stops here

    var branches = [];
    for (var k = 0; k < options.length; k++) {
      var option = options[k];
      var source = bundle.list;
      var shifted = [];
      for (var i = 0; i < source.length; i++) {
        var moved = source[i] + option;
        // The source is cheapest first, so everything after this overspends too.
        if (moved >= limits.cost) { break; }
        // Wrecked the environment past the point of being worth reporting.
        if (moved % SPAN >= limits.env) { continue; }
        shifted.push(moved);
      }
      if (shifted.length) { branches.push(shifted); }
    }
    if (!branches.length) { return null; }

    return {
      sub: bundle.sub || (typeId === 'substation' ? 1 : 0),
      list: pruneSorted(mergeSorted(branches))
    };
  }

  function explore(rows, floor) {
    var reportFloor = typeof floor === 'number' ? floor : DEFAULT_FLOOR;
    var grid = gridFrom(rows);
    var colCount = CFG.grid.cols;
    var rowCount = CFG.grid.rows;

    /* The bounds explained at REPORT_FLOOR, turned into the two comparisons
       the inner loop actually makes. Cost sits in the top field of the packed
       number, so testing it is one comparison against one threshold. */
    var share = (100 - reportFloor) / 100;
    var limits = {
      cost: (Math.round(CFG.budgets.COST_BUDGET * share * 10) + 1) * SPAN,
      env: (Math.round(ZERO + CFG.budgets.ENV_FLOOR * share * 10) + 1) * FIELD
    };

    capHits = 0;

    var entering = emptyStates(rowCount);
    entering[CFG.start.row][0].push(pack(0, 0, 0));

    for (var col = 0; col < colCount; col++) {
      var leaving = emptyStates(rowCount);

      for (var rIn = 0; rIn < rowCount; rIn++) {
        for (var sub = 0; sub < 2; sub++) {
          var list = entering[rIn][sub];
          if (!list.length) { continue; }

          // The cell the line enters on, then the vertical run out of it.
          var atEntry = advance({ sub: sub, list: list }, grid[rIn][col], limits);
          if (!atEntry) { continue; }
          merge(leaving[rIn][atEntry.sub], atEntry.list);

          for (var d = 0; d < 2; d++) {
            var step = d === 0 ? -1 : 1;
            var run = atEntry;
            for (var r = rIn + step; r >= 0 && r < rowCount; r += step) {
              run = advance(run, grid[r][col], limits);
              if (!run) { break; }
              merge(leaving[r][run.sub], run.list);
            }
          }
        }
      }

      for (var pr = 0; pr < rowCount; pr++) {
        leaving[pr][0] = prune(leaving[pr][0]);
        leaving[pr][1] = prune(leaving[pr][1]);
      }

      // Leaving column `col` eastward is entering column `col + 1`.
      entering = leaving;
    }

    var finished = entering[CFG.end.row][1].slice();
    if (!CFG.rules.requireSubstation) {
      merge(finished, entering[CFG.end.row][0]);
    }
    return summarise(prune(finished), reachable(grid), cheapestCost(grid), reportFloor);
  }

  /* ---------------------------------------------------------------------
     Reading the frontier
     ------------------------------------------------------------------- */

  function readingFor(state) {
    var totals = unpack(state);
    var dials = Score.dialsFor(totals);
    var weakest = Math.min(dials.cost, dials.env, dials.comm);
    var lowest = 'cost';
    if (dials.env === weakest) { lowest = 'env'; }
    if (dials.comm === weakest) { lowest = 'comm'; }
    return { totals: totals, dials: dials, weakest: weakest, lowest: lowest };
  }

  function summarise(frontier, routeExists, floorCost, reportFloor) {
    var readings = frontier.map(readingFor);

    var best = { cost: 0, env: 0, comm: 0 };
    var allRound = null;
    var cheapest = null;

    readings.forEach(function (r) {
      if (r.dials.cost > best.cost) { best.cost = r.dials.cost; }
      if (r.dials.env > best.env) { best.env = r.dials.env; }
      if (r.dials.comm > best.comm) { best.comm = r.dials.comm; }

      if (!allRound || r.weakest > allRound.weakest) { allRound = r; }

      /* "Cheapest" is read generously: of all the least expensive routes,
         the one that manages the best weakest dial. If even that one is
         punished then the map really does punish going cheap - there is no
         cheap route hiding somewhere that would have been fine. */
      if (!cheapest ||
          r.totals.cost < cheapest.totals.cost ||
          (r.totals.cost === cheapest.totals.cost && r.weakest > cheapest.weakest)) {
        cheapest = r;
      }
    });

    /* If the cheapest route the search kept costs MORE than the cheapest
       route that exists, the real one was thrown away by the environment
       bound - which is only possible if it wrecks the environment. So it is
       punished, and punished on environment, and that much can be said
       without having carried it all the way here. */
    var trimmed = false;
    if (floorCost !== Infinity &&
        (!cheapest || Math.round(cheapest.totals.cost * 10) > floorCost)) {
      trimmed = true;
      cheapest = {
        totals: { cost: floorCost / 10, env: null, comm: null },
        dials: { cost: Score.dialsFor({ cost: floorCost / 10, env: 0, comm: 0 }).cost, env: null, comm: null },
        weakest: 0,
        lowest: 'env',
        belowFloor: true
      };
    }

    return {
      frontier: readings,
      size: readings.length,
      routeExists: routeExists,
      best: best,
      allRound: allRound,
      cheapest: cheapest,
      cheapestTrimmed: trimmed,
      reportFloor: reportFloor,
      cappedAt: capHits
    };
  }

  /* ---------------------------------------------------------------------
     The accept test
     ---------------------------------------------------------------------
     Three things have to be true, and a map failing any of them is rerolled
     rather than shown. If the acceptance rate ever gets low, the answer is
     to retune the generator - never to soften what is below.
     ------------------------------------------------------------------- */

  function verdict(rows, floor) {
    var found = explore(rows, floor);
    var threshold = CFG.balancedThreshold;
    var want = (CFG.generator && CFG.generator.punishCheapOn) || 'any';

    var scoreable = found.size > 0;
    var solvable = found.routeExists;
    var balanced = scoreable && found.allRound.weakest >= threshold;
    var nonTrivial = !!found.cheapest && found.cheapest.weakest < threshold;
    var punishedOn = found.cheapest ? found.cheapest.lowest : null;
    var punishedRight = nonTrivial && (want === 'any' || punishedOn === want);

    /* Anything the search kept scores at least REPORT_FLOOR on cost and on
       environment, so a best-weakest below that means everything better was
       thrown away and the exact figure would be made up. Say so instead. */
    var honest = scoreable && found.allRound.weakest >= found.reportFloor
      ? 'best weakest dial ' + found.allRound.weakest
      : 'no route gets near it';

    var reason = 'ok';
    if (!solvable) {
      reason = 'no route reaches the demand centre through a substation';
    } else if (!scoreable) {
      reason = 'every route is ruinous on cost or environment';
    } else if (!balanced) {
      reason = 'the balanced verdict is unreachable (' + honest + ')';
    } else if (!nonTrivial) {
      reason = 'the cheapest route is already balanced, so there is no trade-off';
    } else if (!punishedRight) {
      reason = 'the cheapest route is punished on ' + punishedOn + ', not ' + want;
    }

    return {
      ok: solvable && scoreable && balanced && nonTrivial && punishedRight,
      solvable: solvable,
      balanced: balanced,
      nonTrivial: nonTrivial,
      punishedOn: punishedOn,
      reason: reason,
      found: found
    };
  }

  return {
    explore: explore,
    verdict: verdict,
    gridFrom: gridFrom
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js'),
  typeof Score !== 'undefined' ? Score : require('./score.js')));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = Balance;
}


/* =========================================================================
   Command line: the design tool
   =========================================================================

     node js/balance.js                  check one fresh seed, in detail
     node js/balance.js SEED             check that seed, in detail
     node js/balance.js --seeds 500      sweep the seed space

   The sweep is the one that matters. It reports what share of generated
   maps are worth playing and why the rest were thrown away, so the
   generator gets tuned against evidence rather than against a hunch.
   ========================================================================= */

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  (function () {
    var Rng = require('./rng.js');
    var MapGen = require('./mapgen.js');
    var CFG = require('./config.js');
    var argv = process.argv.slice(2);

    function pad(text, width) {
      text = String(text);
      while (text.length < width) { text = ' ' + text; }
      return text;
    }

    function detail(seed) {
      var map = MapGen.build(seed);
      // Exact, however long it takes: this view exists to be read closely.
      var v = Balance.verdict(map.rows, 0);

      console.log('');
      console.log('Seed ' + seed);
      console.log('');
      map.rows.forEach(function (line, row) { console.log('  row ' + row + '  ' + line); });
      console.log('');
      console.log('  ' + (v.ok ? 'ACCEPTED' : 'REJECTED') + '  ' + v.reason);
      if (!v.found.size) { console.log(''); return v.ok; }

      console.log('  frontier      ' + v.found.size + ' routes worth considering' +
                  (v.found.cappedAt ? ' (frontier cap hit ' + v.found.cappedAt + ' times)' : ''));
      console.log('  best possible cost ' + v.found.best.cost +
                  ', environment ' + v.found.best.env +
                  ', community ' + v.found.best.comm);
      console.log('  most balanced cost ' + v.found.allRound.dials.cost +
                  ', environment ' + v.found.allRound.dials.env +
                  ', community ' + v.found.allRound.dials.comm +
                  '   -> weakest ' + v.found.allRound.weakest);

      if (v.found.cheapestTrimmed) {
        console.log('  cheapest      cost ' + v.found.cheapest.dials.cost +
                    ', and so bad on environment it was not worth carrying');
      } else {
        console.log('  cheapest      cost ' + v.found.cheapest.dials.cost +
                    ', environment ' + v.found.cheapest.dials.env +
                    ', community ' + v.found.cheapest.dials.comm +
                    '   -> weakest ' + v.found.cheapest.weakest +
                    ', punished on ' + v.found.cheapest.lowest);
      }
      console.log('');
      return v.ok;
    }

    function sweep(count) {
      var rng = Rng.make('balance-sweep');
      var accepted = 0;
      var reasons = {};
      var weakest = [];
      var started = Date.now();

      for (var i = 0; i < count; i++) {
        var map = MapGen.build(Rng.seedString(rng, CFG.generator.seedLength));
        var v = Balance.verdict(map.rows);
        var key = v.ok ? 'accepted' : v.reason.replace(/\s*\(.*\)/, '');
        reasons[key] = (reasons[key] || 0) + 1;
        if (v.ok) { accepted++; weakest.push(v.found.allRound.weakest); }
      }

      var elapsed = Date.now() - started;
      console.log('');
      console.log('Connecting the Grid - generator sweep');
      console.log('=====================================');
      console.log('');
      console.log('  ' + count + ' seeds, ' + accepted + ' accepted (' +
                  (100 * accepted / count).toFixed(1) + '%)');
      console.log('  ' + (elapsed / count).toFixed(1) + 'ms to build and check each');
      console.log('');
      Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; })
        .forEach(function (key) { console.log('  ' + pad(reasons[key], 5) + '  ' + key); });

      if (weakest.length) {
        weakest.sort(function (a, b) { return a - b; });
        console.log('');
        console.log('  the balanced route on an accepted map reaches a weakest dial of');
        console.log('    worst ' + weakest[0] +
                    ', median ' + weakest[Math.floor(weakest.length / 2)] +
                    ', best ' + weakest[weakest.length - 1] +
                    '   (needs ' + CFG.balancedThreshold + ')');
      }
      console.log('');

      /* A low rate means the generator wants retuning, not that this test
         wants relaxing. Half is generous; below that something is wrong. */
      return accepted / count >= 0.5;
    }

    if (argv[0] === '--seeds') {
      process.exit(sweep(Number(argv[1]) || 200) ? 0 : 1);
    } else {
      process.exit(detail(argv[0] || Rng.seedString(Rng.make(Date.now()), CFG.generator.seedLength)) ? 0 : 1);
    }
  }());
}
