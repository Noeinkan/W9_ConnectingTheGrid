/* =========================================================================
   Connecting the Grid - CONFIG
   =========================================================================

   THIS IS THE ONLY FILE YOU NEED TO EDIT TO REBALANCE THE GAME.

   Everything tunable lives here: the map generator, the cost/impact numbers,
   the technology multipliers, the scoring budgets and every word of on-screen
   text. No other file contains a magic number or a hard-coded string.

   Quick guide for non-developers
   ------------------------------
   * Numbers: change the digits. Keep the commas and colons where they are.
   * Text:    change what is inside the 'quote marks'. Keep the quote marks.
   * Map:     maps are generated. See THE MAP GENERATOR below.

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
    COST_BUDGET: 130,
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
       texture      how the land is DRAWN on the map, which is presentation
                    only and never affects scoring:
                      'plain'     a flat block of colour, no symbol at all.
                                  Use it for ground that should read as one
                                  continuous area - fields, roads, water.
                      'scatter'   the symbol is sprinkled over some of the
                                  cells, jittered, so a run of them looks
                                  like a wood or a range of hills rather
                                  than a row of identical tiles.
                      'landmark'  one crisp symbol on a pale disc, centred.
                                  Use it for single places worth finding.
       density      'scatter' only. Roughly what share of the cells get a
                    symbol, 0 to 1. Higher means denser cover.
       description  the plain-English line shown when the cell is inspected
       tip          one short line saying what this ground means for the
                    ROUTE - the penalty, the detour, the exception - shown
                    under the numbers in the tooltip and after "Explain
                    last span". The description says what the land is;
                    this says why the player should care.
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
      texture: 'plain',
      description: 'Open agricultural land. The easiest and cheapest ground to build across.',
      tip: 'The baseline. Nothing here counts against you but the span itself.'
    },
    road: {
      id: 'road',
      label: 'Road',
      cost: 3,
      envImpact: 0,
      commImpact: -2,
      passable: true,
      icon: 'img/road.svg',
      texture: 'plain',
      description: 'A public road. Working over live traffic means closures and disruption.',
      tip: 'Road crossing: closures and disruption cost community support whichever way you cross.'
    },
    rocky: {
      id: 'rocky',
      label: 'Rocky ground',
      cost: 4,
      envImpact: -1,
      commImpact: 0,
      passable: true,
      icon: 'img/rocky.svg',
      texture: 'scatter',
      density: 0.75,
      description: 'Hard rock. Foundations need blasting and piling, which costs time and money.',
      tip: 'Blasting and piling put the price up, and do a little harm to the ground.'
    },
    hilly: {
      id: 'hilly',
      label: 'Hills',
      cost: 3,
      envImpact: 0,
      commImpact: 0,
      passable: true,
      icon: 'img/hilly.svg',
      texture: 'scatter',
      density: 0.7,
      description: 'Steep ground. Awkward access for plant and cranes, but nothing sensitive.',
      tip: 'Awkward access puts the price up, but nothing here is sensitive.'
    },
    woodland: {
      id: 'woodland',
      label: 'Woodland',
      cost: 3,
      envImpact: -3,
      commImpact: 0,
      passable: true,
      icon: 'img/woodland.svg',
      texture: 'scatter',
      density: 0.8,
      description: 'Established trees. A route through here means felling and a permanent cleared swathe.',
      tip: 'Felling a swathe harms the environment. A T-pylon softens it; cable almost removes it.'
    },
    river: {
      id: 'river',
      label: 'River',
      cost: 5,
      envImpact: -2,
      commImpact: 0,
      passable: true,
      icon: 'img/river.svg',
      texture: 'plain',
      description: 'A watercourse. Long spans and tall towers are needed. Cable cannot be laid through it.',
      tip: 'River crossing: every route makes one. Cable is not allowed, so a buried line has to come up to cross.'
    },
    sssi: {
      id: 'sssi',
      label: 'Designated land',
      cost: 4,
      envImpact: -8,
      commImpact: 0,
      passable: true,
      icon: 'img/sssi.svg',
      texture: 'scatter',
      density: 0.5,
      description: 'Protected habitat. Building here does serious and hard-to-reverse ecological damage.',
      tip: 'The heaviest environmental harm on the map. Going round is almost always worth the extra spans.'
    },
    settlement: {
      id: 'settlement',
      label: 'Houses and industry',
      cost: 2,
      envImpact: 0,
      commImpact: -8,
      passable: true,
      icon: 'img/settlement.svg',
      texture: 'scatter',
      density: 0.85,
      description: 'Where people live and work. Overhead lines here draw strong and sustained objection.',
      tip: 'The heaviest community penalty on the map. If the line must pass here, this is where cable earns its price.'
    },
    customer: {
      id: 'customer',
      label: 'Connection customer',
      cost: 2,
      envImpact: 0,
      commImpact: 6,
      passable: true,
      icon: 'img/customer.svg',
      texture: 'landmark',
      description: 'A site waiting for a connection. Route through it and they get connected.',
      tip: 'Gives community support back. Worth a small detour.'
    },
    benefit: {
      id: 'benefit',
      label: 'Community benefit',
      cost: 0,
      envImpact: 0,
      commImpact: 4,
      passable: true,
      icon: 'img/benefit.svg',
      texture: 'landmark',
      description: 'Land offered under a community benefit scheme. Welcomed locally, and free to cross.',
      tip: 'Free to cross and welcomed locally. Worth a small detour.'
    },
    grant: {
      id: 'grant',
      label: 'Connection funding',
      /* The only ground on the map that GIVES cost back, which is why it is
         marked fixedCost: a grant is a sum agreed in advance and does not
         grow because the scheme chose a dearer technology. Every other
         number here behaves exactly as it does everywhere else. */
      cost: -4,
      fixedCost: true,
      envImpact: 0,
      commImpact: 0,
      passable: true,
      icon: 'img/grant.svg',
      texture: 'plain',
      description: 'A funded connection point. Routing through it brings money to the scheme, but it is nowhere near the direct line.',
      tip: 'Pays cost back, and the same sum whichever technology crosses it.'
    },
    substation: {
      id: 'substation',
      label: 'Substation',
      cost: 6,
      envImpact: -1,
      commImpact: 0,
      passable: true,
      icon: 'img/substation.svg',
      texture: 'landmark',
      description: 'A switching and transformer site. The connection must pass through one to be energised.',
      tip: 'The line must pass through one. Pick the one that suits the rest of your route.'
    },
    water: {
      id: 'water',
      label: 'Open water',
      cost: 0,
      envImpact: 0,
      commImpact: 0,
      passable: false,
      icon: 'img/water.svg',
      texture: 'plain',
      description: 'A lake or reservoir. The route cannot cross it.',
      tip: 'The line has to go round, so a lake near the direct line means a detour.'
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
     THE MAP GENERATOR
     Every map is built from a seed, then checked before it is shown. See
     js/mapgen.js for the passes and js/balance.js for the checks.

     The column plan is the part to understand before changing anything.
     Eleven columns are shared out like this, and the numbers below are what
     hold that arrangement together:

        0        the generation site
        1 - 2    the road, running the full height of the map
        3 - 6    the designated land, a wavy band two to three cells thick
                 sitting somewhere inside them
        7 - 9    the river, running the full height of the map
        9 - 10   the town, and the demand centre

     The substations are not given a column of their own. They are put on
     the first clear ground east of the designated land, wherever that turns
     out to be once the band and the river have been drawn.

     That plan is what makes the game a game. The designated land blocks the
     direct line, so going straight is fast and ruinous. The gap at the top
     or bottom of the designated land is the way round, and it is longer.
     Every route crosses the river once and the road once, whatever it does.

        seedLength     characters in a shareable seed, e.g. 'K3F9QZ'
        maxTries       rerolls allowed before falling back. About three maps
                       in four are accepted, so twenty-four rejections in a
                       row is somewhere past astronomically unlikely - the
                       number is here to bound the worst case, not to be hit
        fallbackSeed   a seed checked at design time, used if all else fails.
                       It is tied to every other number in this block: change
                       one of them and this seed draws a different map, which
                       may no longer be a good one. The generator self test
                       checks it, so a stale seed fails the build rather than
                       waiting to be noticed.
        punishCheapOn  which dial the cheapest route must fail on: 'cost',
                       'env', 'comm', or 'any'. See js/balance.js.
        weights        share of the board given to each kind of rough ground.
                       Whatever is left over is farmland, so these must add
                       up to well under 1 or the map turns to soup.
        noise          how the rough ground is shaped. Bigger 'scale' means
                       smaller, choppier patches.
        river / road   band is [first column, last column]; drift is the
                       chance of stepping sideways at each row
        sssi           cols is [first, last]; the band is 'span' columns wide
                       and sits somewhere inside them. gapRows is how many
                       rows are left clear at the top or the bottom.
     --------------------------------------------------------------------- */
  generator: {
    seedLength: 6,
    maxTries: 24,
    fallbackSeed: '9MA7JX',
    punishCheapOn: 'env',

    weights: { rocky: 0.10, hilly: 0.18, woodland: 0.20 },
    noise: { scale: 0.30, octaves: 3, gain: 0.55 },

    river: { band: [7, 9], drift: 0.55 },
    road: { band: [1, 2], drift: 0.45 },
    sssi: { cols: [3, 6], span: 3, gapRows: 2 },
    town: { cells: 6 },
    lake: { cells: 3 },
    /* benefit and customers go on the gap rows, where the way round the
       designated land already runs. 'grants' go on the OPPOSITE side, which
       is the side with the town and the lake on it - so the half of the map
       that only ever punished a route now has something to offer, and going
       that way becomes a question rather than a mistake. */
    rewards: { benefit: 2, customers: 2, grants: 2 }
  },


  /* -----------------------------------------------------------------------
     MAP ARCHETYPES
     Kinds of landscape, so that a new map is not just another roll of the
     same one. Which kind a map is comes from its seed, by weight, so a seed
     shared with somebody always draws the same kind and the same map.

       weight      how often this kind comes up, against the others. Four
                   kinds at 1 and one at 3 means the 3 comes up three times
                   in eight.
       label       the name shown beside the landscape's name
       hint        one sentence, shown when the name is hovered or focused
       weekly      true if it can be This week's landscape. The plain kind
                   is left out, so the week is always something particular.
       maxTries    rerolls allowed while looking for one of this kind. Only
                   needed on a kind that is rarely accepted.
       generator   changes laid over THE MAP GENERATOR above, one level deep:
                   `town: { side: 'gap' }` keeps the town's cell count.
                     river.banks   share of the ground on both river banks
                                   that grows woodland, 0 to 1
                     town.side     'far' (usual) or 'gap': the town stands
                                   across the way round instead
       accept      what a map of this kind must ALSO show, on top of the
                   balance checks every map passes. All optional:
                     weakestBelow      the best route found scores under
                                       this on its weakest dial
                     dialBelow         e.g. { comm: 90 }: the best route
                                       cannot get that dial above this
                     everyDialAtMost   the best route has no dial above this
                     detourCostAtMost  the best route costs at most this many
                                       times what the cheapest route costs

     Every number below was measured, not guessed. Re-measure with
     `node js/archetypes.js --seeds 300` before moving one: it reports how
     often each kind is accepted, and a kind accepted less than a third of
     the time needs a higher maxTries.
     --------------------------------------------------------------------- */
  archetypes: [
    {
      id: 'classic',
      weight: 3,
      label: 'Open country',
      hint: 'Protected land across the direct line, and a longer way round it.',
      weekly: false
    },
    {
      id: 'squeeze',
      weight: 1,
      // Not "Tight squeeze": the difficulty badge beside it already says Tight.
      label: 'Narrow gap',
      hint: 'The way round is one row wide and rough going. A balanced route exists, but only just.',
      weekly: true,
      generator: {
        sssi: { gapRows: 1 },
        weights: { rocky: 0.14, hilly: 0.20, woodland: 0.26 },
        lake: { cells: 5 }
      },
      accept: { weakestBelow: 73 }
    },
    {
      id: 'community',
      weight: 1,
      label: 'Community pressure',
      hint: 'The town stands across the way round. Staying clear of the habitat means passing homes, or paying to bury the line.',
      weekly: true,
      generator: { town: { side: 'gap', cells: 8 } },
      accept: { dialBelow: { comm: 90 } }
    },
    {
      id: 'crossing',
      weight: 1,
      label: 'Hard crossing',
      hint: 'Woods line both banks of the river, so there is no cheap place to cross it.',
      weekly: true,
      generator: { river: { banks: 1 } }
    },
    {
      id: 'knife',
      weight: 1,
      label: 'Knife edge',
      hint: 'Nothing here can be kept comfortable. A balanced route has to run close to the line on all three dials.',
      weekly: true,
      generator: { town: { side: 'gap', cells: 8 }, river: { banks: 1 } },
      accept: { everyDialAtMost: 85 }
    },
    {
      id: 'longway',
      weight: 1,
      label: 'The long way round',
      hint: 'The straight line looks cheapest. Count again: the way round costs barely more.',
      weekly: true,
      maxTries: 60,
      accept: { detourCostAtMost: 1.08 }
    }
  ],


  /* -----------------------------------------------------------------------
     THE MAP ALPHABET
     Each letter stands for one kind of ground. The generator writes maps in
     these letters and the scoring engine reads them back, so a new kind of
     ground needs an entry here as well as one in cellTypes above.

        F  farmland          W  woodland          C  connection customer
        R  road              V  river             B  community benefit
        K  rocky ground      S  designated land   X  substation
        H  hills             T  houses/industry   G  connection funding
                                                  ~  open water (blocked)
     --------------------------------------------------------------------- */

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
    'G': 'grant',
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
      highLabel: 'Affordable',
      /* Shows the running total against the budget underneath the meter, so
         "78 out of 100" also reads as "28 of 130 spent". Set 'budget' to the
         name of the figure in 'budgets' this dial is measured against, and
         'spend' to which running total to show. Leave both off a dial and
         nothing is shown, which is right for the two that have no budget to
         run out of. */
      budget: 'COST_BUDGET',
      spend: 'cost',
      /* The last line of the "Why?" note on a meter that has dropped, after
         the list of where its points went. Say what moves this dial, in a
         sentence a player can act on. */
      whyHint: 'Cable costs six times what a lattice tower does, and every extra span adds up. Connection funding gives some back.'
    },
    {
      id: 'env',
      label: 'Environment',
      goodDirection: 'A high score means little harm to habitats and landscape.',
      lowLabel: 'Serious harm',
      highLabel: 'Well protected',
      whyHint: 'Designated land does the most harm, then woodland. A T-pylon cuts harm by nearly a third; cable by four fifths.'
    },
    {
      id: 'comm',
      label: 'Community',
      goodDirection: 'A high score means the route is welcome locally.',
      lowLabel: 'Strong objection',
      highLabel: 'Well supported',
      whyHint: 'Houses and roads cost support; customers and benefit land give it back. Quieter technology softens both, the good with the bad.'
    }
  ],


  /* -----------------------------------------------------------------------
     GUIDANCE WHILE ROUTING
     How loudly the game speaks up about the best finish still open - the
     best weakest dial any route onward from the end of the line can still
     reach. See js/foresight.js.

       slipNotice  a span that takes at least this many points off the best
                   finish is mentioned in the status line and tinted amber
                   on the map. Smaller losses are real but not worth a
                   sentence each: on a long drag they would fill the status
                   line with noise. Losing the balanced verdict is always
                   mentioned, however small the drop that did it.
     --------------------------------------------------------------------- */
  guidance: {
    slipNotice: 1
  },

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
     DIFFICULTY
     How hard the landscape in play is, in a word.

     Read off the best weakest dial any route on the map reaches, which the
     balance search works out before the map is ever shown. Every accepted
     map scores at least balancedThreshold, so the interesting range is
     narrow and these bands are set from a measured sweep rather than from
     round numbers: across 500 seeds the figure ran from 70 to 77.7 with a
     median of 73.1. Re-measure with `node js/balance.js --seeds 500` before
     moving them.

     Checked top down, like 'bands' below.
     --------------------------------------------------------------------- */
  difficulty: [
    { min: 76, word: 'Generous', hint: 'There is room to score well on all three here.' },
    { min: 73, word: 'Fair', hint: 'A balanced route exists, with something to spare.' },
    { min: 0,  word: 'Tight', hint: 'The balanced route on this landscape is a narrow one.' }
  ],


  /* -----------------------------------------------------------------------
     ENCOURAGEMENT
     Added under the verdict, comparing the route just built with the best
     one the balance search found on the same landscape.

     'min' is the player's weakest dial as a PERCENTAGE of that best one, so
     100 means they matched it. Checked top down.
     --------------------------------------------------------------------- */
  encouragement: [
    { min: 100, text: 'That is the best route anyone has found on this landscape.' },
    { min: 96,  text: 'Within a whisker of the best route on this landscape.' },
    { min: 88,  text: 'A strong route. A little more was on the table.' },
    { min: 75,  text: 'A workable route, though a good deal more was available here.' },
    { min: 0,   text: 'There is a considerably better route through this landscape.' }
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

    // The top bar
    newMapButton: 'New landscape',
    dailyButton: "Today's landscape",
    tabInstructions: 'How to play',
    undo: 'Undo',
    reset: 'Start again',
    closeButton: 'Close',
    seedLabel: 'Landscape',
    seedDailyLabel: "Today's landscape",
    seedInputLabel: 'Play a named landscape',
    seedInputPlaceholder: 'Name',
    seedGo: 'Go',
    errSeedEmpty: 'Type the name of a landscape first.',

    techHeading: 'Technology',
    techHint: 'Change it as often as you like. It applies to the next span you build, not to the ones already up.',

    dialsHeading: 'Points',

    statusReady: 'Click an arrow to send the first span out of the generation site.',
    statusRouting: '{n} spans built. Keep going east to the demand centre.',
    statusComplete: 'Connection energised.',
    statusStuck: 'The line has nowhere left to go. Undo the last span, or start again.',
    statusNotEnergised: 'You have reached the demand centre, but the route does not pass through a substation. Undo and route through one.',
    statusWrongEndPiece: 'You have reached the demand centre, but the line runs past it rather than into it. It has to arrive from the {side}.',

    errWrongSquare: 'The line cannot jump. Carry on from the highlighted square.',
    errNoStraight: 'The line cannot carry straight on from here. Use one of the arrows.',
    errPieceDoesNotFit: 'The line cannot double back on itself. Pick another direction.',
    errStartPiece: 'The line arrives from the {side}, so it cannot set off that way.',
    errAlreadyUsed: 'The route already runs through that square.',
    errImpassable: 'The route cannot cross open water.',
    errTechBanned: '{tech} cannot be used on {terrain}.',
    errNoRoute: 'There is nothing to undo yet.',
    errUndoDisabled: 'Spans cannot be taken down once they are up. Start again to change your route.',
    errComplete: 'The connection is finished. Undo a span or start again.',

    legendHeading: 'What the land means',
    verdictHeading: 'Verdict',
    verdictAgain: 'New landscape',
    verdictBest: 'Show the best route found',
    verdictShare: 'Copy result',
    verdictShareCopied: 'Result copied to the clipboard.',
    verdictShareHint: 'Copying is not allowed here. Select this and copy it yourself.',
    // The heading line of the copied result. {seed} is the landscape's name.
    shareTitle: 'Connecting the Grid - {seed}',
    shareDaily: 'Connecting the Grid - {date}',
    sharePar: 'Best route found here: {par}',
    verdictBestShown: 'The best route found on this landscape is marked on the map.',
    verdictBestMissing: 'The best route on this landscape could not be drawn.',

    /* The comparison under the verdict. 'par' is the best weakest dial the
       balance search found on this landscape - see the note by it in
       js/balance.js about why it is "found" and not "possible". */
    parLine: 'Your weakest dial finished at {yours}. The best route found on this landscape reaches {par}.',
    // Used instead, when the route matched or beat that best one - repeating
    // the same number twice in one breath says nothing.
    parLineMatched: 'Your weakest dial finished at {yours}.',
    difficultyLabel: 'Difficulty',

    // This week's landscape: one of the particular kinds, the same all week.
    weeklyButton: "This week's",
    seedWeeklyLabel: "This week's landscape",
    shareWeekly: 'Connecting the Grid - week {week}',
    // Read out before the kind of landscape, e.g. "Kind of landscape: Knife edge."
    archetypeLabel: 'Kind of landscape',

    /* Blind mode. The land and what it costs stay visible - those are facts
       about the ground - but every reading of the score is held back until
       the connection is finished. */
    blindLabel: 'Blind mode',
    blindHint: 'Scores stay hidden until the connection is finished. The land and its costs are still shown.',
    blindMeters: 'Hidden until the connection is finished.',

    /* The route summary under the meters, one line until it is opened, so
       keep these short: heading and line share about forty characters.
       Facts about the line as built, never a forecast - what is still open
       is the forecast's job. */
    summaryHeading: 'Route so far',
    summaryEmpty: 'nothing built yet',
    summarySpans: '{n} spans',
    summarySpan: '1 span',
    summaryAhead: 'at least {n} more',
    summaryArrived: 'arrived',
    summaryGround: 'Ground',
    summaryTech: 'Technology',
    // Which dial would decide the verdict if the route finished now.
    summaryHolding: '{dial} is holding the verdict back: {value}, needs {threshold}.',
    summaryClear: 'All three dials are at {threshold} or above.',

    /* On the arrows, and on a square with nothing worth saying about it.
       The arrow names the ground it leads into, because that is the part of
       the choice the meters cannot show: the span being paid for now is the
       highlighted square's whichever way the line leaves, so the direction
       is a choice about what comes NEXT. */
    chevronLabel: 'Send the line to the {side}, into {terrain}.',
    chevronDeadLabel: 'The line cannot go this way.',
    tipImpassable: 'Cannot be crossed',

    // Read out for the four compass directions, in the messages above.
    sides: { n: 'top', e: 'right', s: 'bottom', w: 'left' },

    // The instructions overlay. Each string is one paragraph.
    instructionsHeading: 'How to play',
    instructions: [
      'Draw a transmission line from the generation site on the left to the demand centre on the right. The line can only ever leave the square it is standing on, so there is only ever one square in play - the highlighted one.',
      'Click one of the arrows on that square to send the line that way. Clicking the square itself carries straight on, and you can hold the mouse down and drag to draw a run in one go. Dragging back over the line rubs it out.',
      'From the keyboard: arrow keys move around the map, and an arrow key pressed on the highlighted square sends the line that way. Hold Shift with the arrow to look that way first without building. Press 1, 2 or 3 to change technology, and E to have the last span explained.',
      'Choose the technology before each span. Lattice towers are cheapest and the most visible; T-pylons cost more and sit more quietly; underground cable hides the line almost entirely but is enormously expensive, and cannot be taken through a river.',
      'Hover over any square to see what the land is and what crossing it costs. On the square in play, the dashed marks inside the three meters show where each one lands if you build it - change technology and watch them move. That is the trade-off, before you have paid for it rather than after.',
      'The arrows say what they lead into, and an arrow into water, off the map or back into the line is marked as a dead end. Most ground costs you something; a funded connection point pays you back, but it is never near the direct line.',
      'Under the meters, Best finish still open is the best score any route from where the line has got to can still reach. It never says which way to go, but when a span costs points you cannot get back the map tints that span and the status line says so. Why? beside a meter lists where its points went.',
      'The line must pass through a substation to be energised, and it must arrive at the demand centre rather than run past it.',
      'Every landscape is generated and checked before you see it, so a balanced route always exists. New landscape rolls another one, and Today\'s landscape is the one everybody else is playing today. When you finish, the verdict says what the best route found here scores, and can draw it on the map.',
      'Landscapes come in kinds, named beside the landscape\'s name: a narrow gap, a town across the way round, a river with no cheap crossing, and more. This week\'s landscape is always one of the particular kinds, and stays the same all week. Blind mode hides every score until the connection is finished, so the route has to be read off the land alone.'
    ],

    // How each cell is described to a screen reader. The {braces} are filled
    // in by the game, so keep them exactly as they are.
    cellPosition: 'Column {col}, row {row}.',
    cellTerrain: '{terrain}. Cost {cost}, environment {env}, community {comm}.',
    cellRouted: 'Span {n} of the route, {piece}, carried on {tech}.',
    cellAvailable: 'This is where the line goes next.',
    cellExits: 'It can leave towards the {sides}.',
    cellIsStart: 'Generation site, where the route begins.',
    cellIsEnd: 'Demand centre, where the route must finish.',
    cellIsHead: 'End of the route so far.',

    /* Spoken and shown in the tooltip when the square under the pointer is
       the one the next span goes on: where the three dials land if it is
       built on the technology currently chosen. The meters show the same
       thing as a ghost marker, which a screen reader cannot see. */
    tipPreview: 'Building here on {tech}: cost {cost}, environment {env}, community {comm}.',

    // The three meters.
    meterReading: '{label}: {value} out of 100, {band}.',
    meterSpend: '{spent} of {budget} spent',

    committedLabel: 'Committed mode',
    committedHint: 'Spans cannot be taken down once they are up, the way they cannot on site.',

    boardLabel: 'Route map, {cols} columns by {rows} rows',

    /* The best finish still open, under the meters. {weakest} is the best
       weakest dial a route onward from here can reach; {verdict} is the
       title of the verdict that route would earn. Say "found", never
       "possible" - see the note at the top of js/foresight.js. */
    forecastHeading: 'Best finish still open',
    /* Kept to one line in the rail: this is the line shown most of the
       time, and the rail is full. {verdict} is available here too. */
    forecastOnCourse: 'Consent still within reach',
    forecastAtBest: 'At best now: {verdict}',
    forecastBelowFloor: 'Every way on found from here leaves a dial below {floor}.',
    forecastBlocked: 'No way on to the demand centre found from here without doubling back.',
    forecastDone: 'Finished: {verdict}',
    forecastHint: 'The best weakest dial any route onward from here can still reach. It never says which way to go - only how much is still on the table.',
    forecastSpoken: 'Best finish still open: {weakest}. {line}',

    /* Said in the status line when a span costs something that cannot be
       got back. {drop} is how many points came off the best finish. */
    moodSlipped: '{n} spans built. That one cost {drop} off the best finish still open.',
    moodLost: 'That span put a route that gets consent out of reach. Undo it to win the chance back.',
    moodLostCommitted: 'That span put a route that gets consent out of reach, and in Committed mode it stays down.',
    moodBlocked: 'That span leaves no way on to the demand centre without doubling back. Undo it.',
    moodBlockedCommitted: 'That span leaves no way on to the demand centre without doubling back.',
    // On the tooltip and the screen reader label of a span already built.
    routeMoodSlipped: 'This span cost {drop} off the best finish.',
    routeMoodLost: 'This span put a route that gets consent out of reach.',

    /* "Explain last span" - the button under the forecast, and the E key. */
    // The button is short to share a line with the forecast; the label says it in full.
    explainButton: 'Explain',
    explainButtonLabel: 'Explain last span (E)',
    explainNothing: 'Nothing is built yet, so there is no span to explain.',
    explainSpan: 'Span {n}: {terrain} on {tech}. It added cost {cost}, environment {env}, community {comm}.',
    explainMoved: 'That took {changes}.',
    explainChange: '{dial} from {from} to {to}',
    explainStill: 'None of the dials moved.',
    /* The direction matters as much as the ground: a cheap span pointed
       into designated land commits the NEXT span to it, and that is often
       where the points really went. */
    explainHeading: 'It sends the line to the {side}, into {terrain}.',
    explainKept: 'The best finish still open held at {after}.',
    explainDropped: 'The best finish still open fell from {before} to {after}.',
    explainLost: 'The best finish still open fell from {before} to {after}, which puts a route that gets consent out of reach.',
    explainGone: 'After it, no way on was found that keeps every dial above {floor}.',
    explainBlocked: 'After it, no way on to the demand centre was found without doubling back.',

    /* Holding Shift and pressing an arrow key on the highlighted square
       looks down that way without building anything. */
    previewExit: 'To the {side}: {terrain}, {cost} / {env} / {comm} a span on {tech}. Press the arrow without Shift to send the line there.',
    previewFinish: 'To the {side} is the way into the demand centre. Press the arrow without Shift to finish.',
    previewOffMap: 'To the {side} is the edge of the map. The line would have nowhere to go.',
    previewWater: 'To the {side} is open water. The line would be stuck there.',
    previewUsed: 'To the {side} the route already runs, and the line cannot cross itself.',
    previewBanned: 'To the {side}: {terrain}, where {tech} cannot be used. Change technology before building there.',

    // On an arrow that leads somewhere the line would be stuck.
    chevronTrapLabel: 'Send the line to the {side}, into {what}. It would be stuck there.',
    trapOffMap: 'the edge of the map',
    trapWater: 'open water',
    trapUsed: 'its own route',

    /* The technology buttons, when there is a highlighted square: what one
       span costs there on each. */
    // One line on purpose: the rail is full. The ground is named on each button's label.
    techHintOn: 'Per span here: cost / env / community.',
    techEffect: '{cost} / {env} / {comm}',
    techBanned: 'Not here',
    techEffectSpoken: '{tech}. One span on {terrain}: cost {cost}, environment {env}, community {comm}.',
    techBannedSpoken: '{tech} cannot be used on {terrain}.',

    // The tooltip's table of what the square costs on each technology.
    tipTechBanned: 'not allowed',

    // The legend's line on what technology does to its numbers.
    legendTech: '{tech}: {cost}x cost, {impact}x impact',
    legendTechBans: 'not on {terrain}',
    legendTechFixed: 'Connection funding is the same sum on every technology.',

    /* The "Why?" note on a meter that has dropped. */
    meterWhy: 'Why?',
    meterWhyLabel: 'Why is {dial} at {value}?',
    meterWhyHeading: '{dial} {value}, {band}',
    meterWhyNone: 'Nothing on the route has moved this dial yet.',
    meterWhyItem: '{terrain} x{count} on {tech}: {points}',
    meterWhyMore: 'And {n} more, smaller.',

    /* The quick tour. Opens by itself when the game is opened without a
       landscape named in the address, and from the Tour button any time.
       'at' says what each step points to: target, tech, meters, forecast,
       or end. Nothing is stored - see README "Coming back to a landscape". */
    tourButton: 'Tour',
    tourNext: 'Next',
    tourBack: 'Back',
    tourDone: 'Start playing',
    tourSkip: 'Skip the tour',
    tourCount: '{n} of {total}',
    tour: [
      {
        at: 'target',
        title: 'Where the line goes next',
        body: 'The pulsing square is the only place the next span can go. Click an arrow on it to send the line that way, click the square itself to carry straight on, or drag across the map. From the keyboard, press an arrow key on it.'
      },
      {
        at: 'tech',
        title: 'Choose what to build',
        body: 'Pick a technology before each span, or press 1, 2 or 3. Each button shows what one span on the highlighted square costs on it: cost / environment / community.'
      },
      {
        at: 'meters',
        title: 'The three dials',
        body: 'Cost, environment and community, each out of 100. The dashed mark shows where a dial lands if you build the highlighted square. When a dial drops, Why? shows where its points went.'
      },
      {
        at: 'forecast',
        title: 'The best finish still open',
        body: 'The best score a route from here can still reach. It never says which way to go, but the moment a span puts a winning route out of reach, the game tells you. Explain last span, or the E key, says what the last span did.'
      },
      {
        at: 'end',
        title: 'Where to finish',
        body: 'Arrive at the demand centre from the left, having passed through a substation on the way. Hover over any square to see what crossing it costs, or hold Shift and press an arrow key to look before you build.'
      }
    ]
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
