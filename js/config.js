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

  /* Where the new connection begins. 'entry' is the side of that square the
     line arrives on, so the first piece laid must have an opening facing it.
     With the start on column 0, 'w' means the line comes in from the
     generation site off the left edge. */
  start: { col: 0, row: 4, entry: 'w' },

  /* Where it must end: the demand centre, on the right edge. 'exit' is the
     side the line must leave by, so the last piece must open that way. */
  end: { col: 10, row: 4, exit: 'e' },

  // The badges drawn on those two cells.
  markers: {
    start: { icon: 'img/marker-generation.svg' },
    end: { icon: 'img/marker-demand.svg' }
  },


  /* -----------------------------------------------------------------------
     PIECES
     The six shapes in the palette. A piece is nothing but its two open ends,
     drawn from n (north/up), e (east/right), s (south/down), w (west/left).

     There are exactly six ways to pick two of the four sides, so these six
     pieces cover every straight and every corner. Do not expect to add a
     seventh - there isn't one. You can reorder them, or reword the labels.

       connectors  the two sides the track opens onto
       label       the name shown in the palette
       aria        how the piece is read out to a screen reader
     --------------------------------------------------------------------- */
  pieces: [
    {
      id: 'ew',
      connectors: ['e', 'w'],
      label: 'Straight across',
      aria: 'Straight piece running left to right.'
    },
    {
      id: 'ns',
      connectors: ['n', 's'],
      label: 'Straight up',
      aria: 'Straight piece running top to bottom.'
    },
    {
      id: 'es',
      connectors: ['e', 's'],
      label: 'Corner, right to down',
      aria: 'Corner piece joining the right side to the bottom.'
    },
    {
      id: 'sw',
      connectors: ['s', 'w'],
      label: 'Corner, down to left',
      aria: 'Corner piece joining the bottom to the left side.'
    },
    {
      id: 'wn',
      connectors: ['w', 'n'],
      label: 'Corner, left to up',
      aria: 'Corner piece joining the left side to the top.'
    },
    {
      id: 'ne',
      connectors: ['n', 'e'],
      label: 'Corner, up to right',
      aria: 'Corner piece joining the top to the right side.'
    }
  ],


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
    // The route may never re-enter a cell it has already used.
    allowRevisit: false,
    /* Set false for the strictest version of the game: once a piece is down
       it stays down, and the only way back is Start again. Left true here
       because undo is also how a keyboard or screen reader user recovers
       from a misplaced piece. */
    allowUndo: true
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

    // Sidebar tabs
    tabHome: 'Home',
    tabInstructions: 'Instructions',

    // The palette
    piecesHeading: 'Pieces',
    piecesHint: 'Pick your route carefully. The more pieces you use, the more it will cost.',
    piecesLabel: 'Track pieces',

    techHeading: 'Choose your technology',
    techHint: 'Pick a technology, then place a piece. You can change technology at any point.',

    dialsHeading: 'Points',
    controlsHeading: 'Controls',

    undo: 'Undo last piece',
    reset: 'Start again',
    closeButton: 'Close',

    statusReady: 'Choose a piece, then drop it on the highlighted square to get going.',
    statusArmed: '{piece} selected. Drop it on the highlighted square.',
    statusRouting: '{n} pieces laid. Keep going to the demand centre on the right.',
    statusComplete: 'Connection energised.',
    statusStuck: 'The line has nowhere to go from here. Undo the last piece, or start again.',
    statusNotEnergised: 'You have reached the demand centre, but the route does not pass through a substation. Undo and route through one.',
    statusWrongEndPiece: 'You have reached the demand centre, but the line does not run into it. The last piece needs an opening on the right.',

    errNoPiece: 'Choose a piece from the palette first.',
    errWrongSquare: 'That is not where the line goes next. Use the highlighted square.',
    errPieceDoesNotFit: 'That piece does not line up. You need one that opens towards the {side}.',
    errStartPiece: 'The line comes in from the {side}, so the first piece must open that way.',
    errAlreadyUsed: 'The route already runs through that cell.',
    errImpassable: 'The route cannot cross open water.',
    errTechBanned: '{tech} cannot be used on {terrain}.',
    errNoRoute: 'There is nothing to undo yet.',
    errUndoDisabled: 'Pieces cannot be removed once they are laid. Start again to change your route.',
    errComplete: 'The connection is finished. Undo a piece or start again.',

    substationReminder: 'The route must pass through a substation.',
    substationMet: 'Substation reached.',

    legendHeading: 'What the land means',
    verdictHeading: 'Verdict',

    // Read out for the four compass directions, in the errors above.
    sides: { n: 'top', e: 'right', s: 'bottom', w: 'left' },

    // The instructions overlay. Each string is one paragraph.
    instructionsHeading: 'How to play',
    instructions: [
      'Lay your line starting at the generation site and finish at the demand centre.',
      'Choose a piece from the palette, then drop it on the highlighted square. Each piece only fits if its openings line up with the line you have already laid.',
      'Try to avoid protected land and built-up areas. Watch the three meters as you build.',
      'The line must pass through a substation to be energised.',
      'If you want to start again, use the Home button.',
      'Good luck!'
    ],

    // How each cell is described to a screen reader. The {braces} are filled
    // in by the game, so keep them exactly as they are.
    cellPosition: 'Column {col}, row {row}.',
    cellTerrain: '{terrain}. Cost {cost}, environment {env}, community {comm}.',
    cellRouted: 'Piece {n} of the route, {piece}, carried on {tech}.',
    cellAvailable: 'This is where the next piece goes.',
    cellIsStart: 'Generation site, where the route begins.',
    cellIsEnd: 'Demand centre, where the route must finish.',
    cellIsHead: 'End of the route so far.',

    // The three meters.
    meterReading: '{label}: {value} out of 100, {band}.',

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
