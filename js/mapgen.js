/* =========================================================================
   Connecting the Grid - map generator
   =========================================================================

   Turns a short seed like 'K3F9QZ' into a landscape.

   The hard part of generating a map for this game is not making it look
   like countryside. It is making it a PUZZLE. Noise alone gives pretty
   terrain and a boring game: wander east across some fields, done. So the
   generator does not sprinkle features about and hope. It lays down a
   deliberate structure - a barrier across the direct line, a way round it
   that costs more, a river and a road that nobody can avoid - and uses
   noise for everything else.

   The column plan lives in CONFIG.generator, where it is documented. Every
   pass below respects it, which is why they can run in sequence without
   fighting over the same cells.

   Nothing here decides whether a map is GOOD. That is js/balance.js, and
   it has the final say: a map that fails it is thrown away and another is
   rolled. This file is only responsible for producing candidates that are
   worth checking.

   Exposes one global: MapGen.
   ========================================================================= */

var MapGen = (function (CFG, Rng, Score) {
  'use strict';

  // typeId -> the letter that stands for it, worked out from CONFIG.legend.
  var LETTER = (function () {
    var out = {};
    Object.keys(CFG.legend).forEach(function (letter) {
      out[CFG.legend[letter]] = letter;
    });
    return out;
  }());

  // The kinds of ground a later pass is free to build over.
  var SOFT = { farmland: true, hilly: true, rocky: true, woodland: true };

  function clamp(value, low, high) {
    return value < low ? low : (value > high ? high : value);
  }

  /* ---------------------------------------------------------------------
     Pass 1 - the lie of the land
     ---------------------------------------------------------------------
     Two smooth fields, height and wetness. High ground becomes rocky and
     then hilly; of what is left, the wettest becomes woodland.

     The thresholds are RANKS, not values. Asking for "the highest tenth of
     the board" gives the same mix of ground on every seed, where asking for
     "everything above 0.66" gives a map of bare rock on one seed and none
     at all on the next. CONFIG.generator.weights then means exactly what it
     says: the share of the board each kind of ground gets.
     ------------------------------------------------------------------- */

  function layTerrain(grid, seed, gen) {
    var cols = CFG.grid.cols;
    var rows = CFG.grid.rows;
    var scale = gen.noise.scale;
    var height = Rng.fbm(Rng.noise2(seed + ':height'), gen.noise.octaves, gen.noise.gain);
    var wetness = Rng.fbm(Rng.noise2(seed + ':wetness'), gen.noise.octaves, gen.noise.gain);

    var cells = [];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        cells.push({
          col: col,
          row: row,
          height: height(col * scale, row * scale),
          wetness: wetness(col * scale, row * scale)
        });
      }
    }

    var total = cells.length;
    var rockyCount = Math.round(total * gen.weights.rocky);
    var hillyCount = Math.round(total * gen.weights.hilly);
    var woodCount = Math.round(total * gen.weights.woodland);

    cells.sort(function (a, b) { return b.height - a.height; });

    var i;
    for (i = 0; i < rockyCount; i++) { grid[cells[i].row][cells[i].col] = 'rocky'; }
    for (i = rockyCount; i < rockyCount + hillyCount; i++) {
      grid[cells[i].row][cells[i].col] = 'hilly';
    }

    var lowland = cells.slice(rockyCount + hillyCount);
    lowland.sort(function (a, b) { return b.wetness - a.wetness; });
    for (i = 0; i < woodCount && i < lowland.length; i++) {
      grid[lowland[i].row][lowland[i].col] = 'woodland';
    }
  }

  /* ---------------------------------------------------------------------
     Pass 2 - the tempting line
     ---------------------------------------------------------------------
     A shallow valley of easy ground running straight from the generation
     site to the demand centre.

     This is the least obvious pass in the file and the most important.
     Without it the game has no bait. Designated land costs 4 to cross and
     woodland costs 3, so protected habitat is barely more expensive than
     trees - it is an ENVIRONMENTAL barrier, not a financial one, and left
     to itself the cheapest route simply strolls around it and scores well
     on everything. There is no decision in that.

     Clearing the direct line changes the question the player is asked. Now
     the short way is also the easy way, and the only thing wrong with it is
     what it runs through. The way round is longer, rougher and costs real
     money. That trade is what the whole game is about, and it is made here.

     Run before the river, the road and the designated land, so all three
     still cross it. They are what the player has to pay for.
     ------------------------------------------------------------------- */

  function clearDirectLine(grid, seed) {
    var cols = CFG.grid.cols;
    var rows = CFG.grid.rows;
    var line = CFG.start.row;
    var salt = Rng.seedFrom(seed + ':valley');

    for (var col = 0; col < cols; col++) {
      grid[line][col] = 'farmland';

      /* A cell of slack above or below, so it reads as a valley floor
         rather than as a stripe someone has ruled across the map. */
      var spill = Rng.hash2(col, 3, salt);
      if (spill < 0.34 && line > 0) { grid[line - 1][col] = 'farmland'; }
      else if (spill > 0.72 && line < rows - 1) { grid[line + 1][col] = 'farmland'; }
    }
  }

  /* ---------------------------------------------------------------------
     Pass 3 - the river, and pass 4 - the road
     ---------------------------------------------------------------------
     Both run the full height of the map inside their own band of columns,
     so no route can get from one side to the other without crossing each of
     them exactly once. That is the most important balance property in the
     game and it is why they are walked rather than scattered.

     Where the walk steps sideways it fills both columns on that row. Partly
     that is honesty - a line of cells that moved diagonally would not be a
     connected watercourse - and partly it is a rule the player can learn:
     crossing at a bend costs double, so cross on a straight.
     ------------------------------------------------------------------- */

  function walkSouth(grid, rng, band, drift, typeId) {
    var rows = CFG.grid.rows;
    var col = Rng.between(rng, band[0], band[1]);
    var chain = [];

    for (var row = 0; row < rows; row++) {
      grid[row][col] = typeId;
      chain.push([col, row]);

      if (row === rows - 1 || !Rng.chance(rng, drift)) { continue; }

      var step = Rng.chance(rng, 0.5) ? -1 : 1;
      var next = clamp(col + step, band[0], band[1]);
      if (next === col) { continue; }

      grid[row][next] = typeId;
      chain.push([next, row]);
      col = next;
    }

    return chain;
  }

  /* ---------------------------------------------------------------------
     Pass 5 - the designated land
     ---------------------------------------------------------------------
     A band of protected habitat lying across the direct line, with a gap at
     one end of the map. It is the whole puzzle in one feature: straight
     through is the short way and wrecks the environment dial, and round the
     gap is clean and costs more.

     Two properties are guaranteed rather than hoped for:

       * every row it covers is at least TWO cells thick, so cutting through
         is a real decision and not a one-cell toll. One cell of designated
         land is minus 8 on the environment, which the dial can absorb; two
         is minus 16, which it cannot.
       * the gap rows are never touched, so there is always a way round.

     Within those, the edge wanders from row to row, so it reads as a nature
     reserve rather than a wall.
     ------------------------------------------------------------------- */

  function layDesignated(grid, seed, gen, gapSide) {
    var rows = CFG.grid.rows;
    var span = gen.sssi.span;
    var salt = Rng.seedFrom(seed + ':sssi');
    var start = Math.round(Rng.hash2(1, 1, salt) * (gen.sssi.cols[1] - gen.sssi.cols[0])) +
                gen.sssi.cols[0];
    start = Math.min(start, gen.sssi.cols[1] - span + 1);

    var from = gapSide === 'n' ? gen.sssi.gapRows : 0;
    var to = gapSide === 'n' ? rows - 1 : rows - 1 - gen.sssi.gapRows;
    var cells = [];

    for (var row = from; row <= to; row++) {
      // A two-cell window that slides within the band, widening now and then.
      var offset = Rng.hash2(row, 7, salt) < 0.5 ? 0 : span - 2;
      var thick = Rng.hash2(row, 13, salt) < 0.3 ? 3 : 2;
      for (var n = 0; n < thick; n++) {
        var col = start + offset + n;
        if (col > start + span - 1) { break; }
        if (!SOFT[grid[row][col]]) { continue; }   // never over the road or river
        grid[row][col] = 'sssi';
        cells.push([col, row]);
      }
    }

    return { cells: cells, cols: [start, start + span - 1] };
  }

  /* ---------------------------------------------------------------------
     Pass 6 - the substations
     ---------------------------------------------------------------------
     Two, because the rule that a connection must pass through one would
     otherwise decide the route on its own. One sits on the direct line and
     one on the way round, so both broad answers can be energised and the
     choice between them stays a choice about land, not about plumbing.
     ------------------------------------------------------------------- */

  function placeSubstations(grid, rng, gen, band, gapSide) {
    var cols = CFG.grid.cols;
    var rows = CFG.grid.rows;
    var placed = [];

    /* East of the designated land, so both broad answers can reach one, and
       on the first clear ground going that way. Searched rather than fixed:
       the band moves from seed to seed, and so does the river, so the column
       that happens to be clear moves with them. */
    function put(row) {
      if (row < 0 || row >= rows) { return; }
      for (var col = band[1] + 1; col < cols - 1; col++) {
        if (!SOFT[grid[row][col]]) { continue; }
        grid[row][col] = 'substation';
        placed.push([col, row]);
        return;
      }
    }

    put(CFG.end.row);
    var gapRow = gapSide === 'n'
      ? Rng.between(rng, 0, gen.sssi.gapRows - 1)
      : Rng.between(rng, rows - gen.sssi.gapRows, rows - 1);
    put(gapRow);

    return { cells: placed, gapRow: gapRow };
  }

  /* ---------------------------------------------------------------------
     Pass 7 - the town, and pass 9 - the lake
     ---------------------------------------------------------------------
     Both are blobs grown outward from a seed cell, over soft ground only,
     so neither can cut the river or swallow a substation.
     ------------------------------------------------------------------- */

  function growBlob(grid, rng, from, count, typeId, allow) {
    var cols = CFG.grid.cols;
    var rows = CFG.grid.rows;
    var STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var queue = [from];
    var taken = Object.create(null);
    var cells = [];

    while (queue.length && cells.length < count) {
      var at = queue.shift();
      var key = at[0] + ',' + at[1];
      if (taken[key]) { continue; }
      taken[key] = true;

      if (at[0] < 0 || at[0] >= cols || at[1] < 0 || at[1] >= rows) { continue; }
      if (!SOFT[grid[at[1]][at[0]]]) { continue; }
      if (allow && !allow(at[0], at[1])) { continue; }

      grid[at[1]][at[0]] = typeId;
      cells.push(at);

      Rng.shuffle(rng, STEPS.slice()).forEach(function (step) {
        queue.push([at[0] + step[0], at[1] + step[1]]);
      });
    }

    return cells;
  }

  /* ---------------------------------------------------------------------
     Pass 8 - the rewards
     ---------------------------------------------------------------------
     Community benefit land and waiting connection customers, placed on the
     rows the way round runs along. They are what makes the longer route
     worth taking rather than merely less bad: a route that goes where it is
     wanted picks up community points instead of only avoiding losses.
     ------------------------------------------------------------------- */

  function placeRewards(grid, rng, gen, gapSide) {
    var cols = CFG.grid.cols;
    var rows = CFG.grid.rows;
    var first = gapSide === 'n' ? 0 : rows - gen.sssi.gapRows;
    var last = gapSide === 'n' ? gen.sssi.gapRows - 1 : rows - 1;

    var open = [];
    for (var row = first; row <= last; row++) {
      for (var col = 1; col < cols - 1; col++) {
        if (SOFT[grid[row][col]]) { open.push([col, row]); }
      }
    }
    Rng.shuffle(rng, open);

    /* Kept to the western half. The reward has to be visible early enough
       to be worth steering for - one waiting at column nine is a detail
       nobody could have planned around. */
    open.sort(function (a, b) { return a[0] - b[0]; });

    var cells = [];
    var wanted = gen.rewards.benefit + gen.rewards.customers;
    for (var i = 0; i < open.length && cells.length < wanted; i++) {
      var typeId = cells.length < gen.rewards.benefit ? 'benefit' : 'customer';
      grid[open[i][1]][open[i][0]] = typeId;
      cells.push({ col: open[i][0], row: open[i][1], typeId: typeId });
    }
    return cells;
  }

  /* ---------------------------------------------------------------------
     Building one candidate
     ------------------------------------------------------------------- */

  function build(seed) {
    var gen = CFG.generator;
    var cols = CFG.grid.cols;
    var rows = CFG.grid.rows;
    var rng = Rng.make(seed);

    var grid = [];
    for (var row = 0; row < rows; row++) {
      var line = [];
      for (var col = 0; col < cols; col++) { line.push('farmland'); }
      grid.push(line);
    }

    layTerrain(grid, seed, gen);
    clearDirectLine(grid, seed);

    var river = walkSouth(grid, rng, gen.river.band, gen.river.drift, 'river');
    var road = walkSouth(grid, rng, gen.road.band, gen.road.drift, 'road');

    // Which end of the map the way round runs along.
    var gapSide = Rng.chance(rng, 0.5) ? 'n' : 's';

    var designated = layDesignated(grid, seed, gen, gapSide);
    var substations = placeSubstations(grid, rng, gen, designated.cols, gapSide);

    /* The town sits beside the demand centre, on the far side from the gap,
       so the way round is not forced through somebody's back garden after
       all that effort. */
    var townRow = clamp(CFG.end.row + (gapSide === 'n' ? 2 : -2), 0, rows - 1);
    var town = growBlob(grid, rng, [cols - 1, townRow], gen.town.cells, 'settlement');

    var rewards = placeRewards(grid, rng, gen, gapSide);

    /* The lake goes on the far side from the gap as well. It is the one
       thing on the map the route can never enter, so it must not stand
       where the good answer needs to be - and the balance search checks
       that it has not walled the map off regardless. */
    var lakeRow = clamp(CFG.end.row + (gapSide === 'n' ? 3 : -3), 0, rows - 1);
    var lakeCol = Rng.between(rng, 1, Math.max(1, designated.cols[0] - 1));
    var lake = growBlob(grid, rng, [lakeCol, lakeRow], gen.lake.cells, 'water');

    // The two ends always stand on plain ground. Nobody chose to build there.
    grid[CFG.start.row][CFG.start.col] = 'farmland';
    grid[CFG.end.row][CFG.end.col] = 'farmland';

    return {
      seed: seed,
      rows: grid.map(function (line) {
        return line.map(function (typeId) { return LETTER[typeId]; }).join('');
      }),
      features: {
        river: river,
        road: road,
        sssi: designated.cells,
        subs: substations.cells,
        town: town,
        lake: lake,
        rewards: rewards,
        gapSide: gapSide
      }
    };
  }

  /* ---------------------------------------------------------------------
     Building one worth playing
     ---------------------------------------------------------------------
     An explicit seed is honoured whatever it produces, because a seed a
     player has been given has to draw the same map every time - that is the
     entire point of a seed. Only a fresh landscape gets rerolled.
     ------------------------------------------------------------------- */

  function generate(seed, checker) {
    var gen = CFG.generator;
    var check = checker || (typeof Balance !== 'undefined' ? Balance.verdict : null);

    if (seed) {
      var asked = build(seed);
      asked.verdict = check ? check(asked.rows) : null;
      asked.tries = 1;
      return asked;
    }

    var rng = Rng.make(Date.now() + ':' + Math.floor(Math.random() * 1e9));
    var rejected = 0;

    for (var attempt = 0; attempt < gen.maxTries; attempt++) {
      var candidate = build(Rng.seedString(rng, gen.seedLength));
      var verdict = check ? check(candidate.rows) : { ok: true };
      if (verdict.ok) {
        candidate.verdict = verdict;
        candidate.tries = attempt + 1;
        return candidate;
      }
      rejected++;
    }

    /* Every roll was rejected. Rather than show a map that failed its own
       checks, fall back to one verified at design time. If this ever fires
       in practice the generator needs retuning, so it says so out loud. */
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Connecting the Grid: ' + rejected + ' generated maps were ' +
                   'rejected in a row. Falling back to seed ' + gen.fallbackSeed + '.');
    }
    var spare = build(gen.fallbackSeed);
    spare.verdict = check ? check(spare.rows) : null;
    spare.tries = rejected;
    spare.fellBack = true;
    return spare;
  }

  /* ---------------------------------------------------------------------
     Self test
     Checks the shape of what comes out, not whether it is any fun - that
     is balance.js. Run with: node js/mapgen.js --self-test
     ------------------------------------------------------------------- */

  function selfTest(log) {
    var say = log || function (line) { console.log(line); };
    var passed = 0;
    var failed = 0;

    function check(description, ok, detail) {
      if (ok) { passed++; } else { failed++; }
      say((ok ? '  PASS  ' : '  FAIL  ') + description + (detail ? '\n          ' + detail : ''));
    }

    say('');
    say('Connecting the Grid - map generator self test');
    say('=============================================');

    var seeds = ['ALPHA1', 'BRAVO2', 'CHARL3', 'DELTA4', 'ECHO55', 'FOXTR6'];
    var everyLetter = Object.keys(CFG.legend);

    seeds.forEach(function (seed) {
      var map = build(seed);
      var again = build(seed);
      var rows = map.rows;

      say('');
      say('Seed ' + seed);

      check('the map is ' + CFG.grid.rows + ' rows deep',
        rows.length === CFG.grid.rows, 'got ' + rows.length);

      check('every row is ' + CFG.grid.cols + ' cells wide',
        rows.every(function (line) { return line.length === CFG.grid.cols; }));

      check('every letter is one CONFIG.legend knows',
        rows.every(function (line) {
          return line.split('').every(function (ch) { return everyLetter.indexOf(ch) !== -1; });
        }));

      check('the same seed builds the same map twice',
        rows.join('|') === again.rows.join('|'));

      var startType = CFG.legend[rows[CFG.start.row].charAt(CFG.start.col)];
      var endType = CFG.legend[rows[CFG.end.row].charAt(CFG.end.col)];
      check('both ends can be built on',
        CFG.cellTypes[startType].passable && CFG.cellTypes[endType].passable,
        startType + ' / ' + endType);

      var riverRows = rows.filter(function (line) { return line.indexOf('V') !== -1; });
      check('the river spans every row',
        riverRows.length === CFG.grid.rows, 'reaches ' + riverRows.length + ' rows');

      var roadRows = rows.filter(function (line) { return line.indexOf('R') !== -1; });
      check('the road spans every row',
        roadRows.length === CFG.grid.rows, 'reaches ' + roadRows.length + ' rows');

      var subs = 0;
      rows.forEach(function (line) {
        line.split('').forEach(function (ch) { if (ch === 'X') { subs++; } });
      });
      check('there are two substations', subs === 2, 'found ' + subs);

      /* The designated land has to be a real barrier. One cell of it is a
         toll the environment dial can absorb; two is not. */
      var thin = [];
      rows.forEach(function (line, row) {
        var count = line.split('').filter(function (ch) { return ch === 'S'; }).length;
        if (count === 1) { thin.push(row); }
      });
      check('no row has a single lonely cell of designated land',
        thin.length === 0, thin.length ? 'rows ' + thin.join(', ') : '');

      var problems = Score.validateMap(rows);
      check('the map passes the scoring engine checks',
        problems.length === 0, problems.join('; '));
    });

    /* The fallback seed is only worth having if it is still any good, and
       it is a hostage to every number in CONFIG.generator: retune the river
       and it draws a different map. So it is checked rather than trusted. */
    say('');
    say('The fallback seed, ' + CFG.generator.fallbackSeed);
    if (typeof Balance === 'undefined') {
      say('  SKIP  balance.js is not loaded, so it cannot be checked here');
    } else {
      var spare = Balance.verdict(build(CFG.generator.fallbackSeed).rows);
      check('it still makes a map worth playing', spare.ok, spare.reason);
    }

    say('');
    say('=============================================');
    say(failed === 0 ? 'All ' + passed + ' checks passed.' : passed + ' passed, ' + failed + ' FAILED.');
    say('');
    return failed === 0;
  }

  return {
    build: build,
    generate: generate,
    selfTest: selfTest
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js'),
  typeof Rng !== 'undefined' ? Rng : require('./rng.js'),
  typeof Score !== 'undefined' ? Score : require('./score.js')));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapGen;
}

/* Command line: node js/mapgen.js --self-test  |  node js/mapgen.js SEED */
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  var Balance = require('./balance.js');
  var argument = process.argv[2];
  if (argument === '--self-test' || !argument) {
    process.exit(MapGen.selfTest() ? 0 : 1);
  } else {
    var built = MapGen.build(argument);
    console.log('');
    built.rows.forEach(function (line, row) {
      console.log('  row ' + row + '  ' + line);
    });
    console.log('');
  }
}
