# Connecting the Grid

A browser game about routing a new electricity transmission connection across
a map, and living with what it costs in money, environment and community
support.

The player draws a line from the **power station** on the left edge to the
**grid supply point** on the right, choosing lattice pylons, T-pylons or
underground cable for each span. Three
dials react to every span built. When the line is energised, the weakest dial
decides the verdict.

Every landscape is generated from a seed and checked before it is shown, so no
two games are the same puzzle and every one of them can be won.

No build step, no dependencies, no server. Open `index.html` and play.

## Running it

```
open index.html          # macOS
start index.html         # Windows
```

Straight off the disk over `file://` is a supported way to run this. The
scripts are plain classic scripts rather than ES modules for exactly that
reason — module scripts are blocked by CORS on `file://`.

**On Windows, double-click `Play Connecting the Grid.exe`**, which opens the
game in the default browser. Players' instructions are in
[How to play.txt](How%20to%20play.txt); what the program does, how to share it
past the Windows warning and how to rebuild it are in
[launcher/README.md](launcher/README.md).

### On a big screen at a show

Above 1280×720 the whole game grows with the screen, so a 1080p television
shows the laptop layout half as big again and a 4K one three times as big.
There is nothing to switch on for that. For a stand, turn on kiosk mode:

1. With the game open, click the browser's address bar, replace everything
   after `index.html` with `?kiosk`, and press Enter. The address keeps
   `?kiosk` through new landscapes and reloads; if it is gone, so is kiosk
   mode.
2. Press **Full screen** at the right of the top bar (or F11) to hide the
   browser's tabs and address bar.

In kiosk mode a mouse pointer left still hides after 3 seconds. When a visitor
walks away leaving a route started, a dialog or the tour open, or a switch
changed, a fresh landscape goes up after 2 minutes with nobody touching
anything. The last 15 seconds are counted down on screen, and any touch, key
or mouse movement cancels it. An untouched landscape is left alone. The
timings are in `CONFIG.kiosk`.

## Running the tests

The scoring engine, the generator and the balance search are all pure maths
with no DOM access, so Node can load them directly:

```
node -e "require('./js/score.js').selfTest()"   # scoring, on a fixed test map
node js/mapgen.js --self-test                   # generated maps are well formed
node js/balance.js --seeds 500                  # are they worth playing?
node js/balance.js SEED                         # one map, in detail
node js/archetypes.js --self-test               # kinds of landscape; add --calendar
                                                # to walk every day and week of 2026
node js/archetypes.js --seeds 300               # how often each kind is accepted
node js/summary.js                              # the route summary
node js/foresight.js --self-test                # the best finish still open agrees
                                                # with par, and never rises
node js/advice.js --self-test                   # the explanations
```

The last two are the interesting ones. `--seeds` sweeps the seed space and
reports what share of generated maps pass the balance checks and why the rest
were thrown away, so the generator can be tuned against evidence rather than
against a hunch. At the settings in [js/config.js](js/config.js) it accepts
about three maps in four.

To run the scoring suite in the browser console on load, set
`debug.runSelfTestOnLoad` to `true` in [js/config.js](js/config.js), or call
`Score.selfTest()` from the console.

## How the game works

**The route.** Every piece fills one square and has exactly two open ends. The
chain therefore has exactly one loose end at any moment, and that loose end
determines both which square the next piece goes on and which side of it must
be open. There is never more than one legal target square.

That is why the player is never asked to choose a shape. A piece that fits has
to open on the side the line arrives from, so its *other* end is the direction
the line leaves in — which makes choosing the shape and choosing the direction
the same choice. Direction is the one a player can see on the map, so direction
is what the game asks for, and the piece is worked out from it. The six pieces
are still exactly what gets recorded and scored; they are just no longer what
gets asked about.

**Scoring.** For each laid segment with land type `t` and technology `k`,
cost, environment and community are read from a table in
[js/config.js](js/config.js): the ground's own `cost`, `envImpact` and
`commImpact` are the figures on lattice pylons, and its `techs` block gives
T-pylons and cable on that ground. A span on a square that shares an edge with
houses adds `besideHomes.comm` for its technology on top.

