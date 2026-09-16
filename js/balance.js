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
     land on exact tenths - every figure in CONFIG's technology table is
     written to one decimal place, which the scoring self test checks - so
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

     Environment only ever falls, because no cell repairs it, so a route past
     that bound can never come back and dropping it loses nothing.

     Cost is nearly the same story but not quite. It rises on every kind of
     ground but one: connection funding refunds it. A route can therefore go
     past a fixed cost bound and come back under it, so the bound is not a
     fixed figure - it is the budget PLUS every refund still on the map. That
     is generous, and deliberately so: a bound that is too tight throws away
     routes that would have been reported, which is a wrong answer, while one
     that is too loose only costs time. See costCeiling below.

     Community is NOT bounded here, and must not be: connection customers and
     benefit land pay it back, and always could.

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
     starts. Beside houses a T-pylon survives there too, and should.

     A square beside houses is its own entry, because it scores differently
     from the same ground anywhere else. */
  var optionCache = Object.create(null);

  function optionsFor(typeId, beside) {
    var cacheKey = beside ? typeId + '|beside' : typeId;
    if (cacheKey in optionCache) { return optionCache[cacheKey]; }
    var type = CFG.cellTypes[typeId];
    var options = null;

    if (type.passable) {
      var raw = [];
      CFG.technologies.forEach(function (tech) {
        if (tech.bansTerrain.indexOf(typeId) !== -1) { return; }
        var span = Score.scoreSegment(typeId, tech.id, beside);
        raw.push(pack(
          Math.round(span.cost * 10),
          Math.round(span.env * 10),
          Math.round(span.comm * 10)
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

    optionCache[cacheKey] = options;
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

     Cost only, no Pareto set, no technology branching - each cell simply
     takes its cheapest allowed technology, lattice almost everywhere and
     cable under houses - so this is a handful of additions per cell.
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
        var cost = Math.round(Score.scoreSegment(typeId, tech.id).cost * 10);
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
     make an expensive map look like an impossible one.

     `beside` is whether this cell shares an edge with houses; the caller
     reads it off Score.besideHomesGrid once per landscape. */
  function advance(bundle, typeId, beside, limits, note) {
    var options = optionsFor(typeId, beside);
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
        /* Only when somebody is tracing a route back. Absent on the path the
           generator takes, which runs this loop tens of thousands of times
           per map and must not pay for a feature it never uses. */
        if (note) { note(moved, source[i], option); }
      }
      if (shifted.length) { branches.push(shifted); }
    }
    if (!branches.length) { return null; }

    return {
      sub: bundle.sub || (typeId === 'substation' ? 1 : 0),
      list: pruneSorted(mergeSorted(branches))
    };
  }

  /* Every tenth of cost the map could still give back, added to the cost
     bound so that it stays admissible.

     A route that has overspent may yet be redeemed by funding it has not
     reached, so the bound has to allow for all of it. Counting what is on
     the whole board rather than what is still ahead is looser than it needs
     to be and much simpler to be sure of; on a map with no funding on it at
     all this adds nothing and the bound is exactly what it always was. */
  function refundOn(grid) {
    var total = 0;
    for (var row = 0; row < grid.length; row++) {
      for (var col = 0; col < grid[row].length; col++) {
        var cheapest = cheapestCellCost(grid[row][col]);
        if (cheapest !== null && cheapest < 0) { total -= cheapest; }
      }
    }
    return total;
  }

  /* The bounds explained at DEFAULT_FLOOR, turned into the two comparisons
     the inner loop actually makes. Cost sits in the top field of the packed
     number, so testing it is one comparison against one threshold. */
  function limitsFor(grid, reportFloor) {
    var share = (100 - reportFloor) / 100;
    return {
      cost: (Math.round(CFG.budgets.COST_BUDGET * share * 10) + refundOn(grid) + 1) * SPAN,
      env: (Math.round(ZERO + CFG.budgets.ENV_FLOOR * share * 10) + 1) * FIELD
    };
  }

  function explore(rows, floor, tracer) {
    var reportFloor = typeof floor === 'number' ? floor : DEFAULT_FLOOR;
    var grid = gridFrom(rows);
    var near = Score.besideHomesGrid(grid);
    var colCount = CFG.grid.cols;
    var rowCount = CFG.grid.rows;
    var limits = limitsFor(grid, reportFloor);

    capHits = 0;

    var entering = emptyStates(rowCount);
    entering[CFG.start.row][0].push(pack(0, 0, 0));

    for (var col = 0; col < colCount; col++) {
      var leaving = emptyStates(rowCount);

      for (var rIn = 0; rIn < rowCount; rIn++) {
        for (var sub = 0; sub < 2; sub++) {
          var list = entering[rIn][sub];
          if (!list.length) { continue; }

          /* The cell the line enters on, then the vertical run out of it.

             The extra argument is the trace hook, and is undefined unless
             somebody is reconstructing a route. It says which cell the line
             is stepping FROM and which it is stepping ON TO, which is the
             one thing the packed numbers themselves cannot remember. */
          var atEntry = advance({ sub: sub, list: list }, grid[rIn][col], near[rIn][col], limits,
            tracer && tracer.step(col - 1, rIn, sub, col, rIn, grid[rIn][col]));
          if (!atEntry) { continue; }
          merge(leaving[rIn][atEntry.sub], atEntry.list);

          for (var d = 0; d < 2; d++) {
            var step = d === 0 ? -1 : 1;
            var run = atEntry;
            var fromRow = rIn;
            for (var r = rIn + step; r >= 0 && r < rowCount; r += step) {
              var was = run;
              run = advance(was, grid[r][col], near[r][col], limits,
                tracer && tracer.step(col, fromRow, was.sub, col, r, grid[r][col]));
              if (!run) { break; }
              merge(leaving[r][run.sub], run.list);
              fromRow = r;
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

  /* The tie-break here has to be the same one the player's verdict uses, or
     this search can accept a map for a reason the player is never shown.
     Score.lowestDial is that single answer - see the note above it. */
  function readingFor(state) {
    var totals = unpack(state);
    var dials = Score.dialsFor(totals);
    var lowest = Score.lowestDial(dials);
    return {
      // Kept so a route reaching exactly these totals can be traced back.
      packed: state,
      totals: totals,
      dials: dials,
      weakest: lowest.value,
      lowest: lowest.key
    };
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
     Tracing one route back
     ---------------------------------------------------------------------
     The search knows what the best route on a landscape SCORES long before
     the player ever sees the map. It has never known which route that is:
     the packed totals are a running sum and a sum does not remember what
     was added to it.

     So the same search runs a second time with a note taken of where every
     state came from, and the answer is walked backwards from the finishing
     total. That doubling is deliberate. The first pass runs up to two dozen
     times per landscape while the generator is looking for one worth
     playing, and must stay fast; this one runs once, after the game is
     already over, when nobody is waiting on it.

     Two things make the walk exact rather than a guess. The search is
     west-free, so a route enters each column once and the chain cannot
     loop. And each step records how much it ADDED, which is enough to say
     which technology was used - the totals alone could not.
     ------------------------------------------------------------------- */

  function nodeKey(col, row, sub, packed) {
    return col + ':' + row + ':' + sub + ':' + packed;
  }

  // What one cell on one technology adds, in the search's packed units.
  function deltaOf(typeId, tech, beside) {
    var span = Score.scoreSegment(typeId, tech.id, beside);
    return delta(
      Math.round(span.cost * 10),
      Math.round(span.env * 10),
      Math.round(span.comm * 10)
    );
  }

  /* Which technology was used, read back off the amount the step added.
     Two technologies scoring identically on one kind of ground would be
     indistinguishable here, and either answer would be right. */
  function techFromDelta(typeId, beside, added) {
    for (var i = 0; i < CFG.technologies.length; i++) {
      var tech = CFG.technologies[i];
      if (tech.bansTerrain.indexOf(typeId) !== -1) { continue; }
      if (deltaOf(typeId, tech, beside) === added) { return tech.id; }
    }
    return null;
  }

  /* The route that reaches `packedTarget`, as an ordered list of cells from
     the generation site to the demand centre. Returns null if it cannot be
     traced, which the caller should treat as "do not show one" rather than
     as an error - a route nobody can reconstruct is not one worth drawing.

     `floor` must match the one the target was found at, or the states it
     passed through will have been pruned on the way. */
  function traceBest(rows, packedTarget, floor) {
    var parents = Object.create(null);

    var tracer = {
      step: function (fromCol, fromRow, fromSub, toCol, toRow, typeId) {
        var toSub = fromSub || (typeId === 'substation' ? 1 : 0);
        return function (moved, source, added) {
          var key = nodeKey(toCol, toRow, toSub, moved);
          /* First one wins. Several routes can arrive at identical totals,
             and by definition they are equally good - there is nothing to
             choose between them, so there is no reason to look further. */
          if (parents[key] === undefined) {
            parents[key] = {
              col: fromCol, row: fromRow, sub: fromSub,
              packed: source, added: added
            };
          }
        };
      }
    };

    explore(rows, typeof floor === 'number' ? floor : DEFAULT_FLOOR, tracer);

    var grid = gridFrom(rows);
    var near = Score.besideHomesGrid(grid);
    var subs = CFG.rules.requireSubstation ? [1] : [1, 0];

    for (var i = 0; i < subs.length; i++) {
      var chain = walkBack(parents, grid, near, CFG.end.col, CFG.end.row, subs[i], packedTarget);
      if (chain) { return chain; }
    }
    return null;
  }

  function walkBack(parents, grid, near, col, row, sub, packed) {
    var chain = [];
    var at = { col: col, row: row, sub: sub, packed: packed };

    // One entry per cell of the board is the most any west-free route holds.
    var guard = CFG.grid.cols * CFG.grid.rows + 1;

    while (at.col >= 0) {
      if (chain.length > guard) { return null; }

      var found = parents[nodeKey(at.col, at.row, at.sub, at.packed)];
      if (!found) { return null; }

      var typeId = grid[at.row][at.col];
      var beside = near[at.row][at.col];
      chain.push({
        col: at.col,
        row: at.row,
        typeId: typeId,
        techId: techFromDelta(typeId, beside, found.added),
        beside: beside
      });

      at = { col: found.col, row: found.row, sub: found.sub, packed: found.packed };
    }

    chain.reverse();
    return chain;
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
      reason = 'no route reaches the grid supply point through a substation';
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
    traceBest: traceBest,
    gridFrom: gridFrom,

    /* The search's own moving parts, for js/foresight.js, which runs the
       same search from the end of a half-built line instead of from the
       generation site. Lent rather than copied, so the two can never
       disagree about what a span costs or which states are worth keeping. */
    core: {
      DEFAULT_FLOOR: DEFAULT_FLOOR,
      pack: pack,
      advance: advance,
      prune: prune,
      merge: merge,
      emptyStates: emptyStates,
      limitsFor: limitsFor,
      readingFor: readingFor
    }
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
