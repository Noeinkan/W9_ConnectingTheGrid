/* =========================================================================
   Connecting the Grid - scoring engine
   =========================================================================

   Pure maths and pure data. This file never touches the DOM and never holds
   game state, so the same code that scores the game in the browser can be
   loaded straight into Node to run its own tests.

   Every number it uses comes from CONFIG. Nothing tunable lives here.

   Scoring, for each laid segment i with land type t and technology k:

       cost_i, env_i, comm_i = what CONFIG says one span of t costs on k

   Read, not calculated. Lattice pylons are the ground's own cost,
   envImpact and commImpact; every other technology is written out under
   that ground's techs, because what a technology does depends on where it
   is built.

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
      { name: 'start (power station)', at: CFG.start, sideKey: 'entry' },
      { name: 'end (grid supply point)', at: CFG.end, sideKey: 'exit' }
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

  /* One segment. Returns its cost and its environmental and community effect.

     There used to be one multiplier per technology, applied to every ground
     alike, and it gave answers no planner would: burying a line through a
     wood spared the trees, and a customer was worth less connected by
     cable. So the figures are now
     written out per ground, and this only looks them up.

     `beside` says the square shares an edge with houses, and adds what
     CONFIG.besideHomes charges this technology for being in their view.
     It is a fact about where the square is, not what it is, so the caller
     says it: see besideHomes below. */
  function scoreSegment(typeId, techId, beside) {
    var type = cellType(typeId);
    var tech = technology(techId);
    var own = tech.standard
      ? { cost: type.cost, env: type.envImpact, comm: type.commImpact }
      : type.techs && type.techs[tech.id];
    if (!own) {
      throw new Error('Cell type "' + typeId + '" has no figures for technology "' + techId + '"');
    }
    var extra = beside ? besideCommFor(tech.id) : 0;
    return { cost: own.cost, env: own.env, comm: roundTo(own.comm + extra, 1) };
  }

  function besideCommFor(techId) {
    var rule = CFG.besideHomes;
    return (rule && rule.comm && rule.comm[techId]) || 0;
  }

  function isHome(typeId) {
    var rule = CFG.besideHomes;
    return !!rule && rule.homes.indexOf(typeId) !== -1;
  }

  /* Does the square at (col, row) share an edge with houses? `grid` is rows
     of cell type ids, as the balance search holds a landscape; leave it out
     to ask about the map in play. Corners do not count: a square only
     touching houses diagonally is left alone, which keeps the rule one a
     player can see at a glance on the board. */
  function besideHomes(col, row, onGrid) {
    var cells = onGrid || grid;
    var around = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var i = 0; i < around.length; i++) {
      var line = cells[row + around[i][1]];
      var typeId = line && line[col + around[i][0]];
      if (typeId && isHome(typeId)) { return true; }
    }
    return false;
  }

  /* The same question for every square at once, as rows of true and false -
     what the balance search and the forecast read, so each asks it once per
     landscape rather than once per state. */
  function besideHomesGrid(onGrid) {
    return onGrid.map(function (line, row) {
      return line.map(function (typeId, col) { return besideHomes(col, row, onGrid); });
    });
  }

  /* The one span a ground is shown with where there is room for only one -
     the legend, and the first line of a square's tooltip. On the standard
     technology, or, where that is not allowed, on the first that is: houses
     are shown at what burying under them costs, not at what pylons over
     them would, since pylons cannot go there. Null for ground nothing can
     cross. The span carries the techId it was read on. */
  function headlineSpan(typeId) {
    var type = cellType(typeId);
    if (!type.passable) { return null; }
    var allowed = CFG.technologies.filter(function (tech) { return canUseTech(tech.id, typeId); });
    if (!allowed.length) { return null; }
    var pick = allowed.filter(function (tech) { return tech.standard; })[0] || allowed[0];
    var span = scoreSegment(typeId, pick.id);
    span.techId = pick.id;
    return span;
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

  /* A route is an array of segments, each { col, row, typeId, techId,
     beside }. `beside` is recorded when the span is laid, the way typeId
     is, and a segment without it is read as not beside houses.
     Returns the raw totals, the three dials, and a few facts the game needs
     to decide whether the connection can be energised. */
  function scoreRoute(route) {
    var totals = { cost: 0, env: 0, comm: 0 };
    var crossesSubstation = false;
    var p = CFG.precision.totals;

    for (var i = 0; i < route.length; i++) {
      var segment = route[i];
      var scored = scoreSegment(segment.typeId, segment.techId, segment.beside);
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

  /* Where each dial's points went.

     The route grouped by ground and technology - "three woodland spans on
     lattice" rather than three separate spans - with how many points of
     each dial that group took, on the same scale the meters read. A dial
     that has dropped can then say why in the terms the player chose in:
     which land, and what it was built on.

     Points are the unclamped share of the budget, so they add up to what
     the dial lost until the dial hits 0 or 100; past that the meter stops
     moving and the extra is still listed, which is the honest reading. */
  function contributions(route) {
    var b = CFG.budgets;
    var p = CFG.precision.dials;
    var groups = {};
    var order = [];

    for (var i = 0; i < route.length; i++) {
      var segment = route[i];
      // Spans beside houses are their own group: the same ground costs more there.
      var beside = !!segment.beside;
      var key = segment.typeId + '|' + segment.techId + (beside ? '|beside' : '');
      if (!groups[key]) {
        groups[key] = { typeId: segment.typeId, techId: segment.techId, beside: beside, count: 0, cost: 0, env: 0, comm: 0 };
        order.push(key);
      }
      var scored = scoreSegment(segment.typeId, segment.techId, beside);
      groups[key].count++;
      groups[key].cost += scored.cost;
      groups[key].env += scored.env;
      groups[key].comm += scored.comm;
    }

    return order.map(function (key) {
      var g = groups[key];
      return {
        typeId: g.typeId,
        techId: g.techId,
        beside: g.beside,
        count: g.count,
        points: {
          cost: roundTo(-(g.cost / b.COST_BUDGET) * 100, p),
          env: roundTo((g.env / b.ENV_FLOOR) * 100, p),
          comm: roundTo((g.comm / b.COMM_FLOOR) * 100, p)
        }
      };
    });
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

    // ---- Where the points went ------------------------------------------
    // The same route as assertion 2, grouped. The two designated land spans
    // took 40 environment points between them: 2 x -8 = -16, of a floor of 40.
    say('');
    say('Assertion 2b: the points assertion 2 lost, grouped by ground');
    var groups = contributions(routeOf(repeat('farmland', 12).concat(repeat('sssi', 2)), 'lattice'));
    check('two groups', groups.length, 2);
    check('designated land count', groups[1].count, 2);
    check('designated land environment points', groups[1].points.env, -40);

    // ---- The technology table -------------------------------------------
    /* Every technology has figures on every ground it may be built on, and
       they are shaped the way the balance search needs: whole tenths, so
       its packed totals carry no floating point dust, and environment never
       above zero, because its pruning assumes a route's environment can
       only fall. A figure that breaks either would not fail loudly there -
       it would quietly accept or reject the wrong maps. */
    say('');
    say('Technology table: every ground has usable figures for every technology');
    var tableProblems = [];
    var standards = CFG.technologies.filter(function (tech) { return tech.standard; }).length;
    Object.keys(CFG.cellTypes).forEach(function (typeId) {
      if (!CFG.cellTypes[typeId].passable) { return; }
      CFG.technologies.forEach(function (tech) {
        if (!canUseTech(tech.id, typeId)) { return; }
        [false, true].forEach(function (beside) {
          var where = typeId + (beside ? ' beside houses' : '') + ' on ' + tech.id;
          var span;
          try { span = scoreSegment(typeId, tech.id, beside); } catch (err) {
            tableProblems.push(err.message);
            return;
          }
          ['cost', 'env', 'comm'].forEach(function (field) {
            var value = span[field];
            if (typeof value !== 'number' || Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) {
              tableProblems.push(where + ': ' + field + ' ' + value + ' is not whole tenths');
            }
          });
          if (span.env > 0) {
            tableProblems.push(where + ': env ' + span.env + ' is above zero');
          }
        });
      });
    });
    var extras = (CFG.besideHomes && CFG.besideHomes.comm) || {};
    Object.keys(extras).forEach(function (techId) {
      var value = extras[techId];
      if (typeof value !== 'number' || Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) {
        tableProblems.push('besideHomes.comm.' + techId + ' ' + value + ' is not whole tenths');
      }
    });
    check('exactly one standard technology', standards, 1);
    check('problems in the table', tableProblems.length, 0);
    tableProblems.forEach(function (problem) { say('          - ' + problem); });

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

    /* Beside houses, on the same map. Column 8 of row 2 has houses to its
       east; column 8 of row 5 only touches them at a corner, which does not
       count; column 0 of row 0 is nowhere near. */
    say('');
    say('Assertion 4: a span beside houses pays for being in their view');
    check('an edge shared with houses is beside them', besideHomes(8, 2), true);
    check('a corner shared with houses is not', besideHomes(8, 5), false);
    check('far from houses is not', besideHomes(0, 0), false);
    check('the same answer from a grid passed in', besideHomesGrid(gridFrom(TEST_MAP))[2][8], true);
    var rule = CFG.besideHomes.comm;
    check('lattice beside houses adds its figure',
      scoreSegment('farmland', 'lattice', true).comm, roundTo(CFG.cellTypes.farmland.commImpact + (rule.lattice || 0), 1));
    check('a route reads the flag it was laid with',
      scoreRoute([{ col: 8, row: 2, typeId: 'farmland', techId: 'lattice', beside: true }]).totals.comm,
      roundTo(CFG.cellTypes.farmland.commImpact + (rule.lattice || 0), 1));
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
    scoreSegment: scoreSegment,
    headlineSpan: headlineSpan,
    besideHomes: besideHomes,
    besideHomesGrid: besideHomesGrid,
    scoreRoute: scoreRoute,
    contributions: contributions,
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
