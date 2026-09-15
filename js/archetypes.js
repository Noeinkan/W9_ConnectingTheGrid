/* =========================================================================
   Connecting the Grid - kinds of landscape
   =========================================================================

   The generator used to draw one kind of puzzle, over and over, with the
   dice rolled differently: protected land across the direct line, a longer
   way round, a river and a road nobody can avoid. Good, and after a dozen
   maps, familiar.

   An archetype is a kind of landscape with a character of its own - a way
   round only one row wide, a town standing across it, a river with woods on
   both banks. Each is two things, and they live in two places:

     * the numbers the generator draws it with. Data, in CONFIG.archetypes,
       applied by js/mapgen.js, which also works out which kind a seed is.
     * what a map of that kind must show before it counts as one. That is
       this file. A "Knife edge" whose best route sits comfortably at 95 on
       community is not a knife edge, whatever numbers drew it, so it is
       thrown away like any other map that fails its checks.

   The test here is always ON TOP of the balance check, never instead of
   it. Every kind of landscape is still solvable, still has a balanced route,
   and still punishes the greedy one.

   Pure: no page, no game state. Loads in the browser and under Node.
   Exposes one global: Archetypes.
   ========================================================================= */

var Archetypes = (function (CFG, Rng, MapGen, Balance) {
  'use strict';

  function list() { return CFG.archetypes || []; }

  function byId(id) {
    var found = null;
    list().forEach(function (kind) { if (kind.id === id) { found = kind; } });
    return found;
  }

  /* What the player is told about a kind: its name and one sentence. Null
     for a map with no kind, which is every map if CONFIG has no archetypes. */
  function describe(id) {
    var kind = byId(id);
    return kind ? { id: kind.id, label: kind.label, hint: kind.hint } : null;
  }

  /* ---------------------------------------------------------------------
     The test
     ---------------------------------------------------------------------
     Read off what the balance search already found - the best route and
     the cheapest one - so it costs nothing beyond the search every map
     pays for anyway. Returns why a map is not the kind it claims to be, or
     null if it is.
     ------------------------------------------------------------------- */

  function missing(found, accept) {
    if (!accept) { return null; }
    var best = found.allRound;
    var dials = best.dials;

    if (typeof accept.weakestBelow === 'number' && !(best.weakest < accept.weakestBelow)) {
      return 'the best route reaches ' + best.weakest + ', not under ' + accept.weakestBelow;
    }

    if (accept.dialBelow) {
      var keys = Object.keys(accept.dialBelow);
      for (var i = 0; i < keys.length; i++) {
        if (!(dials[keys[i]] < accept.dialBelow[keys[i]])) {
          return 'the best route keeps ' + keys[i] + ' at ' + dials[keys[i]] +
                 ', not under ' + accept.dialBelow[keys[i]];
        }
      }
    }

    if (typeof accept.everyDialAtMost === 'number') {
      var top = Math.max(dials.cost, dials.env, dials.comm);
      if (top > accept.everyDialAtMost) {
        return 'the best route has a dial at ' + top + ', over ' + accept.everyDialAtMost;
      }
    }

    if (typeof accept.detourCostAtMost === 'number') {
      var cheapest = found.cheapest && found.cheapest.totals.cost;
      if (!cheapest || best.totals.cost > cheapest * accept.detourCostAtMost) {
        return 'the best route costs ' + best.totals.cost + ' against ' + cheapest +
               ' for the cheapest, more than ' + accept.detourCostAtMost + ' times';
      }
    }

    return null;
  }

  /* The checker the game hands to the generator. Takes the whole candidate
     rather than only its rows, because the rows do not say which kind of
     landscape they were drawn as and the seed does - see judge() in
     js/mapgen.js for why that is asked for explicitly. */
  function verdict(rows, candidate) {
    var judged = Balance.verdict(rows);
    var id = candidate
      ? (candidate.archetype !== undefined ? candidate.archetype : MapGen.archetypeFor(candidate.seed))
      : null;
    judged.archetype = id;
    if (!judged.ok || !id) { return judged; }

    var kind = byId(id);
    var why = kind ? missing(judged.found, kind.accept) : null;
    if (why) {
      judged.ok = false;
      judged.reason = 'does not fit ' + kind.label + ': ' + why;
    }
    return judged;
  }
  verdict.wantsCandidate = true;

  /* ---------------------------------------------------------------------
     Self test
     ---------------------------------------------------------------------
     Run with: node js/archetypes.js --self-test
     Add --calendar to walk every day and every week of 2026 as well, which
     takes a while.
     ------------------------------------------------------------------- */

  function seedsOfKind(id, count, salt) {
    var rng = Rng.make('kinds:' + (salt || '') + id);
    var out = [];
    for (var draw = 0; out.length < count && draw < count * 1000; draw++) {
      var name = Rng.seedString(rng, CFG.generator.seedLength);
      if (MapGen.archetypeFor(name) === id) { out.push(name); }
    }
    return out;
  }

  function count(rows, letter) {
    var n = 0;
    rows.forEach(function (line) {
      for (var i = 0; i < line.length; i++) { if (line.charAt(i) === letter) { n++; } }
    });
    return n;
  }

  function selfTest(options, log) {
    var say = log || function (line) { console.log(line); };
    var calendar = !!(options && options.calendar);
    var passed = 0;
    var failed = 0;

    function check(description, ok, detail) {
      if (ok) { passed++; } else { failed++; }
      say((ok ? '  PASS  ' : '  FAIL  ') + description + (detail && !ok ? '\n          ' + detail : ''));
    }

    say('');
    say('Connecting the Grid - kinds of landscape self test');
    say('==================================================');

    var kinds = list();

    say('');
    say('The kinds in CONFIG');
    var ids = kinds.map(function (kind) { return kind.id; });
    check('there is at least one kind', kinds.length > 0);
    check('no two kinds share an id',
      ids.every(function (id, i) { return ids.indexOf(id) === i; }));
    check('every kind has a label, a hint and a positive weight',
      kinds.every(function (kind) { return kind.label && kind.hint && kind.weight > 0; }));
    check('every generator change names a setting the generator has',
      kinds.every(function (kind) {
        return Object.keys(kind.generator || {}).every(function (key) {
          return Object.prototype.hasOwnProperty.call(CFG.generator, key);
        });
      }));
    check('at least one kind can be this week\'s landscape',
      kinds.some(function (kind) { return kind.weekly; }));

    say('');
    say('Which kind a seed is');
    var tally = {};
    var rng = Rng.make('kinds:tally');
    var total = 0;
    var weightSum = 0;
    kinds.forEach(function (kind) { weightSum += kind.weight; tally[kind.id] = 0; });
    for (var t = 0; t < 8000; t++) {
      var name = Rng.seedString(rng, CFG.generator.seedLength);
      tally[MapGen.archetypeFor(name)]++;
      total++;
    }
    kinds.forEach(function (kind) {
      var want = kind.weight / weightSum;
      var got = tally[kind.id] / total;
      check(kind.id + ' comes up in proportion to its weight',
        Math.abs(got - want) <= want * 0.15,
        'wanted ' + (100 * want).toFixed(1) + '%, got ' + (100 * got).toFixed(1) + '%');
    });
    check('the same seed is always the same kind',
      ['K3F9QZ', '9MA7JX', 'PYLON1'].every(function (seedName) {
        return MapGen.build(seedName).archetype === MapGen.archetypeFor(seedName) &&
               MapGen.build(seedName).rows.join('|') === MapGen.build(seedName).rows.join('|');
      }));

    /* The plain kind has no changes, so a seed of that kind draws exactly
       the map it drew before kinds existed. That is what keeps the plain
       kind honest as a baseline. */
    var plain = kinds.filter(function (kind) { return !kind.generator; })[0];
    if (plain) {
      var plainSeed = seedsOfKind(plain.id, 1)[0];
      check('a ' + plain.id + ' seed draws the unchanged generator\'s map',
        MapGen.build(plainSeed).rows.join('|') === MapGen.build(plainSeed, CFG.generator).rows.join('|'));
    }

    kinds.forEach(function (kind) {
      say('');
      say(kind.label + ' (' + kind.id + ')');

      var names = seedsOfKind(kind.id, 12);
      var maps = names.map(function (seedName) { return MapGen.build(seedName); });
      check('its seeds say they are this kind',
        maps.every(function (map) { return map.archetype === kind.id; }));

      var gen = kind.generator || {};

      /* The changes are visible in the maps, not only in the numbers. Each
         is checked against the same seed drawn by the plain generator. */
      if (gen.river && gen.river.banks) {
        var more = maps.filter(function (map, i) {
          return count(map.rows, 'W') > count(MapGen.build(names[i], CFG.generator).rows, 'W');
        }).length;
        check('the river banks are wooded (more woodland than the plain map, ' + more + ' of 12)', more >= 10);
      }

      if (gen.town && gen.town.side === 'gap') {
        var across = maps.filter(function (map) {
          var gapNorth = map.features.gapSide === 'n';
          var town = map.features.town;
          if (!town.length) { return false; }
          var towards = town.filter(function (at) {
            return gapNorth ? at[1] < CFG.end.row : at[1] > CFG.end.row;
          }).length;
          return towards * 2 >= town.length;
        }).length;
        check('the town stands on the side of the way round (' + across + ' of 12)', across >= 10);
      }

      if (gen.sssi && gen.sssi.gapRows === 1) {
        var narrow = maps.filter(function (map) {
          var clear = map.rows.filter(function (line) { return line.indexOf('S') === -1; }).length;
          return clear <= 1;
        }).length;
        check('the way round is one row wide (' + narrow + ' of 12)', narrow === 12);
      }

      /* A map of this kind can actually be found, within the tries it is
         given, and it shows what the kind promises. Walked over fixed seeds,
         so the test cannot pass on one run and fail on the next. */
      var tries = kind.maxTries || CFG.generator.maxTries;
      var accepted = null;
      var looked = seedsOfKind(kind.id, tries, 'accept:');
      for (var k = 0; k < looked.length && !accepted; k++) {
        var candidate = MapGen.build(looked[k]);
        var judged = verdict(candidate.rows, candidate);
        if (judged.ok) { accepted = { map: candidate, verdict: judged }; }
      }
      check('one is accepted within its ' + tries + ' tries', !!accepted);

      if (accepted) {
        check('the accepted one passes the balance checks as well',
          Balance.verdict(accepted.map.rows).ok);
        check('and shows what the kind promises',
          missing(accepted.verdict.found, kind.accept) === null);

        var target = accepted.verdict.found.allRound;
        var chain = Balance.traceBest(accepted.map.rows, target.packed);
        check('its best route can still be traced and drawn', !!chain && chain.length > 0);
      }
    });

    say('');
    say('The fallback seed, ' + CFG.generator.fallbackSeed);
    var spare = MapGen.build(CFG.generator.fallbackSeed);
    var spareVerdict = verdict(spare.rows, spare);
    check('it is accepted as the kind it is (' + spare.archetype + ')', spareVerdict.ok, spareVerdict.reason);

    say('');
    say('Weeks');
    check('1 January 2026, a Thursday, is in week 1 of 2026',
      MapGen.weekUTC(new Date(Date.UTC(2026, 0, 1))) === '2026-W01');
    check('30 December 2024, a Monday, is in week 1 of 2025',
      MapGen.weekUTC(new Date(Date.UTC(2024, 11, 30))) === '2025-W01');
    check('1 January 2027, a Friday, is still in week 53 of 2026',
      MapGen.weekUTC(new Date(Date.UTC(2027, 0, 1))) === '2026-W53');
    check('15 September 2026 is in week 38',
      MapGen.weekUTC(new Date(Date.UTC(2026, 8, 15))) === '2026-W38');
    check('a Sunday belongs to the week that began the Monday before',
      MapGen.weekUTC(new Date(Date.UTC(2026, 8, 20))) === '2026-W38');

    var thisWeek = MapGen.weekly('2026-W38', verdict);
    var again = MapGen.weekly('2026-W38', verdict);
    check('this week\'s landscape is the same twice', thisWeek.seed === again.seed);
    check('and it is one of the particular kinds',
      !!byId(thisWeek.archetype) && byId(thisWeek.archetype).weekly, thisWeek.archetype);

    if (calendar) {
      say('');
      say('Every week and every day of 2026 (--calendar)');

      var weekSeeds = {};
      var weekFell = 0;
      var weekPlain = 0;
      for (var w = 1; w <= 53; w++) {
        var weekKey = '2026-W' + (w < 10 ? '0' : '') + w;
        var built = MapGen.weekly(weekKey, verdict);
        if (built.fellBack) { weekFell++; }
        if (!byId(built.archetype) || !byId(built.archetype).weekly) { weekPlain++; }
        weekSeeds[built.seed] = true;
      }
      check('no week falls back to the spare seed', weekFell === 0, weekFell + ' did');
      check('no week is the plain kind', weekPlain === 0, weekPlain + ' were');
      check('no two weeks share a landscape', Object.keys(weekSeeds).length === 53,
        Object.keys(weekSeeds).length + ' different');

      var daySeeds = {};
      var dayFell = 0;
      var kindsSeen = {};
      for (var d = 0; d < 365; d++) {
        var date = new Date(Date.UTC(2026, 0, 1) + d * 86400000);
        var day = MapGen.daily(MapGen.todayUTC(date), verdict);
        if (day.fellBack) { dayFell++; }
        daySeeds[day.seed] = true;
        kindsSeen[day.archetype] = (kindsSeen[day.archetype] || 0) + 1;
      }
      check('no day falls back to the spare seed', dayFell === 0, dayFell + ' did');
      check('no two days share a landscape', Object.keys(daySeeds).length === 365,
        Object.keys(daySeeds).length + ' different');

      /* The days follow the weights rather than drifting towards the kinds
         that are easiest to accept. Loose, because 365 draws are not many:
         within a third of the share each kind's weight gives it. */
      var daysWeight = 0;
      kinds.forEach(function (kind) { daysWeight += kind.weight; });
      kinds.forEach(function (kind) {
        var want = 365 * kind.weight / daysWeight;
        var got = kindsSeen[kind.id] || 0;
        check(kind.id + ' gets its share of the days (' + got + ', about ' + Math.round(want) + ')',
          Math.abs(got - want) <= want / 3);
      });
    }

    say('');
    say('==================================================');
    say(failed === 0 ? 'All ' + passed + ' checks passed.' : passed + ' passed, ' + failed + ' FAILED.');
    say('');
    return failed === 0;
  }

  return {
    list: list,
    describe: describe,
    missing: missing,
    verdict: verdict,
    seedsOfKind: seedsOfKind,
    selfTest: selfTest
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js'),
  typeof Rng !== 'undefined' ? Rng : require('./rng.js'),
  typeof MapGen !== 'undefined' ? MapGen : require('./mapgen.js'),
  typeof Balance !== 'undefined' ? Balance : require('./balance.js')));


if (typeof module !== 'undefined' && module.exports) {
  module.exports = Archetypes;
}


/* =========================================================================
   Command line

     node js/archetypes.js --self-test [--calendar]
     node js/archetypes.js --seeds 300      how often each kind is accepted

   The sweep is the one to run before changing a number in
   CONFIG.archetypes. For each kind it builds that many seeds OF THAT KIND,
   and reports the acceptance rate, why the rest were thrown away, and the
   chance that a player asking for one is shown the fallback instead.
   ========================================================================= */

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  (function () {
    var CFG = require('./config.js');
    var MapGen = require('./mapgen.js');
    var Balance = require('./balance.js');
    var argv = process.argv.slice(2);

    function sweep(perKind) {
      var healthy = true;
      console.log('');
      console.log('Connecting the Grid - kinds of landscape sweep');
      console.log('==============================================');

      Archetypes.list().forEach(function (kind) {
        var names = Archetypes.seedsOfKind(kind.id, perKind, 'sweep:');
        var accepted = 0;
        var reasons = {};
        var weakest = [];
        var started = Date.now();

        names.forEach(function (name) {
          var map = MapGen.build(name);
          var v = Archetypes.verdict(map.rows, map);
          if (v.ok) { accepted++; weakest.push(v.found.allRound.weakest); return; }
          var key = v.reason.replace(/\s*\(.*\)/, '').replace(/:.*$/, '');
          reasons[key] = (reasons[key] || 0) + 1;
        });

        var rate = accepted / names.length;
        var tries = kind.maxTries || CFG.generator.maxTries;
        var fallback = Math.pow(1 - rate, tries);
        weakest.sort(function (a, b) { return a - b; });

        console.log('');
        console.log('  ' + kind.label + ' (' + kind.id + ')');
        console.log('    ' + accepted + ' of ' + names.length + ' accepted (' + (100 * rate).toFixed(1) +
                    '%), ' + ((Date.now() - started) / names.length).toFixed(1) + 'ms each');
        if (weakest.length) {
          console.log('    best weakest dial: worst ' + weakest[0] + ', median ' +
                      weakest[Math.floor(weakest.length / 2)] + ', best ' + weakest[weakest.length - 1]);
        }
        console.log('    chance of the fallback within ' + tries + ' tries: ' +
                    (fallback < 1e-6 ? 'under one in a million' : (100 * fallback).toFixed(3) + '%'));
        Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; })
          .forEach(function (key) { console.log('      ' + reasons[key] + '  ' + key); });

        // One player in a thousand seeing the spare map is the line.
        if (fallback > 0.001) { healthy = false; }
      });
      console.log('');
      return healthy;
    }

    if (argv[0] === '--seeds') {
      process.exit(sweep(Number(argv[1]) || 200) ? 0 : 1);
    } else {
      process.exit(Archetypes.selfTest({ calendar: argv.indexOf('--calendar') !== -1 }) ? 0 : 1);
    }
  }());
}