The totals sum across the route and map onto three 0–100 dials:

```
costDial = clamp(100 - (totalCost / COST_BUDGET) * 100, 0, 100)
envDial  = clamp(100 + (totalEnv  / ENV_FLOOR)   * 100, 0, 100)
commDial = clamp(100 + (totalComm / COMM_FLOOR)  * 100, 0, 100)
```

`totalEnv` is always zero or negative. `totalComm` can go positive, because
connection customers and community benefit land add to it — the clamp handles
that.

**Technologies.** There used to be one multiplier per technology, applied to
every ground alike, and it gave answers no planner would: burying a line
through a wood spared the trees, and a customer was worth less connected by
cable. The table is written out per ground instead, so that the sensible
choice in each place is also the one that scores:

| Where | Technology | Why |
|---|---|---|
| Farmland, roads, rocky ground, woodland, river, substations, customers | lattice | Nothing to spare, or every technology does the same harm: trees are felled either way, and a trench through rock or up a slope does more |
| Hills | T-pylons, if community support is tight | Lattice pylons are seen for miles on high ground |
| Designated land | go round; T-pylons if you must cross | Their single foundation takes the least habitat; a cable trench digs it up |
| Houses | cable, the only choice | Pylons may not stand over homes |
| Any square beside houses | T-pylons | Lattice there costs 3 community, a T-pylon 1, cable nothing |

The last row is `besideHomes` in the config. It is the one figure that depends
on where a square is rather than what it is, so each span records `beside`
when it is laid, the way it records its ground.

**Rules.** The route may not revisit a cell, may not cross open water, and must
pass through a substation to be energised. Underground cable cannot be taken
through a river, and neither kind of pylon can be put over houses. That second
ban is a rule rather than a heavy penalty on purpose: the verdict follows the
weakest dial, so a route with community support to spare took pylons over a
village whenever that was cheaper.

**Connection funding.** One kind of ground gives cost back rather than taking
it: a funded connection point, worth -4 on every technology — a grant is a sum
agreed in advance and does not grow because the scheme chose to bury the line.
The generator puts funding on the far side of the map from the
way round the designated land, so reaching it is always a detour and always a
question.

**Committed mode.** Off by default. Turned on, spans cannot be taken down once
they are up, the way they cannot on site — Undo goes, dragging back over the
line stops rubbing it out, clicking the line stops taking it back, and the only
way to change a route is to start again.

**Blind mode.** Off by default. Turned on, every reading of the score — the
meters and their preview markers, the forecast — is hidden until the
connection is energised, and then all of it comes back with the verdict. The
land and what each kind of ground costs stay visible: those are facts about
the map, and the route has to be read off them.

**The best finish still open.** Under the meters, after every span, the
balance search runs again — this time from the end of the line, with the
squares it already uses closed off — and reports the best weakest dial any
route onward can still reach, and the verdict that route would earn. On an
empty board that number is exactly the par figure. It never says *which way*:
drawn on the map it would be an answer key, which the game only offers once
the connection is finished.

What it does say is the moment something is lost. A span that takes a point
or more off the best finish is washed amber on the map with the loss on a
badge; one that puts the balanced verdict out of reach is washed red, marked
`!`, and the status line says so straight away. The pulsing ring on the square
in play takes the same colour. The threshold is `guidance.slipNotice` in
[js/config.js](js/config.js). See [js/foresight.js](js/foresight.js) for the
search and [js/advice.js](js/advice.js) for the words.

**The route so far.** One line under the meters: spans built and the fewest
still needed. Opened, it lists the ground crossed, the technology used, and
which dial would decide the verdict if the route finished now. Facts only —
what the route could still become is the forecast's job.

