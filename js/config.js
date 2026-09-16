/* =========================================================================
   Connecting the Grid - CONFIG
   =========================================================================

   THIS IS THE ONLY FILE YOU NEED TO EDIT TO REBALANCE THE GAME.

   Everything tunable lives here: the map generator, the cost/impact numbers,
   what each technology does on each ground, the scoring budgets and every
   word of on-screen text. No other file contains a magic number or a
   hard-coded string.

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
     power station off the left edge. */
  start: { col: 0, row: 4, entry: 'w' },

  /* Where it must end: the grid supply point, on the right edge. 'exit' is the
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

       cost         how much money one cell of this land costs to cross on
                    lattice pylons, the standard overhead line
       envImpact    environmental harm on lattice pylons, always zero or
                    negative
       commImpact   community effect on lattice pylons, negative = harm,
                    positive = benefit
       techs        the same three numbers for the other technologies, as
                    { cost, env, comm }. Written out per ground rather than
                    worked out from one multiplier, because what a
                    technology does depends on where it is built: a cable
                    trench is what a town wants and what a wood does not.
                    Leave out only a technology whose bansTerrain names this
                    ground. Every figure to one decimal place and env never
                    above zero - the balance search relies on both, and the
                    scoring self test checks them.
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
       description  the plain-English line on what the land is, shown when
                    the pointer rests on its row of the legend
       tip          one short line saying what this ground means for the
                    ROUTE - the penalty, the detour, the exception - shown
                    after "Explain last span". The description says what the
                    land is; this says why the player should care.
       brief        the tip cut down to ten words or so, for the land card
                    that appears over a square. It is read mid-move, on top
                    of the map, so it has to be taken in at a glance.
       pick         the technology the land card stars for this ground, by
                    id. Leave it out where no one technology is the answer,
                    or where every one does the same.
       pickBeside   the same for a square of this ground beside houses (see
                    BESIDE HOMES), where overhead spans cost extra community
                    support and the answer can change. Leave it out to keep
                    pick there too.
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
      tip: 'Lattice pylons. Nothing here needs sparing, so any other technology is money for nothing.',
      brief: 'The cheapest ground there is. Nothing here to spare.',
      pick: 'lattice',
      pickBeside: 'tpylon',
      techs: {
        tpylon: { cost: 1.4, env: 0, comm: 0 },
        cable:  { cost: 6,   env: 0, comm: 0 }
      }
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
      description: 'A public road. Stringing a line over live traffic means scaffold guarding, closures and disruption.',
      tip: 'Lattice pylons. What upsets people is the road works, not the pylons, and a cable trench closes the road for longer.',
      brief: 'Road works upset people. Burying makes it worse.',
      pick: 'lattice',
      pickBeside: 'tpylon',
      /* The objection is the closure, so a quieter pylon earns nothing, and
         digging the road up to bury the line makes it worse. */
      techs: {
        tpylon: { cost: 4.2, env: 0, comm: -2 },
        cable:  { cost: 18,  env: 0, comm: -3 }
      }
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
      description: 'Hard rock. Pylon foundations and cable trenches need blasting and piling, which costs time and money.',
      tip: 'Lattice pylons. A pylon needs a few blasted foundations; a cable needs a trench blasted the whole way, at ten times the price.',
      brief: 'A trench through rock costs ten times what pylons do.',
      pick: 'lattice',
      pickBeside: 'tpylon',
      /* A T-pylon's single foundation disturbs a little less rock. A cable
         trench is blasted end to end: far dearer, and more harm, not less. */
      techs: {
        tpylon: { cost: 5.6, env: -0.7, comm: 0 },
        cable:  { cost: 40,  env: -2,   comm: 0 }
      }
    },
    hilly: {
      id: 'hilly',
      label: 'Hills',
      cost: 3,
      envImpact: 0,
      commImpact: -1,
      passable: true,
      icon: 'img/hilly.svg',
      texture: 'scatter',
      density: 0.7,
      description: 'Steep, high ground. Access tracks for plant and cranes are awkward to build, and a pylon on the skyline is seen for miles.',
      tip: 'T-pylons if local support is tight: a third shorter, they barely break the skyline. A trench up the slopes is very dear and leaves a scar that washes out.',
      // No pick: lattice or T-pylon depends on how much support is left.
      brief: 'Pylons are seen for miles. T-pylons if support is tight.',
      pickBeside: 'tpylon',
      /* What people object to on hills is the view, which is what T-pylons
         were designed for. Trenching a steep slope costs a great deal and
         invites erosion. */
      techs: {
        tpylon: { cost: 4.2, env: 0,  comm: -0.3 },
        cable:  { cost: 30,  env: -1, comm: 0 }
      }
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
      description: 'Established trees. An overhead line through here means felling, and a corridor kept clear of trees for as long as the line stands.',
      tip: 'Lattice pylons, or better, go round. Burying does not save the trees: the trench needs a felled strip that is never replanted.',
      brief: 'Every technology fells trees. Go round if you can.',
      pick: 'lattice',
      pickBeside: 'tpylon',
      /* The harm is the felling, and every technology fells. A T-pylon holds
         the wires nearer the canopy, so its corridor is no narrower; a cable
         needs a construction swathe cleared and a strip kept free of roots
         for good, which is only a little narrower. */
      techs: {
        tpylon: { cost: 4.2, env: -3,   comm: 0 },
        cable:  { cost: 18,  env: -2.4, comm: 0 }
      }
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
      description: 'A watercourse. An overhead line crosses it on a long span between taller pylons. Underground cable cannot be laid through it.',
      tip: 'Lattice pylons. Every route crosses once, and the long span needs tall towers whatever carries the rest of the line. Cable cannot go through.',
      brief: 'Every route crosses once, on tall towers. No cable.',
      pick: 'lattice',
      pickBeside: 'tpylon',
      // The crossing towers are special either way, so a T-pylon spares nothing.
      techs: {
        tpylon: { cost: 7, env: -2, comm: 0 }
      }
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
      description: 'Protected habitat, such as a Site of Special Scientific Interest. Building here does serious and hard-to-reverse ecological damage.',
      tip: 'Go round if you possibly can. If not, T-pylons: their single foundation takes the least habitat. A cable trench digs the habitat up.',
      brief: 'Go round. If you must cross, T-pylons harm least.',
      pick: 'tpylon',
      /* The one place the T-pylon is the answer: its small footprint is what
         matters here. A trench through protected habitat is no better than
         pylons over it, at six times the price. */
      techs: {
        tpylon: { cost: 5.6, env: -5.6, comm: 0 },
        cable:  { cost: 24,  env: -8,   comm: 0 }
      }
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
      tip: 'Underground cable only: no pylon, lattice or T, may stand over homes. Go round the town, or bury the line under its streets.',
      brief: 'No pylons over homes. Go round, or bury the line.',
      pick: 'cable',
      /* Pylons are not allowed here at all - see bansTerrain on lattice and
         T-pylons - so the cost, envImpact and commImpact above describe a
         line that cannot be built, and are never scored. A penalty would not
         do instead: the verdict follows the weakest meter, and a route
         with community support to spare would still take pylons over
         houses whenever that was cheaper. Under the streets the cable costs
         street works and a little disruption: twice what pylons would, where
         open country costs six times, because a town's streets are dug up
         for services anyway. Any dearer and a town across the way round
         leaves no balanced route at all - measured with archetypes.js. */
      techs: {
        cable: { cost: 4, env: 0, comm: -1 }
      }
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
      description: 'A generator or large user in the connection queue. Route through it and they get connected.',
      tip: 'Gives community support back whatever carries the line, so lattice pylons. Worth a small detour.',
      brief: 'Wins support on any technology. Worth a detour.',
      pick: 'lattice',
      pickBeside: 'tpylon',
      // A customer is connected just the same by any technology.
      techs: {
        tpylon: { cost: 2.8, env: 0, comm: 6 },
        cable:  { cost: 12,  env: 0, comm: 6 }
      }
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
      tip: 'Free to cross and welcomed locally, whatever carries the line. Worth a small detour.',
      /* No pick: every technology is the same here. Beside houses the cable
         costs no more and draws no objection. */
      brief: 'Free, and welcomed locally. Worth a detour.',
      pickBeside: 'cable',
      techs: {
        tpylon: { cost: 0, env: 0, comm: 4 },
        cable:  { cost: 0, env: 0, comm: 4 }
      }
    },
    grant: {
      id: 'grant',
      label: 'Connection funding',
      /* The only ground on the map that GIVES cost back. The same -4 on
         every technology: a grant is a sum agreed in advance and does not
         grow because the scheme chose a dearer one. */
      cost: -4,
      envImpact: 0,
      commImpact: 0,
      passable: true,
      icon: 'img/grant.svg',
      texture: 'plain',
      description: 'A funded connection point. Routing through it brings money to the scheme, but it is nowhere near the direct line.',
      tip: 'Pays cost back, and the same sum whichever technology crosses it.',
      // As for community benefit: no pick, and cable beside houses.
      brief: 'Pays money back, whatever crosses it.',
      pickBeside: 'cable',
      techs: {
        tpylon: { cost: -4, env: 0, comm: 0 },
        cable:  { cost: -4, env: 0, comm: 0 }
      }
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
      description: 'Switchgear and transformers, where lines join the network and the voltage steps up or down. The connection must pass through one to be energised.',
      tip: 'The line must pass through one, on lattice pylons: the switchgear does the same harm whatever arrives. Pick the one that suits the rest of your route.',
      brief: 'The line must pass through one. Pick one that suits.',
      pick: 'lattice',
      pickBeside: 'tpylon',
      // The harm is the substation's own, so no technology spares any of it.
      techs: {
        tpylon: { cost: 8.4, env: -1, comm: 0 },
        cable:  { cost: 36,  env: -1, comm: 0 }
      }
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
      tip: 'The line has to go round, so a lake near the direct line means a detour.',
      brief: 'The line cannot cross. It has to go round.'
    }
  },


  /* -----------------------------------------------------------------------
     TECHNOLOGIES
     The choice made before laying each segment. What each one costs and
     spares is not here: it depends on the ground, so it lives with each
     entry in CELL TYPES, under techs. Lattice is the standard those
     entries are written against.

       standard     true on exactly one technology: the one a ground's own
                    cost, envImpact and commImpact describe
       bansTerrain  cell type ids this technology can never be used on
       summary      where this technology is the right answer, in a few
                    words - shown in the legend and read out on its button
     --------------------------------------------------------------------- */
  technologies: [
    {
      id: 'lattice',
      label: 'Lattice pylons',
      short: 'Lattice',
      standard: true,
      bansTerrain: ['settlement'],
      summary: 'the cheapest, and the right answer on most ground',
      description: 'Overhead line on conventional steel lattice pylons. Cheapest to build, and the tallest and most visible. Not allowed over homes.'
    },
    {
      id: 'tpylon',
      label: 'T-pylons',
      short: 'T-pylon',
      bansTerrain: ['settlement'],
      summary: 'shorter and slimmer, for squares beside houses, hills and designated land',
      description: 'Overhead line on T-pylons: a single shaft about a third shorter than a lattice pylon, with a smaller footprint. Costs more; worth it on high ground, where a lattice pylon is seen for miles, and on designated land you cannot go round. Not allowed over homes.'
    },
    {
      id: 'cable',
      label: 'Underground cable',
      short: 'Cable',
      bansTerrain: ['river'],
      summary: 'the only way through houses, and a harmful trench anywhere else',
      description: 'The line goes underground, out of sight. The only way through a town. Anywhere else it is very expensive, and the trench does its own harm to woods, habitat, hills and rock. It cannot be laid through a river.'
    }
  ],

  // Which technology is selected when the game starts or is reset.
  defaultTechnology: 'lattice',


  /* -----------------------------------------------------------------------
     BESIDE HOMES
     Pylons may not stand over houses, but a line on the square next door is
     still in people's view from their windows. A span on any square that
     shares an edge with houses costs this much community support on top of
     whatever its own ground costs - and how much depends on how much of
     the line people can see, which is the whole case for T-pylons.

       homes   cell type ids that count as houses
       comm    the extra community figure, per technology id. Whole tenths,
               like every figure in CELL TYPES; a technology left out adds
               nothing
     --------------------------------------------------------------------- */
  besideHomes: {
    homes: ['settlement'],
    comm: { lattice: -3, tpylon: -1, cable: 0 }
  },


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

        0        the power station
        1 - 2    the road, running the full height of the map
        3 - 6    the designated land, a wavy band two to three cells thick
                 sitting somewhere inside them
        7 - 9    the river, running the full height of the map
        9 - 10   the town, and the grid supply point

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
      hint: 'The town stands across the way round, and nobody has offered land. Pass it on T-pylons, bury the line under its streets, or cross the habitat.',
      weekly: true,
      /* No pylons may stand over houses, so the town is passed beside, where
         pylons cost support, or under, where cable costs money. Benefit land
         on the way round would pay all of that back, which is why there is
         none here: without it the town's objection is still felt at the end. */
      generator: {
        town: { side: 'gap', cells: 5 },
        rewards: { benefit: 0, customers: 1, grants: 2 }
      },
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
      // Rarely accepted - about one in five - so given the long way round's rerolls.
      maxTries: 60,
      generator: {
        town: { side: 'gap', cells: 5 },
        river: { banks: 1 },
        rewards: { benefit: 0, customers: 1, grants: 2 }
      },
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
      whyHint: 'Underground cable costs four to ten times what lattice pylons do - least under a town, most through rock - and every extra span adds up. Connection funding gives some back.'
    },
    {
      id: 'env',
      label: 'Environment',
      goodDirection: 'A high score means little harm to habitats and landscape.',
      lowLabel: 'Serious harm',
      highLabel: 'Well protected',
      whyHint: 'Designated land does the most harm, then woodland: go round them. On designated land T-pylons cut the harm by nearly a third. Burying spares nothing, because the trench does its own damage.'
    },
    {
      id: 'comm',
      label: 'Community',
      goodDirection: 'A high score means the route is welcome locally.',
      lowLabel: 'Strong objection',
      highLabel: 'Well supported',
      whyHint: 'Houses and roads cost support; customers and benefit land give it back, whatever carries the line. Through houses, bury the line: underground cable takes almost all the objection away.'
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
     Shown when the route reaches the grid supply point. The dial with the
     LOWEST score decides which verdict appears. 'balanced' is used when
     every dial finishes at or above balancedThreshold.
     --------------------------------------------------------------------- */
  balancedThreshold: 70,

  verdicts: {
    balanced: {
      title: 'A route that will get consent',
      body: 'This is the sort of scheme that gets through a development consent examination without a fight. ' +
            'You have kept the spend proportionate, stayed out of the designated land, and not ' +
            'put an overhead line over anybody\'s roof. Nothing here is free, but every trade-off you made ' +
            'is one you could defend at an examination hearing. Good work.'
    },
    cost: {
      title: 'Sound engineering, unaffordable scheme',
      body: 'Environmentally and socially this route is hard to argue with. The problem is the ' +
            'bill. Undergrounding and long detours are the two most reliable ways to spend money ' +
            'on a transmission connection, and this route uses both. Every pound of it ends up on ' +
            'consumers\' energy bills. A scheme that cannot justify its cost does not get built, ' +
            'and a connection that does not get built helps nobody.'
    },
    env: {
      title: 'This will not survive an Environmental Impact Assessment',
      body: 'You have taken the direct line, and the direct line goes straight through protected ' +
            'habitat. Designated land is not a matter of negotiation. The Environmental Impact ' +
            'Assessment on this route would sink it at examination, and the years lost to the argument would cost more than routing around ' +
            'it ever would have. Go back and treat the designated land as a wall, not a shortcut.'
    },
    comm: {
      title: 'Technically fine, politically finished',
      body: 'On paper this is a competent route. In practice you have run an overhead line past ' +
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
    strapline: 'Route a new transmission connection from the power station to the grid supply point.',

    startLabel: 'Power station',
    endLabel: 'Grid supply point',

    // The top bar
    newMapButton: 'New landscape',
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

    techHeading: 'Overhead line or cable',
    techHint: 'Change it as often as you like. It applies to the next span you build, not to the ones already up.',

    dialsHeading: 'Points',

    statusReady: 'Click an arrow to send the first span out of the power station.',
    statusRouting: '{n} spans built. Keep going east to the grid supply point.',
    statusComplete: 'Connection energised.',
    statusStuck: 'The line has nowhere left to go. Undo the last span, or start again.',
    statusNotEnergised: 'You have reached the grid supply point, but the route does not pass through a substation. Undo and route through one.',
    statusWrongEndPiece: 'You have reached the grid supply point, but the line runs past it rather than into it. It has to arrive from the {side}.',

    errWrongSquare: 'The line cannot jump. Carry on from the highlighted square.',
    // The same, once there is a line to go back along and Undo is allowed.
    errWrongSquareTakeBack: 'The line cannot jump. Carry on from the highlighted square, or click a square on the line to go back to it.',
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

    // Read out for the four compass directions, in the messages above.
    sides: { n: 'top', e: 'right', s: 'bottom', w: 'left' },

    /* The How to play sheet: a picture for every idea, and a sentence or
       two under it. The picture shows how the thing works; the words name
       it. The pictures are hidden from screen readers, so every card has to
       make sense with its picture taken away.

       'picture' names the drawing in js/howtoart.js, and 'wide' lets a card
       take the whole width of the sheet. {threshold} is balancedThreshold.
       Everything else a picture shows - the land, the numbers, the verdicts,
       the labels on the buttons - comes from the rest of this file, so it
       cannot drift from the game. */
    instructionsHeading: 'How to play',
    howTo: {
      sections: [
        {
          title: 'The goal',
          cards: [
            {
              picture: 'goal', wide: true,
              title: 'Connect the power station to the grid',
              body: 'Build a line from the power station on the left to the grid supply point on the right, where the transmission network hands power to the local distribution network. It must pass through a substation on the way, and arrive at the grid supply point rather than run past it.'
            }
          ]
        },
        {
          title: 'Building the line',
          cards: [
            {
              picture: 'step',
              title: 'One square in play',
              body: 'The line can only leave the square it has reached, so only the highlighted square is in play. Click an arrow on it to send the line that way.'
            },
            {
              picture: 'drag',
              title: 'Carry on, or drag',
              body: 'Click the highlighted square itself to carry straight on, or hold the mouse down and drag to draw a whole run in one go.'
            },
            {
              picture: 'back',
              title: 'Change your mind',
              body: 'Click any square already on the line to take the line back to it, and choose again from there. Dragging back over the line rubs it out.'
            },
            {
              picture: 'trap',
              title: 'Dead ends are marked',
              body: 'An arrow into water, off the map or back into the line is dashed in red: the line would be stuck there. Hover over an arrow to see where it leads.'
            }
          ]
        },
        {
          title: 'Choosing what to build',
          cards: [
            {
              picture: 'techs', wide: true,
              title: 'Overhead line or underground cable',
              body: 'Choose before each span, the way a planner would. Lattice pylons are cheapest and right on most ground. T-pylons cost more but are shorter and slimmer: worth it on hills, beside houses, and on designated land you cannot go round. Underground cable is the only way through houses; anywhere else it is very expensive, the trench does its own harm, and it cannot be laid through a river.'
            },
            {
              picture: 'land', wide: true,
              title: 'Every square has a price',
              body: 'Each span pays for the ground it is built on, in cost, environment and community, and an overhead span beside houses costs community support as well. Hover over any square on the map to see what it costs on each technology. Connection funding pays you back, but it is never near the direct line.'
            }
          ]
        },
        {
          title: 'Reading the score',
          cards: [
            {
              picture: 'preview',
              title: 'See it before you build',
              body: 'The dashed mark in each meter shows where that dial lands if you build the highlighted square. Change technology and watch the marks move: that is the trade-off, before you have paid for it.'
            },
            {
              picture: 'verdict',
              title: 'The weakest dial decides',
              body: 'Cost, environment and community each start at 100. Arrive with all three at {threshold} or more and the route gets consent; otherwise the verdict is about the lowest.'
            },
            {
              picture: 'forecast',
              title: 'Best finish still open',
              body: 'The best score any route from here can still reach. It never says which way to go, but a span that costs points you cannot get back is tinted on the map.'
            },
            {
              picture: 'why',
              title: 'Ask why',
              body: 'Why? beside a meter lists where its points went. Explain, or the E key, says what the last span did.'
            }
          ]
        },
        {
          /* Keys rather than cards. The caps are drawn for the eye; a screen
             reader hears 'spoken' instead of each cap in turn. */
          title: 'From the keyboard',
          keys: [
            { keys: ['←', '↑', '→', '↓'], spoken: 'Arrow keys', does: 'Move around the map. On the highlighted square, send the line that way.' },
            { keys: ['Shift', '+', '→'], spoken: 'Shift with an arrow key', does: 'Look that way first, without building.' },
            { keys: ['1', '2', '3'], spoken: '1, 2 or 3', does: 'Change technology: lattice pylons, T-pylons or underground cable.' },
            { keys: ['E'], spoken: 'E', does: 'Explain the last span.' },
            { keys: ['Enter'], spoken: 'Enter', does: 'On a square of the line, take the line back to it.' }
          ]
        },
        {
          title: 'Landscapes',
          cards: [
            {
              picture: 'best', wide: true,
              title: 'A route that gets consent always exists',
              body: 'Every landscape is generated and checked before you see it. When you finish, the verdict says what the best route found here scores, and can draw it on the map.'
            },
            {
              picture: 'kinds',
              title: 'Every landscape has a name and a kind',
              body: 'New landscape rolls another one. Its kind is named beside its name: a narrow gap, a town across the way round, a river with no cheap crossing, and more. Type a name to play that landscape again.'
            },
            {
              picture: 'modes',
              title: 'Two ways to make it harder',
              body: 'Committed mode keeps every span up once it is built. Blind mode hides every score until the connection is finished, so the route has to be read off the land alone.'
            }
          ]
        }
      ],

      /* Where each technology is the right answer, drawn as ground with a
         tick on it. Cell type ids, and 'besideHomes' for any square next to
         houses. Where a technology may NOT go is not listed here: that is a
         rule, and the picture reads it from bansTerrain. */
      suits: {
        lattice: ['farmland', 'road', 'woodland', 'river'],
        tpylon: ['hilly', 'sssi', 'besideHomes'],
        cable: ['settlement']
      },

      // Words drawn inside the pictures.
      labels: {
        nextSpan: 'Next span: {terrain}',
        landKey: 'One span on {tech}: cost / environment / community',
        onlyTech: '{tech} only',
        cannotCross: 'Cannot be crossed',
        besideHomes: 'Beside houses',
        yourRoute: 'Your route',
        bestRoute: 'Best route found',
        or: 'or'
      }
    },

    // How each cell is described to a screen reader. The {braces} are filled
    // in by the game, so keep them exactly as they are.
    cellPosition: 'Column {col}, row {row}.',
    cellTerrain: '{terrain}. Cost {cost}, environment {env}, community {comm}.',
    cellRouted: 'Span {n} of the route, {piece}: {tech}.',
    cellAvailable: 'This is where the line goes next.',
    cellExits: 'It can leave towards the {sides}.',
    cellIsStart: 'Power station, where the route begins.',
    cellIsEnd: 'Grid supply point, where the route must finish.',
    cellIsHead: 'End of the route so far.',
    cellTakeBack: 'Press to take the line back to this square and choose again from here.',

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
    forecastBlocked: 'No way on to the grid supply point found from here without doubling back.',
    forecastDone: 'Finished: {verdict}',
    forecastHint: 'The best weakest dial any route onward from here can still reach. It never says which way to go - only how much is still on the table.',
    forecastSpoken: 'Best finish still open: {weakest}. {line}',

    /* Said in the status line when a span costs something that cannot be
       got back. {drop} is how many points came off the best finish. */
    moodSlipped: '{n} spans built. That one cost {drop} off the best finish still open.',
    moodLost: 'That span put a route that gets consent out of reach. Undo it to win the chance back.',
    moodLostCommitted: 'That span put a route that gets consent out of reach, and in Committed mode it stays down.',
    moodBlocked: 'That span leaves no way on to the grid supply point without doubling back. Undo it.',
    moodBlockedCommitted: 'That span leaves no way on to the grid supply point without doubling back.',
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
    explainBlocked: 'After it, no way on to the grid supply point was found without doubling back.',

    /* Holding Shift and pressing an arrow key on the highlighted square
       looks down that way without building anything. */
    previewExit: 'To the {side}: {terrain}, {cost} / {env} / {comm} a span on {tech}. Press the arrow without Shift to send the line there.',
    previewFinish: 'To the {side} is the way into the grid supply point. Press the arrow without Shift to finish.',
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

    // The land card's table of what the square costs on each technology.
    tipTechBanned: 'not allowed',

    /* A square that shares an edge with houses - see besideHomes. The label
       names it wherever spans are listed by ground; the note says why the
       figures there are not the ground's usual ones. The note sits on the
       land card over the map, whose table already shows by how much, so
       it only says why. */
    besideHomesLabel: '{terrain} beside houses',
    besideHomesNote: 'Beside houses: pylons here are in people\'s view.',

    // The legend's line on what technology does to its numbers.
    legendTech: '{tech}: {summary}',
    legendTechBans: 'never on {terrain}',
    legendTechWhere: 'The figures above are on lattice, or on cable where pylons are not allowed. On a square beside houses, pylons also cost community support. Hover any square for all three.',

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

    /* On a big screen: the full-screen button in the top bar, and the
       countdown kiosk mode shows before it puts up a fresh landscape. See
       js/bigscreen.js. {n} is the seconds left. */
    fullscreenEnter: 'Full screen',
    fullscreenLeave: 'Leave full screen',
    kioskIdleNotice: 'Still playing? A fresh landscape in {n} s. Touch anything to carry on.',
    kioskIdleSpoken: 'Nobody has played for a while. A fresh landscape starts in {n} seconds unless something is pressed.',

    tour: [
      {
        at: 'target',
        title: 'Where the line goes next',
        body: 'The pulsing square is the only place the next span can go. Click an arrow on it to send the line that way, click the square itself to carry straight on, or drag across the map. From the keyboard, press an arrow key on it.'
      },
      {
        at: 'tech',
        title: 'Choose what to build',
        body: 'Pick lattice pylons, T-pylons or underground cable before each span, or press 1, 2 or 3. Lattice suits most ground, T-pylons designated land, cable houses. Each button shows what one span on the highlighted square costs on it: cost / environment / community.'
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
        body: 'Arrive at the grid supply point from the left, having passed through a substation on the way. Hover over any square to see what crossing it costs, or hold Shift and press an arrow key to look before you build.'
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
     KIOSK MODE
     For a screen at a show, and only when the address carries ?kiosk. The
     game growing to fit a big screen needs no setting: see
     css/bigscreen.css. How these are used is in js/bigscreen.js.
     --------------------------------------------------------------------- */
  kiosk: {
    /* With anything left behind - a route started, a dialog or the tour
       open, a switch changed - this long without a touch, a key or the
       mouse moving puts a fresh landscape up for the next visitor. */
    idleResetSeconds: 120,
    // The last part of that wait, counted down on screen.
    idleWarningSeconds: 15,
    // The mouse pointer hides after this long without moving.
    pointerHideSeconds: 3
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
