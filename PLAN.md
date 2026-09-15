# Connecting the Grid — rebuild plan

Procedural landscapes, an SVG map, an app shell that fits, and route-drawing input.

---

## 1. Context

The prototype plays correctly and the scoring model is sound. Four things are wrong with it, and they were raised in this order:

1. **It does not read as a map.** Every terrain region is a run of hard-edged squares. The last round of work (seamless squares, scattered symbols, field lines drawn once over the whole board) helped, but there is a ceiling: a square is still a square, and a wood made of five squares still looks like five squares.
2. **It does not fit a laptop screen.** At 1920×990 the technology picker, the controls and the legend are all below the fold. The page is a *document that contains a game* rather than an *application*.
3. **The commands are confusing.** The player picks an abstract blue bar from a six-tile palette, then drops it on the one highlighted square.
4. **The map is a single hand-authored string**, so every play is the same puzzle.

Point 3 deserves attention, because the fix is nearly free. [js/game.js:19](js/game.js#L19) already documents the key fact:

> So there is never more than one legal target square. The choice the player makes is which shape to put on it.

And of the six pieces, only those that open on `state.needSide` can ever fit — at most three. So the palette is an abstract, indirect way of asking *"straight, left, or right?"*. Replacing it with direction chevrons on the target square fixes the confusing input **and** reclaims the sidebar height that is pushing everything off screen. One change, two complaints.

### Decisions taken

| Question | Decision | Why |
|---|---|---|
| Language / stack | **Plain JS + HTML, no build step** | The reference game is DOM + PNGs with no framework. SVG needs no libraries. Stays double-clickable; generator and validator still run under Node for testing. |
| Rendering | **SVG art layer over the existing DOM grid** | Vector outlines are the one thing we actually need and canvas/WebGL does not give: we can trace a region's boundary and smooth it. An 11×9 static board is nowhere near needing WebGL. |
| Map data | **Procedurally generated from a seed, then validated for balance** | "New landscape" button. Every map is checked solvable and genuinely balanced before it is shown. |
| Input | **Draw the route** — click or drag toward the next square | The piece is inferred from direction. Rules and scoring untouched. |
| Layout | **Fluid app shell, never scrolls** | Fills exactly `100dvh` at 1280×720 and 1920×1080. |

### What explicitly does not change

The scoring model, the six pieces as a data model, the technologies, the substation requirement, the no-revisit rule, the verdicts and bands, and the layering discipline: **`config` → `score` → `render` → `game`, with no module reaching backwards.** `score.js` stays pure and Node-loadable. `render.js` keeps no state and decides no rules. `game.js` never touches the DOM.

---

## 2. Architecture

### File map

```
index.html          rewritten — app shell markup
css/style.css       rewritten layout; brand tokens kept as-is
js/config.js        map[] removed, generator{} added, input copy rewritten
js/rng.js           NEW  seeded PRNG + value noise + fBm
js/mapgen.js        NEW  seed -> map grid + named features
js/score.js         + setMap(); reads the active map instead of CFG.map
js/balance.js       NEW  Pareto route search: runtime validator + CLI design tool
js/mapart.js        NEW  the SVG landscape
js/render.js        board dressing removed; route path, chevrons, tooltip added
js/game.js          + stepTo(), drag, arrow-to-lay, newMap()
img/*.svg           reused as <symbol> definitions in the SVG
```

### Load order

```html
<script src="js/config.js"></script>   <!-- no deps -->
<script src="js/rng.js"></script>      <!-- no deps -->
<script src="js/mapgen.js"></script>   <!-- CONFIG, Rng -->
<script src="js/score.js"></script>    <!-- CONFIG -->
<script src="js/balance.js"></script>  <!-- CONFIG, Score -->
<script src="js/mapart.js"></script>   <!-- CONFIG, Rng -->
<script src="js/render.js"></script>   <!-- CONFIG, Score, MapArt -->
<script src="js/game.js"></script>     <!-- everything -->
```

Still plain `<script>` tags, deliberately not ES modules, so `index.html` opens off `file://`. Each new file follows the existing IIFE-returning-one-global convention and guards `module.exports` for Node.

### Boot sequence

```
Game.init()
  └─ Game.newMap(seed?)
       ├─ MapGen.generate(seed)         →  { rows, features, seed }
       │    └─ loop: build candidate → Score.setMap → Balance.verdict
       │            → accept, or reroll (up to CONFIG.generator.maxTries)
       ├─ Score.setMap(rows)            →  installs it, clears the grid cache
       ├─ MapArt.draw(rows, features)   →  builds the SVG, once
       ├─ Render.buildBoard(...)        →  the DOM button grid, once
       └─ Game.reset()                  →  clears the route, paints
```

---

## 3. Phase 1 — the app shell

Fixes complaint 2. Leaves the game playable on its own.

### Target layout

```
┌─────────────────────────────────────────────────────────────┐
│ Connecting the Grid      [New landscape] [How to play] [↶] │  auto
├──────────────┬──────────────────────────────────────────────┤
│ Cost   ▓▓▓▓░ │                                              │
│ Env    ▓▓▓░░ │                                              │
│ Comm   ▓▓░░░ │            T H E   M A P                     │  1fr
│              │      (fills whatever is left, both ways)     │
│ ── Technology│                                              │
│ [Lat][T-p][C]│   hover or focus a square → its tooltip      │
│              │                                              │
│ ▸ What the   │                                              │
│   land means │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ status line, aria-live=polite                               │  auto
└─────────────────────────────────────────────────────────────┘
```

### Markup

`index.html` becomes:

- `<div class="app">` — the `100dvh` grid, rows `auto / minmax(0,1fr) / auto`
- `<header class="topbar">` — title, then `New landscape`, `How to play`, `Undo`, `Start again`. The masthead strapline moves into the instructions dialog; it is not worth 3rem of vertical space on every play.
- `<div class="app-main">` — columns `17rem / minmax(0,1fr)`
  - `<aside class="rail">` — meters, technology segmented control, `<details class="legend-drawer">`
  - `<div class="stage">` — `<div class="board-wrap">` containing the SVG art layer, the DOM cell grid, the chevron overlay and the tooltip
- `<p class="status" role="status" aria-live="polite">`
- The two `<dialog>`s, unchanged in structure.

### CSS

```css
html, body { height: 100%; }
body { margin: 0; overflow: hidden; }

.app {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.app-main {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  gap: 0.75rem;
  min-height: 0;            /* see note below */
  padding: 0.75rem;
}

.rail  { display: grid; gap: 0.75rem; align-content: start;
         overflow-y: auto; min-height: 0; }

.stage { display: grid; place-items: center;
         min-height: 0; min-width: 0; container-type: size; }

.board-wrap {
  aspect-ratio: var(--cols) / var(--rows);
  width: min(100cqw, 100cqh * var(--cols) / var(--rows));
}
```

**The `min-height: 0` chain is the whole trick.** A grid or flex child defaults to `min-height: auto`, which means it refuses to shrink below its content — which is exactly why the current layout overflows. Every element between `.app` and `.board-wrap` needs it.

**Container query units size the board.** `100cqw` / `100cqh` are the stage's own dimensions, so `width: min(100cqw, 100cqh * ratio)` picks whichever axis binds and the `aspect-ratio` does the rest. This replaces [css/style.css:458](css/style.css#L458), which currently guesses with `calc((100dvh - 17rem) * var(--cols) / var(--rows))` — a hard-coded 17rem that is wrong the moment anything in the rail changes.

### Component changes in the rail

- **Technology**: three stacked cards (`.tech` at [css/style.css:346](css/style.css#L346)) become one segmented control — three chips in a row, chosen state by fill and a tick. `tech.summary` moves to the `title`/tooltip. Saves ~9rem.
- **Meters**: keep the banded bar (the 30/70 boundaries matching `CONFIG.bands` are good), but put the label and the numeric value on one line with the bar, not stacked.
- **Legend**: becomes a `<details class="legend-drawer">`, closed by default, **plus** a hover/focus tooltip on each map square giving that terrain's name, description and cost/env/community. The tooltip is strictly better than a static key — it answers the question where the question is asked. The drawer stays for anyone who wants to scan the whole table.
- **Controls**: `Undo` and `Start again` move to the top bar as compact buttons. The `Controls` panel disappears.
- **Pieces panel**: deleted entirely (Phase 2).

### Breakpoints

- `≥ 64rem` — the layout above.
- `40–64rem` (tablet): rail moves under the stage as a horizontal strip; `.app-main` becomes one column with rows `minmax(0,1fr) auto`. Still no page scroll.
- `< 40rem` (phone): abandon the fixed shell. `overflow: auto` returns on the body, the board takes full width, and the page scrolls. A 360×640 viewport cannot show a map and its controls at once and pretending otherwise makes both unusable.

---

## 4. Phase 2 — draw the route

Fixes complaint 3. Rules are untouched; only input changes. `state.route` still records a `pieceId` per cell, so scoring, undo, the README's mechanics and the balance search are all unaffected.

### The core insight

For the current target `T` with `needSide` `S`, a piece that fits is exactly a piece whose connectors contain `S`. Its *other* connector is the direction the line leaves in. So **piece choice and exit direction are the same choice**, and direction is the one a player can see.

`game.js` already computes `state.fits` in `recomputeTarget()` at [js/game.js:176](js/game.js#L176). Derive the exits from it — no new rules logic:

```js
/* The legal ways out of the target square. Each is a piece the player
   could lay, named by the direction it sends the line rather than by
   its shape, because direction is what the player is actually choosing. */
function exitsFromTarget() {
  if (!state.target) { return []; }
  return CFG.pieces
    .filter(function (p) {
      return state.fits[p.id] && p.connectors.indexOf(state.needSide) >= 0;
    })
    .map(function (p) {
      var dir = p.connectors[0] === state.needSide ? p.connectors[1] : p.connectors[0];
      return { pieceId: p.id, dir: dir, to: neighbour(state.target.col, state.target.row, dir) };
    });
}
```

`state.exits` joins the state object and `render.js` reads it. The rules stay in `game.js`.

### The new primitive

```js
/* Lay the piece that sends the line from the target square toward (col,row).
   (col,row) must be a neighbour of the target. */
function stepTo(col, row) {
  var exit = state.exits.filter(function (e) {
    return e.to.col === col && e.to.row === row;
  })[0];
  if (!exit) { /* existing error copy path */ return false; }
  return place(state.target.col, state.target.row, exit.pieceId);
}
```

`place()`, `check()` and every message are reused as they are.

### Four ways to express a direction

| Input | Behaviour |
|---|---|
| **Chevrons** | The target square shows up to three chevrons, one per legal exit. Click one. Makes the choice *visible* instead of hiding it behind an abstract palette. |
| **Click the target itself** | Takes the straight-ahead exit (`OPPOSITE[needSide]`) when it is legal. A long run of straights is one click per cell — the common case. |
| **Drag** | Pointer down on the target or the route head, then drag across cells. Each cell resolves as the pointer enters the next one. Fastest once learned. |
| **Arrow keys** | Already move the cursor. Now an arrow pressed *while the cursor is on the target* lays the piece in that direction. `1`/`2`/`3` switch technology. Escape and Undo unchanged. |

### Chevron implementation

Cells are `<button role="gridcell">`, so chevrons cannot nest inside them — nested buttons are invalid. Instead: **one absolutely-positioned overlay** inside `.board-wrap`, holding up to three `<button class="chevron">`, repositioned over the target cell on each paint using `--col` / `--row` custom properties and the grid's own cell size.

The chevrons are `aria-hidden="true"` and `tabindex="-1"`. This is deliberate: the keyboard path (arrow keys on a `role="grid"`) is complete, standard and better, and announcing three extra buttons that duplicate the arrow keys is noise. The decision goes in a comment so nobody "fixes" it later.

Chevrons pointing at a cell that is impassable, off-board or already used get a muted dead-end style — a hint, not a rule. `check()` remains the only thing that decides legality.

### Drag state machine

```
pointerdown on target or head
  → drawing = true; board.setPointerCapture(e.pointerId)
pointermove
  → col/row from offsetX/offsetY against the board rect  (cheap, no hit-testing)
  → unchanged cell?              ignore
  → cell === a legal exit's `to`? stepTo(cell)   — target advances, keep going
  → cell === previous route cell? undo()          — drawing backwards rubs it out
  → anything else                 ignore silently (no error spam mid-drag)
pointerup / pointercancel / lostpointercapture
  → drawing = false; release capture
```

Silent rejection during a drag is intentional — the `aria-live` status must not fire on every stray pixel.

### Removed

`Render.buildPalette` and `Render.paintPalette` ([js/render.js:202](js/render.js#L202), [js/render.js:418](js/render.js#L418)), the `.palette` / `.piece` / `.piece-art` CSS, `Game.armPiece` / `Game.disarm`, `state.armedPiece`, the `dragstart`/`dragover`/`drop` HTML5 drag path on cells ([js/render.js:161-178](js/render.js#L161-L178)), and the `Pieces` panel in `index.html`.

`state.fits` **stays** — it is what the chevrons are derived from.

### Copy changes in `CONFIG.copy`

| Key | Now | Becomes |
|---|---|---|
| `statusReady` | "Choose a piece, then drop it on the highlighted square…" | "Click the arrow showing where the line should go first." |
| `statusArmed` | "{piece} selected. Drop it on…" | *deleted* |
| `statusRouting` | "{n} pieces laid. Keep going…" | "{n} spans built. Keep going east to the demand centre." |
| `errNoPiece` | "Choose a piece from the palette first." | *deleted* |
| `errWrongSquare` | "That is not where the line goes next…" | "The line cannot jump. Carry on from the highlighted square." |
| `errPieceDoesNotFit` / `errStartPiece` | shape language | direction language — "The line cannot double back on itself." |
| `piecesHeading` / `piecesHint` / `piecesLabel` | — | *deleted* |
| `instructions[]` | palette-based | rewritten for drawing; add the arrow-key line and `1`/`2`/`3` |
| new: `newMapButton` | — | "New landscape" |
| new: `chevronLabel` | — | "Send the line {side}, into {terrain}." (`title` on each chevron) |

`copy.sides` (`{n:'top', e:'right', …}`) is reused for all of it.

---

## 5. Phase 3 — procedural maps

### `js/rng.js`

```
Rng.make(seed)              mulberry32. Same seed, same map, forever.
Rng.hash2(x, y, salt)       integer hash → 0..1. No allocation.
Rng.noise2(seed)            → sampler(x, y): smoothstep-interpolated value
                              noise on a hashed lattice.
Rng.fbm(sampler, oct, gain) → sampler(x, y): fractal sum of octaves.
Rng.pick(rng, array)        weighted / plain choice helpers.
```

This also replaces the ad-hoc `Math.sin`-based `noise()` currently inline at [js/render.js:66](js/render.js#L66). Both the generator and the art layer draw from it, so scatter positions stay deterministic per seed and never reshuffle under a repaint.

### `js/mapgen.js`

```js
MapGen.generate(seed) → {
  seed,
  rows:     ['HHKRF…', …],                  // 9 strings of 11 chars
  features: {
    river:  [[c,r], …],                     // ordered centre-line
    road:   [[c,r], …],                     // ordered centre-line
    town:   [[c,r], …],
    subs:   [[c,r], [c,r]]
  }
}
```

Returning the **ordered feature chains** alongside the character grid matters: the art layer needs the river as a *path* to smooth, and re-deriving an ordering from a set of cells is both harder and ambiguous. The generator already knows the order because it walked it.

Passes, in order:

1. **Base fields.** Two fBm samplers — call them elevation and wetness — thresholded into `farmland / hilly / rocky / woodland`. Thresholds come from `CONFIG.generator.weights`, so the mix is tunable without touching code. Farmland must stay the plurality or the map turns to soup.
2. **River.** A meandering walk from a random cell on the north edge to one on the south edge, constrained to a column band (`generator.riverBand`, roughly the eastern third) with a per-step lateral drift probability. Widened to two cells at each bend. **This guarantees every west-to-east route crosses the river exactly once and cannot use cable there** — the single most important balance property of the current hand-drawn map.
3. **Road.** A second, straighter top-to-bottom walk in the western third. Every route also crosses one road.
4. **Designated land.** One blob grown by seeded flood-fill from a cell placed near the straight line between the endpoints, size from `generator.sssiCells`. Going direct is always the tempting-and-wrong choice.
5. **Town.** A settlement cluster adjacent to the demand centre; `customer` and `benefit` cells seeded on a plausible detour corridor so a considerate route is rewarded.
6. **Substations.** Two, placed on demonstrably different corridors (one near the direct line, one off it) so the choice of which to energise through is a real decision.
7. **Lake.** A small `water` blob placed off the direct line — impassable, and it must not wall the map off, which the validator confirms.

`CONFIG.start` (0,4) and `CONFIG.end` (10,4) stay fixed. Left-to-right framing is what makes the west-free balance search valid, and it is what makes "keep going east" a sensible instruction.

### `js/balance.js`

Promoted from a scratchpad throwaway into a real, committed file, because it is now load-bearing. It is a **west-free Pareto dynamic program**: one vertical run per column, then a step east. Because no route ever doubles back west, revisits are structurally impossible and the search terminates — the naive relaxation does not, since `benefit` cells carry positive community value and create profitable cycles.

```js
Balance.explore(rows) → {
  frontier,          // Pareto set of (cost, env, comm) reaching the end
                     // through at least one substation
  best:    { cost, env, comm },        // best each dial can reach alone
  allRound:{ cost, env, comm, weakest },
  cheapest:{ cost, env, comm }         // the minimum-cost route
}

Balance.verdict(rows) → { ok, solvable, balanced, nonTrivial, reason }
```

A candidate map is **accepted** only if all three hold:

- `solvable` — the frontier is non-empty (a route exists that reaches the demand centre through a substation).
- `balanced` — `allRound.weakest >= CONFIG.balancedThreshold` (70). A balanced verdict must be *achievable*, or the player is being asked to win an unwinnable game.
- `nonTrivial` — the cheapest route's environment dial is *below* the threshold. The greedy answer must be punished, or there is no decision to make.

Rejected candidates are rerolled up to `CONFIG.generator.maxTries` (default 40); if all fail, fall back to `CONFIG.generator.fallbackSeed`, a seed verified at design time and baked into config.

**Performance.** Totals are quantised (`Math.round(n*4)/4`) and the per-state Pareto set is capped as a safety valve. Target: one full validation under ~20ms, so even ten rerolls are imperceptible. This is measured, not assumed — see verification.

**Also a CLI design tool.** `node js/balance.js --seeds 500` sweeps seeds and reports the acceptance rate and the distribution of `allRound.weakest`, so the generator gets tuned with evidence rather than by eye.

> This tool is how a real pre-existing bug was found last round: at `COST_BUDGET: 60` the balanced verdict was unreachable on **any** route, including on the original hand-drawn map (best weakest dial 53). The budget is now 130 and the validator will hold it honest across every generated seed.

### `js/score.js` changes

`buildGrid()` at [js/score.js:88](js/score.js#L88) reads `CFG.map` once and caches it. Minimal change:

- Add `Score.setMap(rows)` — stores the active map, clears the cached grid.
- `buildGrid`, `typeIdAt`, `typeAt` and `validateMap` read the active map rather than `CFG.map`.
- `selfTest()` installs its own fixed test map first, so the assertions stop depending on whatever the generator happened to produce. **This is required**, not optional — without it the test becomes non-deterministic.

The scoring maths, dials, bands and verdicts are untouched. `validateMap()` survives as a generator postcondition — it now catches generator bugs rather than author typos.

---

## 6. Phase 4 — the SVG landscape

Fixes complaint 1. Done last so it draws whatever the generator produces.

### The accessibility contract

`MapArt` emits **one `<svg aria-hidden="true">`, purely decorative**, and the existing DOM grid of `<button role="gridcell">` sits on top of it, transparent. Nothing about the SVG is interactive.

This is the central design decision of the phase. It preserves every bit of accessibility work already done — real buttons, roving tabindex, `aria-label` per cell, `aria-live` status, focus rings, forced-colors support — while the SVG carries all of the beauty and none of the semantics. Under `forced-colors: active` the SVG is simply hidden and the cell borders come back.

### Layer stack, back to front

| # | Layer | Technique |
|---|---|---|
| 1 | Paper | Warm off-white base plus `feTurbulence type="fractalNoise"` at low `baseFrequency`, composited at very low opacity. |
| 2 | Terrain regions | Boundary trace → corner rounding → `filter: url(#rough)`. See below. |
| 3 | River & road | Smoothed centre-lines, stroked with a casing. See below. |
| 4 | Scatter | Jittered `<use>` of `<symbol>` trees, rocks, houses. Reuses [img/](img/). |
| 5 | Relief | Soft offset shadow on the south-east edge of hilly and woodland regions. This is what actually makes terrain read as raised. |
| 6 | Grid | Very faint — the player still needs to see the cells they are routing through. |
| 7 | Route | Owned by `render.js`, not `MapArt`. Repainted per move. |

### Layer 2 — regions

Terrain is cell-aligned, so classic interpolating marching squares is the wrong tool. Use an exact **boundary edge-walk**:

1. For every cell in the region emit its four boundary edges as ordered vertex pairs.
2. Discard every edge shared by two in-region cells. The survivors are exactly the boundary.
3. Chain the survivors head-to-tail into closed loops. Multiple loops and holes go into one `<path>` with `fill-rule: evenodd`.

Then make it organic, in two steps:

- **Jitter** each loop vertex by seeded noise, a few percent of a cell. Same seed as the map, so it never moves.
- **Round** every corner: for vertex `V` with neighbours `P` and `N`, take `r = min(radius, |PV|/2, |VN|/2)`, line to `V - r·û(V−P)`, then a quadratic Bézier with control point `V` to `V + r·û(N−V)`.

Finally apply `filter: url(#rough)` — a `feTurbulence` + `feDisplacementMap` pair — for hand-drawn edge wobble. Jitter gives large-scale irregularity, the filter gives fine-grain wobble; both together is what sells it.

### Layer 3 — river and road

Not filled regions but **stroked centre-lines**, which is how cartography actually draws them. Take the ordered chain from `features`, convert cell centres to a smooth curve with **Catmull-Rom → cubic Bézier**:

```
for each segment p1→p2 with neighbours p0, p3:
  c1 = p1 + (p2 − p0)/6
  c2 = p2 − (p3 − p1)/6
  emit  C c1 c2 p2
```

(endpoints duplicated). Then:

- **River**: a wide pale casing stroke underneath (banks), a narrower body on top, `stroke-linecap/linejoin: round`. Width modulated slightly along its length so it widens downstream.
- **Road**: a dark casing and a light fill — the standard road treatment — with a faint centre dash.

### Layer 4 — scatter

Jittered `<use href="#tree">` instances placed inside each region, count proportional to region area, positions and rotations from the seeded sampler. `CONFIG.cellTypes[*].texture` and `.density` — already in config from the last round — carry straight over: `'scatter'` types get symbols at `density`, `'plain'` types get none, `'landmark'` types get one crisp centred symbol on a pale disc.

### Layer 7 — the route

Drawn by `render.js` on its own `<g>` above the art, repainted every move. This **replaces the per-cell `::before`/`::after` bar construction** at [css/style.css:229-289](css/style.css#L229-L289), and in doing so fixes the corner-overlap seam that the white drop-shadow halo is currently working around.

- Group the laid cells into **runs of consecutive same-technology cells** (technology is per-cell and can change mid-route).
- Each run is a polyline through cell centres with small corner radii — a transmission line is straight between pylons with sharp angle changes, so this is right and Catmull-Rom would be wrong. Extend each run half a cell into its neighbours so runs butt seamlessly.
- **Two passes**: every casing first, then every body. One pass would let a later casing overdraw an earlier body at a technology change.
- Cable runs get `stroke-dasharray`, so technology is legible without relying on colour (WCAG 1.4.1).
- Draw-on animation via `stroke-dasharray`/`stroke-dashoffset`, suppressed under `prefers-reduced-motion`.
- A small pylon glyph at each lattice and T-pylon cell centre, and none for cable — buried is buried. This communicates technology at a glance far better than a colour does.

---

## 7. `config.js` changes

**Removed**: the `map` array and its design-notes comment block ([js/config.js:347-387](js/config.js#L347-L387)).

**Added**: a `generator` block, documented in the same house style as `cellTypes`:

```js
generator: {
  seedLength:   6,        // characters in a shareable seed string
  maxTries:     40,       // rerolls before falling back
  fallbackSeed: '…',      // verified at design time, baked in
  weights:   { farmland: …, hilly: …, rocky: …, woodland: … },
  noise:     { scale: …, octaves: …, gain: … },
  river:     { band: [.., ..], drift: …, bendWidth: 2 },
  road:      { band: [.., ..], drift: … },
  sssiCells: …,
  townCells: …,
  lakeCells: …
}
```

**Kept unchanged**: `grid`, `start`, `end`, `markers`, `pieces`, `budgets`, `cellTypes` (including `texture`/`density`), `technologies`, `rules`, `legend`, `dials`, `bands`, `verdicts`, `balancedThreshold`, `precision`.

**Rewritten**: the `copy` keys listed in §4.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| **Generated maps are boring or unbalanced.** The biggest risk in the whole plan. | The three-way validator is the answer, and `node js/balance.js --seeds 500` proves it across the seed space before shipping. If the acceptance rate is low the *generator* gets retuned — never the validator loosened. |
| **Validation is too slow to run at click time.** | Quantise, cap the Pareto set, measure. Budget: 20ms per validation. If it misses, precompute a pool of accepted seeds at design time and ship the pool. |
| **Boundary tracing has edge cases** — diagonal touches, regions that wrap a hole. | Edge-cancellation is exact and handles holes via `evenodd`. Diagonal-touch ambiguity is resolved by a fixed convention (always keep regions separate at a diagonal pinch) and unit-tested against hand-built grids. |
| **SVG filters are expensive.** `feTurbulence` over a large area can cost tens of ms. | It is drawn **once per map**, never per move. The route layer carries no filters. Measure paint time on a mid-range laptop; if `#rough` is too slow, bake the displacement into the jittered vertices and drop the filter. |
| **Accessibility regression** during a large rewrite. | The SVG is `aria-hidden` decoration and the DOM grid is untouched in structure — the contract in §6 exists precisely to bound this. A keyboard-only walkthrough is a required verification step, not a nice-to-have. |
| **`container-type: size` needs a definitely-sized container.** | The `minmax(0,1fr)` grid row provides one. Verified by the no-scroll assertion at both test resolutions. |

---

## 9. Verification

Run at the end of each phase, in full at the end.

**Automated**

```bash
node -e "require('./js/score.js').selfTest()"        # all checks pass, fixed test map
node js/balance.js --seeds 500                       # acceptance rate + distribution
node js/mapgen.js --self-test                        # dims, letters, endpoints passable,
                                                     # river spans, no walled-off map
```

**Layout** — headless Chrome at **1280×720** and **1920×1080**, light and dark:

```js
document.documentElement.scrollHeight === document.documentElement.clientHeight
```

must hold at both. This is the objective form of "fits on a laptop screen".

**Visual** — screenshots of three different seeds (are they visibly different, and do they all look plausible?), plus one mid-route shot with ~15 cells laid across mixed terrain, checking the route reads over every terrain type and the corners are clean at technology changes.

**Interaction** — by hand: click-through, drag-through, drag-backwards-to-undo, and a keyboard-only run (tab to the board, arrow-key a complete route to the demand centre, reach the verdict dialog, never touching the mouse).

**Preferences** — `prefers-reduced-motion: reduce` (no draw-on animation) and `forced-colors: active` (SVG hidden, cell borders and focus ring visible).

**Regression** — undo, reset, the substation requirement, the wrong-end-piece warning, the stuck state, and the verdict dialog firing exactly once.

**Docs** — `README.md` updated: the fixed-map picture becomes a description of the generator and its balance contract; "How the map is drawn" is rewritten for the SVG layer; the input-model section replaces the palette description. Line endings preserved (README and `config.js` are LF; `render.js` and `style.css` are CRLF).

---

## 10. Out of scope

Isometric 2.5D, WebGL, a build step, a framework, hex grids, multiplayer, persistence, and sharing a seed by URL. Seeds *are* shareable strings, so the URL parameter is a small later addition if it is ever wanted.


---

# Round two

The game as built worked. Three things were still wrong with it, and one of
them had been sitting in the repository the whole time.

**The player was asked to trade blind.** The three dials only moved once a
span was already up. A game whose entire subject is "see what you give up and
what you get" was showing the price after the purchase.

**The best answer was computed and thrown away.** `Balance.explore` works out
the exact Pareto frontier for every landscape before it is ever shown -
`best`, `allRound`, `cheapest` - and `MapGen.generate` hangs it on
`built.verdict`. `Game.newMap` discarded it. The game knew how good a route
was available on the map in play, and never said so.

**There was no reason to come back.** No way to replay a landscape, send one
to anybody, or measure a route against anything.

## 1. Groundwork

**One tie-break.** `Score.verdictKeyFor` broke a tie between two equally low
dials towards cost; `Balance.readingFor` broke the same tie towards community.
Since `generator.punishCheapOn` filters maps on `cheapest.lowest`, a map could
be accepted for a reason the player's verdict would never give. `Score.lowestDial`
is now the single answer and both call it. Measured across the same 500 seeds
before and after: no acceptance decision changed. It was a latent
inconsistency rather than a live bug, and it is now impossible to reintroduce.

**Config really is the only file now.** `cellTypes[*].icon` was dead - legend
icons were twelve hard-coded CSS rules, and the twelve `.art-*` region fills
were another twelve. Both sets are gone; the legend and the drawn regions read
their icon and their colour token from the type. `CONFIG.markers` was dead
too, and now dresses the two end pins.

One trap worth recording: the legend icon **cannot** be passed through a CSS
custom property. A `url()` carried in a custom property resolves against the
stylesheet that used the `var()`, not against the page, so `img/x.svg` is
looked for in `css/img/` and quietly fails. It is set as `background-image`
directly, and the comment in `render.js` says why.

## 2. The span before it is built

`Game.previewSpan()` returns where the three dials land if the highlighted
square is built, and `refresh()` puts it on the state for `render.js` to paint
as a second, ghosted marker inside each meter bar.

The important design point is what it does **not** depend on: direction. The
piece is laid on the highlighted square, so the ground being paid for is that
square's whichever way the line then leaves - all three arrows would have
shown the same number. What *does* move the reading is the technology, and
that is the choice worth informing. Lattice, pylon or cable across this
square, and here is what each does to the dials.

Direction is a different question, and it is now answered where it is asked:
the arrows name the ground they lead into, which is what the first plan
specced and the first build shipped without.

The ghost marker is invisible to a screen reader, so the tooltip carries the
same reading in words on the square in play.

## 3. Par, difficulty, and the best route drawn

`Game.newMap` keeps `built.verdict.found`. From it:

* a difficulty badge beside the seed, banded on `allRound.weakest` against a
  **measured** distribution (500 seeds: 70 to 77.7, median 73.1) rather than
  against round numbers;
* a comparison under the verdict, with an encouragement tier keyed on the
  player's weakest dial as a share of that best one;
* and the route itself, drawn on the map on request.

`Balance.traceBest` is the largest piece of this. `explore` packs three totals
into one integer and sorts numerically, which is why generation can afford to
reroll two dozen times - so the fast path is not instrumented. Instead
`advance` takes an optional `note` callback and `explore` an optional tracer,
both absent on the generator's path; `traceBest` runs the same search once, on
demand, after the game is over, recording where every state came from and
walking the answer back from the finishing total. The technology is recovered
from how much each step *added*, which the totals alone could not say.

Nothing is drawn unless the traced route scores exactly what the search said
the best route scores. `MapGen.selfTest` asserts that on every fixed seed.

**Say "the best route found", never "the best possible".** The search is
west-free and prunes below `DEFAULT_FLOOR`, so it is a strong benchmark and
not a proof of the optimum. The copy in `config.js` is written that way on
purpose, and should stay that way.

## 4. Somewhere to come back to

`?seed=XXXXXX` plays that exact landscape - the generator always honoured an
explicit seed, and nothing had ever handed it one. `?daily` plays the same
landscape as everybody else that day: `MapGen.daily` derives its seed from the
**UTC** date plus a deterministic attempt counter, so two players do not merely
start from the same seed, they walk the same path to the same accepted map.
Checked across all 365 days of 2026: every day is accepted, none falls back to
the spare seed, and no landscape repeats.

State lives in the address bar and nowhere else. There is no `localStorage`,
no best scores and no streaks, which keeps the promise the first plan made.

The result copies as plain text with block-character bars. The clipboard
fallback is not a nicety: `navigator.clipboard` needs a secure context and
`file://` is not one, and `file://` is a supported way to run this game. The
selectable textarea is the ordinary path, not the exceptional one.

## 5. Two mechanics

**Committed mode.** `rules.allowUndo` already existed, was already respected,
and already had its refusal message written. It only ever lacked a switch. One
fix was needed: a backward drag called `undo()` on every pointer move, which
under this mode would have fired the live region dozens of times to refuse. A
drag that cannot rub out now simply does not rub out.

**Connection funding.** The only ground on the map that gives cost back. It
needed one honest special case: `fixedCost`, which stops the technology
multiplier applying. Without it, undergrounding through a grant would refund
six times the sum, which is not a trade-off, it is a bug with a story.

It also broke an assumption the balance search was documented on: "cost only
rises, because no cell refunds it". Cost can now come back, so the pruning
bound is no longer the budget but the budget plus every refund left on the map
- loose on purpose, since a bound that is too tight throws away routes that
would have been reported, and one that is too loose only costs time.

Placement is the point. `placeRewards` puts benefit and customer cells on the
gap rows, rewarding a route for being where it already wanted to be. Funding
goes on the **opposite** side - the side with the town on it and the lake in
it, which until now was nothing but a place to lose points. It is a question
now.

Acceptance across the same 500 seeds went from 73.6% to 74.6%.

**Not done, deliberately:** cost was not made a hard cap. A hard cap can
render a generated map unwinnable, which is the exact class of bug this game
shipped once already. The spend is shown against the budget as text instead.

## 6. What was checked

Every change was run in headless Chrome against the real page, not only
parsed. Beyond the three existing suites (`score` 9 checks, `mapgen` 71 - up
from 61 - and the 500-seed sweep):

* the previewed dials match what the span actually scores, exactly;
* the traced best route, played back through the game, finishes on the par
  figure to the decimal;
* `?seed=` and `?daily` both give the same landscape twice, from `file://`;
* the clipboard fallback shows, focuses and selects when `navigator.clipboard`
  is taken away;
* a real pointer drag rubs out in normal mode and is silent in Committed mode;
* the page does not scroll at 1280x720, 1366x768, 1920x1080 or 1100x700, with
  the legend open and closed. The legend drawer was moved to the foot of the
  rail for this: it is the only panel that grows, and anything under it was
  pushed out of view when it did.

## 7. Still out of scope

Sound, the draw-on animation, the dark-theme toggle, and persistence of any
kind.


---

# Round three

Four recommendations came in: more decision pressure than three dials, a
"why" before and after each move, a generator that is interesting rather
than merely balanced, and modes that give a reason to come back. About a
third of them were already in the game, and two collided with rules it was
built on. This section records what was decided, what was built in the first
slice, and what is planned but deliberately not built yet.

Two other sessions worked on the repository at the same time: one redrew the
map and the route (`mapsymbols.js`, `routeart.js`), and one built guidance
while routing (`foresight.js`, `advice.js`, `guidance.js`, `tour.js`), which
has its own section after this one. The areas were agreed before any file
was written.

## 1. What already existed

* **"Projected score if you continue"** - the ghost markers in the meters
  (round two) for the next span, and now the forecast from the guidance
  session for the whole remaining route.
* **A best-route overlay** - drawn after the finish since round two.
* **Daily challenge** - `?daily`.
* **A strict mode** - Committed mode.
* **Optional upgrades** - the three technologies already are undergrounding
  and quieter towers. "Reduces future penalties" has nothing to attach to:
  the game has no later phase.
* **A "high-balance" map** - roughly what the Tight difficulty badge marks.

## 2. Decisions

| Question | Decision | Why |
|---|---|---|
| What to deliver | Plan all four, build a first slice | The mechanics and the campaign touch scoring and the balance search; the rest does not. |
| New mechanics | Fixed per-square rules only | The balance search prices every square in advance. A rule that depends on *when* or *in what order* a square is crossed breaks the guarantee that a balanced route exists. |
| Campaign progress | In the address bar | Keeps round two's promise that nothing is stored. A campaign becomes a link. |

## 3. Built: kinds of landscape

`CONFIG.archetypes` lists six kinds. Which kind a map is comes **from its
seed, by weight** (`MapGen.archetypeFor`), so a seed typed in, shared or
derived from a date always draws the same kind and the same map. A kind is
two things kept in two places:

* **the numbers it is drawn with** - changes laid one level deep over
  `CONFIG.generator`, applied by `MapGen.build`;
* **what it must show to count** - `js/archetypes.js`, a test run on top of
  the balance check, never instead of it.

| Kind | Drawn with | Must show | Accepted |
|---|---|---|---|
| Open country | the generator as it was | nothing more | 78% |
| Narrow gap | one gap row, rougher ground, bigger lake | best weakest dial under 73 | 42% |
| Community pressure | the town on the side of the way round | the best route cannot keep community at 90 | 31% |
| Hard crossing | woodland on both river banks | nothing more | 53% |
| Knife edge | town across the way round, wooded banks | no dial on the best route above 85 | 33% |
| The long way round | the generator as it was | the best route costs at most 1.08x the cheapest | 16% (60 tries) |

Acceptance is measured per kind with `node js/archetypes.js --seeds 300`,
which also prints the chance a player is shown the fallback instead. The
worst is Community pressure at about 1 in 8,000.

Three generator options were added, all off unless a kind asks:
`river.banks`, `town.side: 'gap'`, and `build(seed, params)` itself. None
adds a cell type or changes the `features` shape, so the map art needed
nothing. `plantBanks` hashes its own salt rather than drawing from the shared
stream, so switching it on does not move the road or the gap.

Two things considered and dropped, on measurement:

* *"All three dials near the threshold"* on the plain generator was accepted
  0.3% of the time. It needed the town moved across the way round before it
  could exist at all, which is why Knife edge borrows Community pressure's
  town.
* *"The best route uses the funding"* (tested by removing the grants and
  re-searching) was accepted 1-7% of the time and doubled the check's cost.
  The long way round replaced it.

**The kind is held through rerolls.** A fresh landscape, today's and this
week's all settle the kind on the first seed and step over seeds of any other
kind without building them. Without that, rerolls drift towards the kinds
that are easiest to accept: over 2026 the plain kind took 59% of the days
against the 37.5% its weight gives it. With it, 131 days against 137
expected.

**Consequence worth knowing:** a seed shared before this round that now
falls on a particular kind draws a different map than it did. Open-country
seeds draw exactly the map they always did (checked in the self test). The
fallback seed `9MA7JX` is Open country and still accepted.

## 4. Built: This week's landscape, Blind mode, the route so far

**This week's landscape** - `?weekly` and a top-bar button. The seed comes
from the ISO week in UTC (`MapGen.weekUTC`, weeks start Monday and belong to
the year of their Thursday), through the same deterministic walk as the
daily one, and it is always one of the particular kinds. Over 2026: all 53
weeks accepted, none on the fallback, none repeated.

**Blind mode** - a switch beside Committed mode. `state.blind` lives in
`game.js`; `summarypanel.js` puts `data-blind` on the app shell until the
connection is energised, and the stylesheets hide every reading of the score
under it: the meters (`display: none`, so their `aria-valuetext` is not read
out either), the tooltip preview, the forecast, and the guidance session's
mood lines. The land and what each kind of ground costs stay visible - those
are facts about the map. The reveal and the verdict arrive on the same move.

**The route so far** - `js/summary.js` (pure, Node-tested) and one line under
the meters that opens into ground crossed, technology used, and which dial
would decide the verdict if the route finished now. Facts only. The "why"
sentences - sensitive ground ahead, no budget left for the final approach -
belong to the guidance session's forecast and explanations, and are not
repeated here, so a screen reader never hears the same news twice.

**Rail height.** Measured with both sessions' additions in at 1280x720, the
rail first overflowed by 343px. The summary became a closed drawer inside
the Points panel, and the two switch hints moved to `aria-describedby` plus a
hover title, and the guidance session compacted its forecast block. With the
drawer closed the rail now fits exactly at 1280x720 and above; opened, it
scrolls inside the rail. The page itself never scrolls.

## 5. Planned, not built

**Decision pressure, as fixed per-square rules.** Each is a cost set when the
map is made, so the balance search still prices it:

* *Season* - a map-wide condition drawn from the seed: in a wet season river
  and woodland cost more, in a dry one hills do. Shown as a badge beside the
  kind.
* *Visual impact* - a community penalty on squares next to houses, not only
  on the houses. Precomputed per square, so the search sees it.
* *Consenting risk* - a per-square cost on corridors a planning authority
  has flagged, drawn as a hatched overlay.

Each needs `score.js` and `balance.js` to read a per-map cost table instead
of `CONFIG.cellTypes` alone, which is the first step and the one to agree
with whoever holds those files.

**Campaign.** Three to five landscapes of one region, all in the address:
`?campaign=REGION&stage=3&scores=73.1,70.4`. The region name seeds the stage
seeds, so a campaign is a link. The portfolio score is the mean weakest dial
against the mean par. Nothing is stored.

**Smaller ones.** A detour penalty for a Hard mode (a fixed cost per span
beyond the shortest route, so it stays a per-square rule); `&blind` in the
address so a blind challenge can be shared; a kind picker for players who
want a particular kind.

## 6. What was checked

* `node js/archetypes.js --self-test --calendar` - 67 checks: the kinds in
  CONFIG, seed-to-kind proportions over 8,000 seeds, each generator change
  visible in the maps, one map of each kind accepted within its tries with its
  best route traceable, ISO week edges, every day and week of 2026.
* `node js/archetypes.js --seeds 300` - the table in §3.
* `node js/mapgen.js --self-test` 71, `node js/summary.js` 13, the score self
  test 12, and the guidance session's `node js/foresight.js` 82 - all passing
  on the new maps.
* `node js/balance.js --seeds 500` now reports 66.2% accepted, median weakest
  72.5. That sweep judges every kind by the plain balance check only, so the
  drop from 74.6% is the harder kinds, not a regression. The difficulty bands
  in `CONFIG.difficulty` were left alone; Narrow gap maps are always Tight by
  construction.
* In headless Chromium off `file://`: a seed shows its kind; the best route
  played through the game finishes on par; the summary counts; Blind mode
  hides the meters and forecast mid-route and brings them back on the
  finishing move; `?weekly` and the button give the same landscape twice; 12
  fresh landscapes all accepted as their own kind; no console errors; no page
  scroll at 1280x720, 1366x768 and 1920x1080.


---

# Guidance while routing

Built alongside round three, in its own files. The brief was two lists of
UX improvements:

* **Route feedback while drawing.** Highlight the best remaining corridor,
  show a projected verdict while dragging, colour the route as it moves into
  good or bad ground, and explain local penalties such as a road crossing or
  a river detour where the pointer is.
* **Accessibility and clarity.** A quick tour for first-time players, clearer
  labels for what each technology does on each kind of ground, a keyboard
  route preview and an "explain last move" command, and notes explaining why
  a dial is low.

The complaint behind both: the player had to finish the route and hope.

## 1. Decisions

| Question | Decision | Why |
|---|---|---|
| How much to reveal mid-route | **A number and a verdict, never a route** | The best route found is already offered after the finish, and the code says why only then: before it, it is an answer key. Asked for "the best remaining corridor", the game gives the best *score* still reachable instead. |
| How the tour knows someone is new | **It opens on a bare address** | The game stores nothing, and PLAN has promised that twice. The address gains `?seed=` as soon as a landscape loads, so a reload or a shared link never reopens it. A bookmark to the bare page does, which is the price of storing nothing. |
| Scope | **Everything in both lists** | |

## 2. The best finish still open

A "projected verdict" read off the current dials would be worthless: every
dial starts at 100, so it would say "balanced" for most of every route. The
honest projection needs to know what is still *reachable*, and the balance
search already knows how to find that.

`js/foresight.js` runs the same search from the highlighted square instead
of the generation site, carrying the totals already spent, with the line's
own squares closed. It borrows the search's parts through `Balance.core`
rather than copying them: `limitsFor` was pulled out of `explore` for this,
and nothing on the generator's path changed. So on an empty board the
forecast *is* par, to the decimal, and the self test holds it to that on
eight seeds.

Two properties make it trustworthy, and both are tested:

* following the best route found keeps the forecast at par on every span to
  the finish;
* no span can raise it, across 48 random walks that never step west. The
  forecast before a span already counted every way that span could be built.

Below `DEFAULT_FLOOR` (55) the figure is not exact, since a state thrown away
for overspending might have finished a whisker better. So the forecast says
"below 55", the same rule `Balance.verdict` applies before it quotes a
number. A second, yes-or-no pass tells "below the floor" apart from "no way
through at all".

Cost: 3.6 ms on average, 34 ms at worst, measured across 901 forecasts. It
runs synchronously after every span, drag steps included, and a whole span
including the repaint came to 45–55 ms in headless Chrome.

`game.js` keeps one reading per route length, so undo hands the previous
reading back without searching, which matters on a backward drag. Comparing
the reading before a span with the one after gives the span's **mood**:
kept, slipped (at least `guidance.slipNotice` points lost), lost (the
balanced verdict went), or blocked.

## 3. What each item became

| Asked for | Built |
|---|---|
| Best remaining corridor | The forecast under the meters: best weakest dial still open, and the verdict it would earn. Deliberately no route. |
| Projected verdict while dragging | The same forecast, recomputed on every span a drag lays. The status line speaks the moment a span costs something that cannot be got back. |
| Path colour by zone | Spans that slipped are washed amber with the loss on a badge; a span that lost the verdict is washed red and marked `!`. The pulsing ring on the square in play takes the outlook's colour. Done on the board cells, not in the SVG, so `routeart.js` was not touched. |
| Local penalty tooltip | Every `cellTypes` entry has a `tip` line, such as "Road crossing: closures and disruption cost community support". The tooltip also lists the square's numbers on all three technologies. Arrows into water, off the map or back into the line are drawn dashed. |
| First-time tour | `js/tour.js`: five steps, spotlight and card, modal (veil, Tab kept inside, Escape closes, shortcuts swallowed), and a Tour button. |
| Technology per terrain | Each technology button shows one span on the highlighted square. The legend gains a line on what each technology multiplies. |
| Keyboard preview | Shift + arrow on the highlighted square: the status line names what lies that way and what a span there costs, and the arrow and the tooltip mark it. Nothing is built. |
| Explain last move | **Explain**, or `E`: the span's ground, technology and cost, which way it sends the line and onto what, which dials moved, and what the forecast did. The direction sentence matters: a cheap farmland span pointed into designated land is where the points went, and without it the explanation blamed the farmland. |
| Why a dial is low | **Why?** beside any meter under 100: points lost grouped by ground and technology (`Score.contributions`), worst first, plus a per-dial hint from `dials[*].whyHint`. Hover or focus shows it; a click also speaks it. |

## 4. Layering

`foresight.js` and `advice.js` are pure, load under Node, and have self
tests. `guidance.js` holds no state and decides no rules: it dresses the
meters, buttons, board and tooltip that `render.js` built, so there is still
one of each. Two hooks were added to `render.js` for it:
`Render.decorateTip`, and `data-dir` on each arrow. Every word is in
`CONFIG.copy`.

Blind mode (round three) sets `state.blind`: the mood sentences, the span
tints and the score half of Explain go quiet, and `css/guidance.css` hides
the forecast and Why?. Terrain numbers stay, because they are land facts.

## 5. The rail budget

At 1280x720 the rail was exactly full before this round. The first version
of the forecast block pushed it 90 px over. The block now shares one row
with a short **Explain** button (full label on hover, spoken, and on `E`),
the line reads "Consent still within reach" while that is true, and the
technology hint is one line. Measured with round three's changes in: 0 px
over at 1280x720 and 1366x768, 14 px at 1100x700. When the balanced verdict
is lost, the forecast line grows to two lines and the rail scrolls by 9 px
at 1280x720 (measured).

One page-scroll bug turned up while measuring, and it was nobody's line
alone. A visually hidden label inside the scrolling rail has no positioned
ancestor, so it was placed against the page. Once the rail overflowed, it
made the whole page scroll. `.rail { position: relative }` in
`css/guidance.css` fixes it for every such label.

## 6. Not done, deliberately

* **Ranking the arrows.** Marking which arrow keeps the best finish is the
  answer key again, one square at a time.
* **Remembering the tour was seen.** See §1.
* **Warnings on neutral ground.** Only spans that lose points are marked. A
  green wash on every good span would cover the map and teach nothing.

## 7. What was checked

* `node js/foresight.js --self-test`: 82 checks. `node js/advice.js
  --self-test`: 20. The score self test now includes the grouped-points
  assertion (12). `node js/mapgen.js --self-test` still passes (71).
* In headless Chrome off `file://`, 26 checks: the forecast equals par on
  load; the best route found, played through the game, keeps it at par to
  the finish with no span marked; a direct line through designated land gets
  lost/slipped marks, the red ring and the status sentence; `E` explains with
  the direction; Why? lists the designated land first and speaks on click;
  Shift + → looks without building; the tooltip carries the note and the
  technology table; arrows carry their direction; no page scroll at
  1280x720, 1366x768, 1920x1080 or 1100x700; the tour opens on a bare
  address, walks five steps on Enter, swallows `1` while open, and Escape
  returns focus to the map; a named landscape never opens it; no page
  errors. The tour was also checked by eye at 390x844 and 900x700.

## 8. Known limits

* The forecast inherits the search's west-free view. A route that doubles
  back west can make it read low, and then rise once the line turns east
  again. Such a rise is shown as "kept", never as good news.
* A long explanation wraps the status line to two lines, which shrinks the
  map by a few pixels while it is showing.
* `js/game.js` is past 1,000 lines with both rounds' hooks in it. The
  forecast bookkeeping (`forecastNow`, `settleForecast`, `speakMood`,
  `moodsFor`) is the obvious candidate to move out if it grows again.