**Verdicts.** When the line reaches the grid supply point, the lowest dial picks
the verdict. If every dial finishes at or above `balancedThreshold` (70), the
player gets the balanced verdict instead. Two dials tied at the bottom are
broken apart in one place only, `Score.lowestDial` — cost, then environment,
then community, first one wins. The balance search uses the same function, and
it has to: it throws maps away on which dial punishes the cheapest route, so a
second opinion there would accept maps for reasons the player is never shown.

**Par.** The verdict also says what the best route the checker found on that
landscape scores, and **Show the best route found** draws it over the map.
Note the wording. The search is west-free and prunes routes that are already
hopeless, so it is a strong benchmark and not a proof of the optimum — a
westward detour to collect one more benefit cell is outside what it considers.
Nothing is drawn unless the traced route scores exactly what the search said,
so a corridor that does not add up is never shown at all.

## Playing

- **Mouse:** click one of the arrows on the highlighted square to send the line
  that way. Clicking the square itself carries straight on, which makes a long
  run one click per square. Holding the button down and dragging draws a run in
  one gesture, and dragging back over the line rubs it out.
- **Going back:** clicking any square already on the line takes the line back
  to that square — it and everything after it come down, and the square is in
  play again, so the wrong turn can be made the other way. The square itself
  comes down rather than staying as the new end because its span already fixes
  which way the line leaves it. Clicking the end of the line is the same as
  **Undo**. From the keyboard, move onto a square of the line and press Enter.
- **Keyboard:** arrow keys walk a cursor around the map. An arrow pressed while
  the cursor is on the highlighted square sends the line that way instead, so
  arrow-arrow-arrow draws a route at the speed a mouse does. It cannot trap
  you: the way the line came in is never a legal way out, so there is always at
  least one direction that still just moves the cursor. `1`, `2` and `3` pick a
  technology.
- **Either way:** hovering or focusing any square opens its land card: the
  land's icon and name, one short line on what it means for a route, and
  what a span there costs on each technology — the chosen one highlighted,
  the one that suits the square starred. Where the three dials would land
  is shown by the ghost markers inside the meter bars, on the highlighted
  square. That preview does not change with direction, because the span
  being paid for is the highlighted square's whichever way the line leaves;
  it changes with **technology**, which is the choice it exists to inform.
  Which way to go is answered on the arrows, which name the ground each one
  leads into.
- **Asking why:** **Explain** under the forecast, or the `E` key, says what
  the last span cost, which way it sent the line and onto what ground, how
  the dials moved, and what it did to the best finish still open. **Why?**
  beside any meter that has dropped lists where its points went, grouped by
  ground and technology. Holding `Shift` with an arrow key on the highlighted
  square looks that way without building — what the ground is and what a span
  on it costs on the chosen technology. An arrow into water, off the map or
  back into the line is drawn dashed: still allowed, and a dead end.
- **Technology, per square:** each technology button shows what one span on
  the highlighted square costs on it, as cost / environment / community, and
  the land card on every square lists the same for all three. The words for
  the card are `brief`, `pick` and `pickBeside` on each ground in
  [js/config.js](js/config.js); the ground's longer description shows when
  the pointer rests on its row of the legend.
- **The tour:** five short steps pointing at the square in play, the
  technology buttons, the meters, the forecast and the grid supply point. It opens
  by itself when the game is opened without a landscape in the address, and
  from **Tour** at any time.
- Every cell, meter and move is described for screen readers, and the status
  line is a polite live region so announcements are not cut off mid-sentence.
  The arrows are hidden from screen readers on purpose — the keyboard path
  above does the same job, and does it better.

## Coming back to a landscape

Every landscape is a short seed, and the seed is now in the address bar.

| | |
|---|---|
| `index.html?seed=9MA7JX` | that exact landscape, every time |
| `index.html?daily` | the same landscape as everybody else today |
| `index.html?weekly` | the same landscape as everybody else this week |

**Today's landscape** is worked out from the UTC date — not the local one,
which would hand two people in different time zones different landscapes and
call them both today's. Rerolling a rejected daily is deterministic too, so
two players do not merely start from the same seed, they walk the same path to
the same accepted map. There is no server and nothing is stored.

