/* =========================================================================
   Connecting the Grid - CONFIG
   =========================================================================

   THIS IS THE ONLY FILE YOU NEED TO EDIT TO REBALANCE THE GAME.

   Everything tunable lives here: the map, the cost/impact numbers, the
   technology multipliers, the scoring budgets and every word of on-screen
   text. No other file contains a magic number or a hard-coded string.

   Quick guide for non-developers
   ------------------------------
   * Numbers: change the digits. Keep the commas and colons where they are.
   * Text:    change what is inside the 'quote marks'. Keep the quote marks.
   * Map:     see the MAP section below. It is drawn as a picture.

   Loaded as a plain browser script, so this file defines one global called
   CONFIG. There is no build step and no module system - the game must run
   by opening index.html straight off the disk.
   ========================================================================= */

var CONFIG = {

  /* -----------------------------------------------------------------------
     GRID AND ENDPOINTS
     Columns are numbered 0 (far left) to 10 (far right).
     Rows are numbered 0 (top) to 8 (bottom).
     --------------------------------------------------------------------- */
  grid: {
    cols: 11,
    rows: 9
  },

  // Where the new connection begins: the generation site, on the left edge.
  start: { col: 0, row: 4 },

  // Where it must end: the demand centre, on the right edge.
  end: { col: 10, row: 4 },

  // The badges drawn on those two cells.
  markers: {
    start: { icon: 'img/marker-generation.svg' },
    end: { icon: 'img/marker-demand.svg' }
  },


  /* -----------------------------------------------------------------------
     SCORING BUDGETS
     These set how harsh each dial is. Lower numbers = harsher scoring.

       COST_BUDGET  spending this much money takes the Cost dial to 0
       ENV_FLOOR    this much environmental harm takes the Environment dial to 0
       COMM_FLOOR   this much community harm takes the Community dial to 0
     --------------------------------------------------------------------- */
  budgets: {
    COST_BUDGET: 60,
    ENV_FLOOR: 40,
    COMM_FLOOR: 40
  },


  /* -----------------------------------------------------------------------
     CELL TYPES
     One entry per kind of land the route can cross.

       cost         how much money one cell of this land costs to cross
       envImpact    environmental harm, always zero or negative
       commImpact   community effect, negative = harm, positive = benefit
       passable     false means the route can never enter this cell
       icon         the SVG file drawn in the cell
       description  the plain-English line shown when the cell is inspected
     --------------------------------------------------------------------- */
  cellTypes: {
    farmland: {
      id: 'farmland',
      label: 'Farmland',
      cost: 1,
      envImpact: 0,
      commImpact: 0,
      passable: true,
      icon: 'img/farmland.svg',
      description: 'Open agricultural land. The easiest and cheapest ground to build across.'
    },
    road: {
      id: 'road',
      label: 'Road',
      cost: 3,
      envImpact: 0,
      commImpact: -2,
      passable: true,
      icon: 'img/road.svg',
      description: 'A public road. Working over live traffic means closures and disruption.'
    },
    rocky: {
      id: 'rocky',
      label: 'Rocky ground',
      cost: 4,
      envImpact: -1,
      commImpact: 0,
      passable: true,
      icon: 'img/rocky.svg',
      description: 'Hard rock. Foundations need blasting and piling, which costs time and money.'
    },
    hilly: {
      id: 'hilly',
      label: 'Hills',
      cost: 3,
      envImpact: 0,
      commImpact: 0,
      passable: true,
      icon: 'img/hilly.svg',
      description: 'Steep ground. Awkward access for plant and cranes, but nothing sensitive.'
    },
    woodland: {
      id: 'woodland',
      label: 'Woodland',
      cost: 3,
      envImpact: -3,
      commImpact: 0,
      passable: true,
      icon: 'img/woodland.svg',
      description: 'Established trees. A route through here means felling and a permanent cleared swathe.'
    },
    river: {
      id: 'river',
      label: 'River',
      cost: 5,
      envImpact: -2,
      commImpact: 0,
      passable: true,
      icon: 'img/river.svg',
      description: 'A watercourse. Long spans and tall towers are needed. Cable cannot be laid through it.'
    },
    sssi: {
      id: 'sssi',
      label: 'Designated land',
      cost: 4,
      envImpact: -8,
      commImpact: 0,
      passable: true,
      icon: 'img/sssi.svg',
      description: 'Protected habitat. Building here does serious and hard-to-reverse ecological damage.'
    },
    settlement: {
      id: 'settlement',
      label: 'Houses and industry',
      cost: 2,
      envImpact: 0,
      commImpact: -8,
      passable: true,
      icon: 'img/settlement.svg',
      description: 'Where people live and work. Overhead lines here draw strong and sustained objection.'
    },
    customer: {
      id: 'customer',
      label: 'Connection customer',
      cost: 2,
      envImpact: 0,
      commImpact: 6,
      passable: true,
      icon: 'img/customer.svg',
      description: 'A site waiting for a connection. Route through it and they get connected.'
    },
    benefit: {
      id: 'benefit',
      label: 'Community benefit',
      cost: 0,
      envImpact: 0,
      commImpact: 4,
      passable: true,
      icon: 'img/benefit.svg',
      description: 'Land offered under a community benefit scheme. Welcomed locally, and free to cross.'
    },
    substation: {
      id: 'substation',
      label: 'Substation',
      cost: 6,
      envImpact: -1,
      commImpact: 0,
      passable: true,
      icon: 'img/substation.svg',
      description: 'A switching and transformer site. The connection must pass through one to be energised.'
    },
    water: {
      id: 'water',
      label: 'Open water',
      cost: 0,
      envImpact: 0,
      commImpact: 0,
      passable: false,
      icon: 'img/water.svg',
      description: 'A lake or reservoir. The route cannot cross it.'
    }
  },


  /* -----------------------------------------------------------------------
     TECHNOLOGIES
     The choice made before laying each segment.

       costMult     multiplies the land cost for that segment
       impactMult   multiplies BOTH the environmental and community numbers,
                    so a low multiplier also shrinks any positive community
                    benefit, not just the harm
       bansTerrain  cell type ids this technology can never be used on
     --------------------------------------------------------------------- */
  technologies: [
    {
      id: 'lattice',
      label: 'Lattice tower',
      short: 'Lattice',
      costMult: 1.0,
      impactMult: 1.0,
      bansTerrain: [],
      icon: 'img/tech-lattice.svg',
      summary: 'Standard cost, full impact',
      description: 'The conventional steel tower. Cheapest to build, and the most visible in the landscape.'
    },
    {
      id: 'tpylon',
      label: 'T-pylon',
      short: 'T-pylon',
      costMult: 1.4,
      impactMult: 0.7,
      bansTerrain: [],
      icon: 'img/tech-tpylon.svg',
      summary: '1.4x cost, 0.7x impact',
      description: 'A shorter single-shaft design with a smaller footprint. Costs more, but sits far more quietly.'
    },
    {
      id: 'cable',
      label: 'Underground cable',
      short: 'Cable',
      costMult: 6.0,
      impactMult: 0.2,
      bansTerrain: ['river'],
      icon: 'img/tech-cable.svg',
      summary: '6x cost, 0.2x impact, no rivers',
      description: 'Buried out of sight entirely. Enormously expensive, and it cannot be taken through a river.'
    }
  ],

  // Which technology is selected when the game starts or is reset.
  defaultTechnology: 'lattice',


  /* -----------------------------------------------------------------------
     RULES
     --------------------------------------------------------------------- */
  rules: {
    // The route must pass through at least one substation to be energised.
    requireSubstation: true,
    // Orthogonal movement only. Set true to allow diagonal moves.
    allowDiagonals: false,
    // The route may never re-enter a cell it has already used.
    allowRevisit: false
  },


  /* -----------------------------------------------------------------------
     THE MAP
     Nine rows of eleven letters. Each letter is one cell.

        F  farmland          W  woodland          C  connection customer
        R  road              V  river             B  community benefit
        K  rocky ground      S  designated land   X  substation
        H  hills             T  houses/industry   ~  open water (blocked)

     The generation site sits at column 0, row 4 and the demand centre at
     column 10, row 4 (set by 'start' and 'end' above). The land under them
     still scores normally.

     Design notes, so the balance survives editing:
       * The river fills column 7 top to bottom, so every route crosses it
         once and no route can use cable there.
       * Columns 3 and 4 are an impact belt. Designated land in the middle,
         woodland above and below, a settlement gap at row 2, and clean
         hills only at the very top and very bottom rows.
       * Water at column 2 rows 3 and 5 squeezes the approach to the middle.
       * Two substations, at column 6 row 4 and column 6 row 8.
     --------------------------------------------------------------------- */
  map: [
    /* row 0 */ 'FFHHHFFVHHF',
    /* row 1 */ 'FHWWKFFVKWF',
    /* row 2 */ 'FFTTTFFVFWF',
    /* row 3 */ 'FF~SSFFVFTF',
    /* row 4 */ 'FFFSSFXVFTF',
    /* row 5 */ 'FF~SSFFVFTF',
    /* row 6 */ 'FFWWWFFVFWF',
    /* row 7 */ 'FBCWWKFVKWF',
    /* row 8 */ 'FBCWWFXVHHF'
  ],

  // Which cell type each map letter means.
  legend: {
    'F': 'farmland',
    'R': 'road',
    'K': 'rocky',
    'H': 'hilly',
    'W': 'woodland',
    'V': 'river',
    'S': 'sssi',
    'T': 'settlement',
    'C': 'customer',
    'B': 'benefit',
    'X': 'substation',
    '~': 'water'
  },


  /* -----------------------------------------------------------------------
     DIALS
     Display only. The maths behind them is fixed; these are the labels and
     the bands used to describe a score in words for screen readers.
     --------------------------------------------------------------------- */
  dials: [
    {
      id: 'cost',
      label: 'Cost',
      goodDirection: 'A high score means the connection is affordable.',
      lowLabel: 'Over budget',
      highLabel: 'Affordable'
    },
    {
      id: 'env',
      label: 'Environment',
      goodDirection: 'A high score means little harm to habitats and landscape.',
      lowLabel: 'Serious harm',
      highLabel: 'Well protected'
    },
    {
      id: 'comm',
      label: 'Community',
      goodDirection: 'A high score means the route is welcome locally.',
      lowLabel: 'Strong objection',
      highLabel: 'Well supported'
    }
  ],

  // Words used to describe any dial value out loud. Checked top down: the
  // first band whose 'min' the score reaches is the one used.
  bands: [
    { min: 85, word: 'excellent' },
    { min: 70, word: 'good' },
    { min: 50, word: 'fair' },
    { min: 30, word: 'poor' },
    { min: 0, word: 'very poor' }
  ],


  /* -----------------------------------------------------------------------
     VERDICTS
     Shown when the route reaches the demand centre. The dial with the
     LOWEST score decides which verdict appears. 'balanced' is used when
     every dial finishes at or above balancedThreshold.
     --------------------------------------------------------------------- */
  balancedThreshold: 70,

  verdicts: {
    balanced: {
      title: 'A route that will get consent',
      body: 'This is the sort of scheme that gets through a planning inquiry without a fight. ' +
            'You have kept the spend proportionate, stayed out of the designated land, and not ' +
            'put a line over anybody\'s roof. Nothing here is free, but every trade-off you made ' +
            'is one you could defend in a hearing. Good work.'
    },
    cost: {
      title: 'Sound engineering, unaffordable scheme',
      body: 'Environmentally and socially this route is hard to argue with. The problem is the ' +
            'bill. Undergrounding and long detours are the two most reliable ways to spend money ' +
            'on a transmission connection, and this route uses both. A scheme that cannot be ' +
            'funded does not get built, and a connection that does not get built helps nobody.'
    },
    env: {
      title: 'This will not survive an environmental assessment',
      body: 'You have taken the direct line, and the direct line goes straight through protected ' +
            'habitat. Designated land is not a matter of negotiation. An assessment on this route ' +
            'would stop it, and the years lost to the argument would cost more than routing around ' +
            'it ever would have. Go back and treat the designated land as a wall, not a shortcut.'
    },
    comm: {
      title: 'Technically fine, politically finished',
      body: 'On paper this is a competent route. In practice you have run a transmission line past ' +
            'people\'s homes, and they will fight it for as long as it takes. Every objection is a ' +
            'delay and every delay is a cost. Where you cannot avoid a community, that is exactly ' +
            'where the money for undergrounding is best spent.'
    }
  },


  /* -----------------------------------------------------------------------
     ON-SCREEN TEXT
     Every word the player sees. {n} style placeholders are filled in by the
     game - keep them in place.
     --------------------------------------------------------------------- */
  copy: {
    title: 'Connecting the Grid',
    strapline: 'Route a new transmission connection from the generation site to the demand centre.',

    startLabel: 'Generation site',
    endLabel: 'Demand centre',

    techHeading: 'Choose your technology',
    techHint: 'Pick a technology, then click the next cell in your route. You can change technology at any point.',

    dialsHeading: 'Live score',
    controlsHeading: 'Controls',

    undo: 'Undo last segment',
    reset: 'Start again',

    statusReady: 'Choose a technology, then click a cell next to the generation site.',
    statusRouting: '{n} segments laid. Keep going to the demand centre on the right.',
    statusComplete: 'Connection energised.',
    statusNotEnergised: 'You have reached the demand centre, but the route does not pass through a substation. Undo and route through one.',

    errNotAdjacent: 'Pick a cell directly next to the end of your route. No diagonals.',
    errAlreadyUsed: 'The route already runs through that cell.',
    errImpassable: 'The route cannot cross open water.',
    errTechBanned: '{tech} cannot be used on {terrain}.',
    errNoRoute: 'There is nothing to undo yet.',
    errComplete: 'The connection is finished. Undo a segment or start again.',

    substationReminder: 'The route must pass through a substation.',
    substationMet: 'Substation reached.',

    legendHeading: 'What the land means',
    verdictHeading: 'Verdict',

    // How each cell is described to a screen reader. The {braces} are filled
    // in by the game, so keep them exactly as they are.
    cellPosition: 'Column {col}, row {row}.',
    cellTerrain: '{terrain}. Cost {cost}, environment {env}, community {comm}.',
    cellRouted: 'Segment {n} of the route, carried on {tech}.',
    cellAvailable: 'Available as the next step.',
    cellUnavailable: 'Not reachable from the end of the route.',
    cellIsStart: 'Generation site, where the route begins.',
    cellIsEnd: 'Demand centre, where the route must finish.',
    cellIsHead: 'End of the route so far.',

    boardLabel: 'Route map, {cols} columns by {rows} rows'
  },


  /* -----------------------------------------------------------------------
     NUMBER FORMATTING
     How many decimal places to keep. Presentation only - it does not change
     how the game is scored.
     --------------------------------------------------------------------- */
  precision: {
    totals: 2,
    dials: 1
  },


  /* -----------------------------------------------------------------------
     DEVELOPER OPTIONS
     --------------------------------------------------------------------- */
  debug: {
    // Set true to run the scoring self-test in the browser console on load.
    runSelfTestOnLoad: false
  }
};


/* Lets the same file be loaded by Node for the scoring tests. Ignored by
   the browser, and adds no build step. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
