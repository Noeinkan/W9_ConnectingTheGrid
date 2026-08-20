/* =========================================================================
   Connecting the Grid - scoring engine
   =========================================================================

   Pure maths and pure data. This file never touches the DOM and never holds
   game state, so the same code that scores the game in the browser can be
   loaded straight into Node to run its own tests.

   Every number it uses comes from CONFIG. Nothing tunable lives here.

   Scoring, for each laid segment i with land type t and technology k:

       cost_i = cost(t)  * costMult(k)
       env_i  = env(t)   * impactMult(k)
       comm_i = comm(t)  * impactMult(k)

   The totals are the sums, and each maps onto a 0-100 dial:

       costDial = clamp(100 - (totalCost / COST_BUDGET) * 100, 0, 100)
       envDial  = clamp(100 + (totalEnv  / ENV_FLOOR)   * 100, 0, 100)
       commDial = clamp(100 + (totalComm / COMM_FLOOR)  * 100, 0, 100)

   totalEnv is always zero or negative. totalComm can be positive, because
   connection customers and community benefit land add to it - the clamp
   handles that.

   Exposes one global: Score.
   ========================================================================= */

var Score = (function (CFG) {
  'use strict';

  /* ---------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */

  function clamp(value, min, max) {
    if (value < min) { return min; }
    if (value > max) { return max; }
    return value;
  }

  // Rounds away floating point dust, e.g. 1.4000000000000001 -> 1.4
  function roundTo(value, places) {
    var factor = Math.pow(10, places);
    return Math.round(value * factor) / factor;
  }

  /* ---------------------------------------------------------------------
     Lookups
     ------------------------------------------------------------------- */

  function cellType(typeId) {
    var type = CFG.cellTypes[typeId];
    if (!type) { throw new Error('Unknown cell type: ' + typeId); }
    return type;
  }

  function technology(techId) {
    for (var i = 0; i < CFG.technologies.length; i++) {
      if (CFG.technologies[i].id === techId) { return CFG.technologies[i]; }
    }
    throw new Error('Unknown technology: ' + techId);
  }

  // Can this technology be built on this land? (Cable cannot cross a river.)
  function canUseTech(techId, typeId) {
    var tech = technology(techId);
    return tech.bansTerrain.indexOf(typeId) === -1;
  }

  function piece(pieceId) {
    for (var i = 0; i < CFG.pieces.length; i++) {
      if (CFG.pieces[i].id === pieceId) { return CFG.pieces[i]; }
    }
    throw new Error('Unknown piece: ' + pieceId);
  }

  // Does this piece have an opening on the given side?
  function pieceOpens(pieceId, side) {
    return piece(pieceId).connectors.indexOf(side) !== -1;
  }

  /* ---------------------------------------------------------------------
     The map, turned from letters into a grid of cell type ids
     ---------------------------------------------------------------------
     There is no map in CONFIG any more. Maps are generated, so the one in
     play arrives at run time and can be replaced without reloading the
     page - which is what the "New landscape" button does.

     Everything that reads the map goes through here, so installing a new
     one is a single call and there is no second copy to fall out of step.
     ------------------------------------------------------------------- */

  var activeRows = [];
  var grid = [];

  function gridFrom(rows) {
    var out = [];
    for (var row = 0; row < rows.length; row++) {
      var line = rows[row];
      var cells = [];
      for (var col = 0; col < line.length; col++) {
        var letter = line.charAt(col);
        var typeId = CFG.legend[letter];
        if (!typeId) {
          throw new Error('Map letter "' + letter + '" at column ' + col +
                          ', row ' + row + ' is not in CONFIG.legend');
        }
        cells.push(typeId);
      }
      out.push(cells);
    }
    return out;
  }

  // Puts a map into play. Everything below reads what this last installed.
  function setMap(rows) {
    activeRows = rows.slice();
    grid = gridFrom(activeRows);
    return grid;
  }

  function mapRows() { return activeRows.slice(); }

  function typeIdAt(col, row) {
    if (row < 0 || row >= grid.length) { return null; }
    if (col < 0 || col >= grid[row].length) { return null; }
    return grid[row][col];
  }

  function typeAt(col, row) {
    var typeId = typeIdAt(col, row);
    return typeId === null ? null : cellType(typeId);
  }

  /* ---------------------------------------------------------------------
     Map validation
     Catches the mistakes someone is most likely to make when editing the
     map by hand. Returns a list of problems; an empty list means all good.
     ------------------------------------------------------------------- */

  function validateMap(rows) {
    var problems = [];
    var checking = rows || activeRows;
    var checkGrid = rows ? gridFrom(rows) : grid;
    var r, c;

    function typeHere(col, row) {
      if (row < 0 || row >= checkGrid.length) { return null; }
      if (col < 0 || col >= checkGrid[row].length) { return null; }
      return cellType(checkGrid[row][col]);
    }

    if (checking.length !== CFG.grid.rows) {
      problems.push('The map has ' + checking.length + ' rows but CONFIG.grid.rows says ' + CFG.grid.rows);
    }
    for (r = 0; r < checking.length; r++) {
      if (checking[r].length !== CFG.grid.cols) {
        problems.push('Map row ' + r + ' has ' + checking[r].length + ' cells but CONFIG.grid.cols says ' + CFG.grid.cols);
      }
    }

    var SIDES = ['n', 'e', 's', 'w'];
    var ends = [
      { name: 'start (generation site)', at: CFG.start, sideKey: 'entry' },
      { name: 'end (demand centre)', at: CFG.end, sideKey: 'exit' }
    ];
    for (var e = 0; e < ends.length; e++) {
      var end = ends[e];
      var type = typeHere(end.at.col, end.at.row);
      if (!type) {
        problems.push('The ' + end.name + ' is outside the map');
      } else if (!type.passable) {
        problems.push('The ' + end.name + ' sits on ' + type.label + ', which cannot be entered');
      }

      // The side the line joins on, and whether any piece can actually do it.
      var side = end.at[end.sideKey];
      if (SIDES.indexOf(side) === -1) {
        problems.push('The ' + end.name + ' has ' + end.sideKey + ' "' + side +
                      '", which is not one of n, e, s, w');
      } else {
        var usable = CFG.pieces.filter(function (p) {
          return p.connectors.indexOf(side) !== -1;
        });
        if (usable.length === 0) {
          problems.push('The ' + end.name + ' needs a piece opening to the ' + side +
                        ', but no piece in CONFIG.pieces has one');
        }
      }
    }

    // Every piece must open on exactly two different sides.
    for (var p = 0; p < CFG.pieces.length; p++) {
      var shape = CFG.pieces[p];
      var conns = shape.connectors;
      if (conns.length !== 2 || conns[0] === conns[1] ||
          SIDES.indexOf(conns[0]) === -1 || SIDES.indexOf(conns[1]) === -1) {
        problems.push('Piece "' + shape.id + '" must have exactly two different ' +
                      'connectors drawn from n, e, s, w');
      }
    }

    if (CFG.rules.requireSubstation) {
      var found = 0;
      for (r = 0; r < checkGrid.length; r++) {
        for (c = 0; c < checkGrid[r].length; c++) {
          if (checkGrid[r][c] === 'substation') { found++; }
        }
      }
      if (found === 0) {
        problems.push('The rules require a substation, but the map has none');
      }
    }

    return problems;
  }

  /* ---------------------------------------------------------------------
     Scoring
     ------------------------------------------------------------------- */

  /* What one kind of ground costs on one technology.

     Ordinarily the technology multiplier applies: a harder technology makes
     every metre of ground more expensive to build across. Ground marked
     'fixedCost' is the exception, and connection funding is why it exists -
     a grant is a fixed sum agreed in advance, and it does not grow because
     the scheme chose to bury the line. Without this the multiplier would
     work backwards on it and undergrounding through a grant would pay six
     times over, which is not a trade-off, it is a bug with a story. */
  function costOf(type, tech) {
    return type.fixedCost ? type.cost : type.cost * tech.costMult;
  }

  // One segment. Returns its cost and its environmental and community effect.
  function scoreSegment(typeId, techId) {
    var type = cellType(typeId);
    var tech = technology(techId);
    return {
      cost: costOf(type, tech),
      env: type.envImpact * tech.impactMult,
      comm: type.commImpact * tech.impactMult
    };
  }

  // Turns raw totals into the three 0-100 dials.
  function dialsFor(totals) {
    var b = CFG.budgets;
    var p = CFG.precision.dials;
    return {
      cost: roundTo(clamp(100 - (totals.cost / b.COST_BUDGET) * 100, 0, 100), p),
      env: roundTo(clamp(100 + (totals.env / b.ENV_FLOOR) * 100, 0, 100), p),
      comm: roundTo(clamp(100 + (totals.comm / b.COMM_FLOOR) * 100, 0, 100), p)
    };
  }

  /* A route is an array of segments, each { col, row, typeId, techId }.
     Returns the raw totals, the three dials, and a few facts the game needs
     to decide whether the connection can be energised. */
  function scoreRoute(route) {
    var totals = { cost: 0, env: 0, comm: 0 };
    var crossesSubstation = false;
    var p = CFG.precision.totals;

    for (var i = 0; i < route.length; i++) {
      var segment = route[i];
      var scored = scoreSegment(segment.typeId, segment.techId);
      totals.cost += scored.cost;
      totals.env += scored.env;
      totals.comm += scored.comm;
      if (segment.typeId === 'substation') { crossesSubstation = true; }
    }

    totals.cost = roundTo(totals.cost, p);
    totals.env = roundTo(totals.env, p);
    totals.comm = roundTo(totals.comm, p);

    return {
      segments: route.length,
      totals: totals,
      dials: dialsFor(totals),
      crossesSubstation: crossesSubstation
    };
  }

  // The word used to describe a dial value out loud, e.g. "good".
  function bandFor(value) {
    for (var i = 0; i < CFG.bands.length; i++) {
      if (value >= CFG.bands[i].min) { return CFG.bands[i].word; }
    }
    return CFG.bands[CFG.bands.length - 1].word;
  }

  /* Which dial is the weakest, and how weak.

     The tie-break matters more than it looks. Two places ask this question:
     the player's verdict, and the generator's acceptance test, which throws
     away any map whose cheapest route is not punished on the environment.
     They used to answer it differently - one broke a tie towards cost, the
     other towards community - so a map whose cheapest route tied on two
     dials could be accepted for a reason the player was never shown. There
     is one answer now, and it lives here.

     The order is cost, then environment, then community, and the FIRST of
     those to hold the lowest value wins. That is the order the dials are
     read in everywhere else in the game, so a tie resolves the way the
     player's eye already travels. */
  var DIAL_ORDER = ['cost', 'env', 'comm'];

  function lowestDial(dials) {
    var key = DIAL_ORDER[0];
    var value = dials[key];

    for (var i = 1; i < DIAL_ORDER.length; i++) {
      if (dials[DIAL_ORDER[i]] < value) {
        key = DIAL_ORDER[i];
        value = dials[key];
      }
    }

    return { key: key, value: value };
  }

  // Which verdict applies: the lowest dial decides, unless all are strong.
  function verdictKeyFor(dials) {
    var lowest = lowestDial(dials);
    if (lowest.value >= CFG.balancedThreshold) { return 'balanced'; }
    return lowest.key;
  }

  /* ---------------------------------------------------------------------
     Self test
     Runs the two checks the brief asks for, plus a map sanity check.
     Call Score.selfTest() from the browser console, or run this file
     under Node. Returns true only if everything passed.
     ------------------------------------------------------------------- */

  /* The map the tests use. Written out here on purpose: the game's own maps
     are generated fresh every time, and a test whose inputs move underneath
     it proves nothing. This one never changes. */
  var TEST_MAP = [
    'HHKRFFWWVFH',
    'HFFRWWWVVFF',
    'FF~RWWFVFTT',
    'FF~RSSFVFTT',
    'FFRRSSXVFTF',
    'FFRSSFFVVFF',
    'FWRFFFFFVFF',
    'WWRBCFFFVKF',
    'WWRBCFXFVHF'
  ];

  function selfTest(log) {
    var say = log || function (line) { console.log(line); };
    var passed = 0;
    var failed = 0;

    function check(description, actual, expected) {
      var ok = actual === expected;
      if (ok) { passed++; } else { failed++; }
      say((ok ? '  PASS  ' : '  FAIL  ') + description +
          '\n          expected ' + expected + ', got ' + actual);
    }

    // Builds a route of the given cell types, all on one technology.
    function routeOf(typeIds, techId) {
      return typeIds.map(function (typeId, index) {
        return { col: index, row: 0, typeId: typeId, techId: techId };
      });
    }

    function repeat(typeId, times) {
      var out = [];
      for (var i = 0; i < times; i++) { out.push(typeId); }
      return out;
    }

    say('');
    say('Connecting the Grid - scoring self test');
    say('=======================================');

    // ---- Assertion 1 ----------------------------------------------------
    /* A 14 cell all-farmland route on lattice. The expected cost dial is
       written out rather than calculated, so a change to the formula is
       caught rather than mirrored - but it does depend on the budget:
         100 - (14 / COST_BUDGET) * 100  =  100 - (14 / 130) * 100  =  89.2
       Change budgets.COST_BUDGET in config.js and this number moves with
       it. Assertion 2 below is tied to ENV_FLOOR the same way. */
    say('');
    say('Assertion 1: 14 farmland cells on lattice');
    var a = scoreRoute(routeOf(repeat('farmland', 14), 'lattice'));
    check('totalCost', a.totals.cost, 14);
    check('costDial', a.dials.cost, 89.2);
    check('envDial', a.dials.env, 100);
    check('commDial', a.dials.comm, 100);

    // ---- Assertion 2 ----------------------------------------------------
    // A 14 cell route on lattice where 2 cells are designated land.
    say('');
    say('Assertion 2: 14 cells on lattice, 2 of them designated land');
    var b = scoreRoute(routeOf(repeat('farmland', 12).concat(repeat('sssi', 2)), 'lattice'));
    check('totalEnv', b.totals.env, -16);
    check('envDial', b.dials.env, 60);

    // ---- Map sanity -----------------------------------------------------
    /* Checked against a map written out here rather than whatever the
       generator last produced. A test that changes its own inputs every
       time it runs is not a test, and this one has to be able to fail for
       exactly one reason: the validator stopped working. */
    say('');
    say('Map check, on a fixed test map');
    var problems = validateMap(TEST_MAP);
    if (problems.length === 0) {
      passed++;
      say('  PASS  the test map is well formed' +
          '\n          ' + CFG.grid.cols + ' x ' + CFG.grid.rows + ' = ' +
          (CFG.grid.cols * CFG.grid.rows) + ' cells');
    } else {
      failed++;
      say('  FAIL  the test map has problems:');
      problems.forEach(function (problem) { say('          - ' + problem); });
    }

    // ---- Installing a map -----------------------------------------------
    say('');
    say('Assertion 3: installing a map is what the board then reads');
    var before = mapRows();
    setMap(TEST_MAP);
    check('typeAt reads the installed map', typeIdAt(6, 4), 'substation');
    check('off the map reads as nothing', typeIdAt(-1, 0), null);
    if (before.length) { setMap(before); }

    say('');
    say('=======================================');
    say(failed === 0
      ? 'All ' + passed + ' checks passed.'
      : passed + ' passed, ' + failed + ' FAILED.');
    say('');

    return failed === 0;
  }

  /* ---------------------------------------------------------------------
     Public interface
     ------------------------------------------------------------------- */

  return {
    setMap: setMap,
    mapRows: mapRows,
    typeIdAt: typeIdAt,
    typeAt: typeAt,
    cellType: cellType,
    technology: technology,
    canUseTech: canUseTech,
    piece: piece,
    pieceOpens: pieceOpens,
    costOf: costOf,
    scoreSegment: scoreSegment,
    scoreRoute: scoreRoute,
    dialsFor: dialsFor,
    bandFor: bandFor,
    lowestDial: lowestDial,
    verdictKeyFor: verdictKeyFor,
    validateMap: validateMap,
    selfTest: selfTest
  };

}(typeof CONFIG !== 'undefined' ? CONFIG : require('./config.js')));


/* Lets Node load this file for the tests. Ignored by the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Score;
}

/* Optional: run the self test in the browser console on load. */
if (typeof CONFIG !== 'undefined' && CONFIG.debug && CONFIG.debug.runSelfTestOnLoad) {
  Score.selfTest();
}