**This week's landscape** works the same way from the ISO week in UTC (weeks
start on Monday and belong to the year their Thursday falls in), and is always
one of the particular kinds of landscape below — never plain Open country.

Type a name into the box under the seed line to play any landscape by name,
and **Copy result** puts the finished dials on the clipboard as plain text.
If the browser refuses the clipboard — which it does on `file://`, because
that is not a secure context — the text appears on the page, selected, to be
copied by hand.

Nothing is written to storage. The address bar is the only thing this game
remembers — which is also how it decides whether to open the tour: a bare
`index.html` gets the tour, and any address naming a landscape goes straight
to the map. The seed is added to the address as soon as a landscape is in
play, so reloading does not bring the tour back; a bookmark to the bare page
will.

## Tuning the game

[js/config.js](js/config.js) is the only file you need to edit to rebalance
anything. It holds the generator settings, every cost and impact number, what
each technology does on each ground, the scoring budgets, the verdicts and every word of
on-screen text. No other file contains a magic number or a hard-coded string.

Maps are not written down any more. They are generated from a short seed — the
one in play is shown under the technology picker — and every candidate is
checked before it is shown. **New landscape** rolls another one.

```
F farmland    W woodland           C connection customer
R road        V river              B community benefit
K rocky       S designated land    X substation
H hills       T houses/industry    G connection funding
                                   ~ open water (blocked)
```

### What the generator lays down

The eleven columns are shared out to a plan, and that plan is the game:

```
 0        the power station
 1 - 2    the road, running the full height of the map
 3 - 6    the designated land, a wavy band two to three cells thick
 7 - 9    the river, running the full height of the map
 9 - 10   the town, and the grid supply point
```

Four properties are guaranteed rather than hoped for, and they are what make
each map a puzzle rather than a stroll:

- **The river and the road each span the map top to bottom**, so *every* route
  crosses each of them exactly once, and no route can use cable on the river.
  Where either steps sideways it is two cells wide, so crossing at a bend costs
  double — cross on a straight.
- **The designated land lies across the direct line**, with a gap at the top or
  the bottom, and every row of it is at least two cells thick. Two is the
  point: one cell of designated land is minus 8 on the environment, which the
  dial can absorb, and two is minus 16, which it cannot.
- **The direct line is cleared to easy ground.** This is the least obvious pass
  in the generator and the most important. Designated land costs 4 to cross and
  woodland costs 3, so protected habitat is barely more expensive than trees —
  it is an *environmental* barrier, not a financial one. Without clearing the
  direct line, the cheapest route simply strolls around the designated land and
  scores well on everything, and there is no decision left in the game at all.
- **Two substations**, one on the direct line and one on the way round, so both
  broad answers can be energised and the choice between them stays a choice
  about land rather than about plumbing.

### What the checks reject

[js/balance.js](js/balance.js) has the final say. A candidate map is thrown
away and another rolled unless all three of these hold:

| Check | What it means |
|---|---|
| **solvable** | some route reaches the grid supply point through a substation |
| **balanced** | some route scores at or above 70 on *all three* dials |
| **non-trivial** | the *cheapest* route does not, and fails on environment |

Across 500 seeds the generator accepts about three maps in five (59.6% at the
settings in `config.js`), and the best weakest dial on an accepted map runs
from 70 to 77.7, median 72.3. That sweep mixes every kind of landscape below
and judges them all by these three checks alone; the plain kind on its own is
accepted 78% of the time. The difficulty badge is banded against these
figures, so re-measure with `node js/balance.js --seeds 500` before moving
them.

The second matters most. A map where the balanced verdict is unreachable asks
the player to do something impossible, and it is not obvious from looking at
it — this game shipped with exactly that bug, on a hand-drawn map, at
`COST_BUDGET: 60`, where the best weakest dial any route could reach was 53.

The third is what stops a map being a stroll. If the cheapest route is also the
balanced one, there is no trade-off to make, and the map is discarded however
pretty it is.

The search behind those checks is a west-free Pareto walk: enter a column, run
vertically inside it, step east. Because each column is entered exactly once,
the no-revisit rule holds by construction — which matters, because community
benefit land carries a *positive* community value, so a naive relaxation would
find a profitable loop around it and never terminate.

If the acceptance rate ever drops, the answer is to retune the generator, never
to soften these checks. `generator.fallbackSeed` is a seed verified at design
time and used if every roll is rejected; it is a hostage to every other number
in that block, so `node js/mapgen.js --self-test` re-checks it rather than
trusting it.

### Kinds of landscape

A map is one of six kinds, named beside its seed. Which kind comes from the
seed, by the weights in `CONFIG.archetypes`, so a seed always draws the same
kind and the same map. Each kind changes some generator numbers and may add
one test of its own, run by [js/archetypes.js](js/archetypes.js) **on top of**
the three checks above, never instead of them:

| Kind | Drawn with | Must also show | Accepted |
|---|---|---|---|
| Open country | the plain generator | — | 78% |
| Narrow gap | a gap one row wide, rougher ground, bigger lake | best weakest dial under 73 | 41% |
| Community pressure | a five-square town across the way round, no benefit land, one customer | best route cannot keep community at 90 | 48% |
| Hard crossing | woodland on both river banks | — | 52% |
| Knife edge | the same town and rewards, and wooded banks | no dial on the best route above 85 | 17% |
| The long way round | the plain generator | best route costs at most 1.08x the cheapest | 15% |

The two town kinds were redrawn when pylons were banned over houses. Their
eight-square town had been passed on pylons, which is what kept community
under pressure; banned from that, the best route went round or under, and
both kinds fell to about 1% accepted. A smaller town keeps a route under it
affordable, and taking away the benefit land stops the way round buying back
the objection that passing beside the town costs.

A rarely accepted kind gets more rerolls (`maxTries`). Rerolls keep to the
kind the first roll picked, so the weights mean what they say rather than
drifting towards the kinds that are easiest to accept. Run
`node js/archetypes.js --seeds 300` before changing any number there: it
prints each kind's acceptance rate and the chance a player ends up on the
fallback seed instead.

A note on `COST_BUDGET`. It is 130, not the 60 the game shipped with, for the
reason above. The two figures in the scoring self test move with this number;
the test says which and shows the arithmetic.

There are exactly six pieces because there are exactly six ways to choose two
of four sides. Adding a seventh is not possible; reordering and relabelling
them is fine.

Adding a kind of **ground**, on the other hand, is now genuinely a config job:
an entry in `cellTypes` with an `icon`, a letter in `legend`, and a pass in the
generator that puts it somewhere. The legend and the drawn map read the icon
and the colour token off the type, and a type with no colour token of its own
falls back to farmland rather than disappearing. One thing to know if you give
it a negative cost: the balance search's cost bound has to allow for every
refund on the map, which `refundOn` does, and its pruning comment explains why
it must.

### How the map is drawn

The board has to read as a *landscape*, not as a table of coloured squares, and
there is a ceiling on how far coloured squares can be pushed: a wood made of
five squares still looks like five squares, because the eye reads the straight
lines before it reads anything else.

So [js/mapart.js](js/mapart.js) draws from the **outline** of each patch of
ground rather than from its cells:

1. **Trace the boundary.** Give every cell of a region its four edges, walked
   the same way round. An edge between two cells of the same region then
   appears twice in opposite directions and cancels; what survives is exactly
   the boundary, already chained head to tail. Holes fall out for nothing — a
   lake inside a wood traces its own loop and `fill-rule="evenodd"` punches it
   out.
2. **Wobble the corners**, by an amount keyed on each corner's own
   coordinates. Keying it on the coordinates rather than on the position in the
   loop is what stops daylight opening up where a wood meets a hill: the corner
   they share moves by the same amount in both.
3. **Round every corner**, then run a `feTurbulence`/`feDisplacementMap` pair
   over the lot. The wobble gives irregularity at the scale of a field
   boundary; the filter gives it at the scale of a pencil line. It takes both
   to stop an outline looking computed.

The river and the road are drawn as smoothed centre-lines — Catmull-Rom
converted to the cubic Béziers SVG actually speaks, so the curve passes
*through* every cell the water really goes through. Trees, hills, rocks, reeds
and houses are scattered several to a cell and allowed to spill over the edges,
which is the whole difference between a wood and four squares of trees.
`texture` and `density` in [js/config.js](js/config.js) still tune how thickly,
and are still presentation only.

**Open country is a patchwork of fields**, not bare paper. Cells of open
ground are grouped into fields of one to a few cells, each traced like any
other region, given one of four crop colours and, about half the time, rows of
furrows. Hedges run along some of the boundaries between fields, with the odd
tree standing in them. Fields are built from whole cells, so every hedge lies
on a line of the game's own grid: the decoration quietly shows the player the
squares they are playing on instead of fighting them.

Every symbol — in [js/mapsymbols.js](js/mapsymbols.js) — is lit from the upper
left, with a shadow on the ground to the lower right, matching the relief under
raised ground. Canopies and roofs are filled with `currentColor` and each copy
gets a tint class, so one tree symbol makes a wood of three greens. The two
ends of the line get pictures of their own: wind turbines at the power
station, a small skyline at the grid supply point. Both keep clear of the middle band
of their cell, where the line always runs.

The route on top is one path per run of cells sharing a technology, rather than
one bar per cell, so a corner comes out as a corner instead of as two
overlapping rectangles. Every casing is drawn before every body, so a run that
changes technology cannot have its neighbour's casing painted over it. A span
in the air throws a shadow and has a pylon at each cell; a buried span throws
none and leaves a band of turned earth instead — the technologies differ in
the ground, not only in colour. Once the line is energised, current runs along
it. That drawing lives in [js/routeart.js](js/routeart.js).

Everything is drawn from the seed, never from `Math.random`, so a map looks
identical on every load and for every player and never shuffles itself under a
repaint. And all of the above is drawn **once per map** — laying a span
repaints the route layer and nothing else.

**There are two SVG sheets, one over the other.** The lower one holds the
ground itself — paper, fields, regions and all the filters, then the river bed
and the road — and CSS gives it a compositing layer of its own
(`will-change: transform`), which means the browser paints it once and keeps
the picture. The upper one holds everything standing on that ground (trees,
reeds, hills, rocks, houses, landmarks, the field lines) and everything that
moves: the landscape's own motion, the turning turbines, the route and the
best route found. Without the split, every span laid and every frame of
animation would make the browser run the roughening filter again over the
patch that changed.

**The landscape moves a little by itself.** The river's glints flow
downstream, cars drive the road on the left-hand side, ripples drift across
the lakes, trees and reeds lean in the wind, smoke rises from some of the
chimneys, and cloud shadows pass slowly over the whole map. It is drawn by
[js/mapmotion.js](js/mapmotion.js) into two groups `mapart.js` leaves empty on
the upper sheet — one under the trees for the water and traffic, one over them
for the smoke, both under the route — and animated by
[css/mapmotion.css](css/mapmotion.css). Four choices keep it cheap and quiet:

- **Nothing moves on the lower sheet.** The glints and ripples used to be drawn
  there, and so did every tree, reed, house and landmark; all of it moved up,
  so the filters are still painted once.
- **The wind travels.** Each gust reaches the west edge first and takes a few
  seconds to cross the map, so it is seen moving through a wood rather than
  every tree leaning at once. The lean is a skew pinned at the plant's foot,
  written out per plant in map units: Chromium measures a `<use>` without its
  `x` and `y`, so `transform-box: fill-box` pinned every plant near the corner
  of the map instead.
- **The cloud shadows are HTML boxes, not SVG.** A box that only slides is moved
  by the graphics card without repainting anything, which an SVG shape cannot
  be.
- **Each car is one dash of a dashed line.** Traffic moves by sliding the dash
  pattern along the lane, so the road costs a few paths however many cars are
  on it.

It is slow and faint on purpose: the map is where the player thinks, and the
pulsing target square has to stay the loudest thing on it. Under
`prefers-reduced-motion` the water, traffic and plants stand still, and the
smoke and clouds are not shown at all. How much of it there is — the share of
chimneys lit, cars per lane, number of clouds, how fast a gust crosses — is set
at the top of `mapmotion.js`; how far a tree or reed leans is in the `sway`
keyframes in `mapmotion.css`.

**The picture is decoration, and that is load bearing.** The SVG is emitted
`aria-hidden` and sits *beneath* the grid of real `<button>` elements. Every bit
of behaviour — focus, the label on each cell, the keyboard route, the live
region — belongs to those buttons and was untouched by the rewrite. Under
`forced-colors` the picture is simply hidden and the buttons draw their own
borders again.

### Why it fits on a laptop

The shell is a `100dvh` grid and never scrolls above 40rem. Two things do that
work, and neither is obvious:

- **`min-height: 0` on every box between the shell and the map.** A grid or
  flex child defaults to `min-height: auto`, which means it refuses to shrink
  below its own contents. One box in the chain without it and the layout pushes
  past the bottom of the screen — which is exactly what used to happen here.
- **Container query units size the map.** The stage declares itself a size
  container, so the map can ask for `min(100cqw, 100cqh * ratio)` and take
  whichever axis runs out first. The alternative — guessing the leftover height
  with `calc(100dvh - 17rem)` — is wrong the moment anything in the rail
  changes size, and it was.

Below 40rem the fixed shell is abandoned rather than squeezed: there is
genuinely not room for a map and its controls at once on a phone, and
pretending otherwise makes both unusable.

## Layout

```
index.html        markup and script order
css/style.css     all styling, including the colours of the landscape
css/guidance.css  the forecast, Why?, span tints, land card numbers and the tour
css/howto.css     the How to play sheet and its pictures
css/mapmotion.css the landscape's motion: water, traffic, plants, smoke, clouds
css/bigscreen.css the game growing with the screen, and kiosk mode's styles
img/*.svg         icons for the legend
js/config.js      all tunable numbers, the generator settings, all text
js/rng.js         seeded randomness. No Math.random anywhere in this project
js/score.js       scoring maths and the self test. No DOM, no state
js/mapgen.js      a seed in, a landscape out. No DOM, no state
js/balance.js     is a map worth playing? Also the CLI design tool
js/foresight.js   the best finish still open from the end of the line. No DOM
js/advice.js      numbers into sentences: explain, why, look ahead. No DOM
js/mapsymbols.js  the drawings: trees, houses, landmarks, the two ends
js/mapart.js      lays the landscape out as a decorative SVG
js/mapmotion.js   what moves in it: river, traffic, ripples, plants, smoke, clouds
js/routeart.js    draws the route and the best route found over it
js/render.js      everything else that writes to the page. No state, no rules
js/guidance.js    dresses render's meters, buttons, board and land card with advice
js/tour.js        the five-step tour
js/howto.js       the How to play sheet: cards of pictures, played while it is open
js/howtoart.js    the pictures on it, scored with the game's own numbers
js/howtoboard.js  a few squares of map for those pictures, drawn with the map's own code
js/game.js        state and rules. Never touches the DOM directly
js/bigscreen.js   the full-screen button, and ?kiosk: idle reset, hidden pointer
```

The separation is strict and worth keeping: if you find yourself deciding
whether a move is legal inside `render.js`, that logic belongs in `game.js`.

The four files with no DOM in them — `rng`, `score`, `mapgen`, `balance` — are
the reason the generator can be tested at all. They load under Node unchanged,
which is what makes `node js/balance.js --seeds 500` possible.
