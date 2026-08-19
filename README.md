# Connecting the Grid

A browser game about routing a new electricity transmission connection across
a map, and living with what it costs in money, environment and community
support.

The player lays a chain of track pieces from the **generation site** on the
left edge to the **demand centre** on the right, choosing a technology for
each segment. Three dials react to every piece placed. When the line is
energised, the weakest dial decides the verdict.

No build step, no dependencies, no server. Open `index.html` and play.

## Running it

```
open index.html          # macOS
start index.html         # Windows
```

Straight off the disk over `file://` is a supported way to run this. The
scripts are plain classic scripts rather than ES modules for exactly that
reason — module scripts are blocked by CORS on `file://`.

## Running the tests

The scoring engine is pure maths with no DOM access, so Node can load it
directly:

```
node -e "require('./js/score.js').selfTest()"
```

It checks the two scoring assertions from the brief plus a map sanity check
(dimensions, legend coverage, reachable endpoints). To run the same suite in
the browser console on load, set `debug.runSelfTestOnLoad` to `true` in
[js/config.js](js/config.js), or just call `Score.selfTest()` from the console.

## How the game works

**The route.** Every piece fills one square and has exactly two open ends.
The chain therefore has exactly one loose end at any moment, and that loose
end determines both which square the next piece goes on and which side of it
must be open. There is never more than one legal target square — the player's
choice is *which shape* to put there and *which technology* to carry it with.

**Scoring.** For each laid segment with land type `t` and technology `k`:

```
cost_i = cost(t) * costMult(k)
env_i  = env(t)  * impactMult(k)
comm_i = comm(t) * impactMult(k)
```

The totals sum across the route and map onto three 0–100 dials:

```
costDial = clamp(100 - (totalCost / COST_BUDGET) * 100, 0, 100)
envDial  = clamp(100 + (totalEnv  / ENV_FLOOR)   * 100, 0, 100)
commDial = clamp(100 + (totalComm / COMM_FLOOR)  * 100, 0, 100)
```

`totalEnv` is always zero or negative. `totalComm` can go positive, because
connection customers and community benefit land add to it — the clamp handles
that. Note that `impactMult` scales positive community effects down too, not
just harm: undergrounding through a community benefit site earns less credit.

**Rules.** The route may not revisit a cell, may not cross open water, and
must pass through a substation to be energised. Underground cable cannot be
taken through a river.

**Verdicts.** When the line reaches the demand centre, the lowest dial picks
the verdict. If every dial finishes at or above `balancedThreshold` (70), the
player gets the balanced verdict instead.

## Playing

- **Mouse:** click a piece in the palette, then click the highlighted square.
  Palette tiles can also be dragged onto the board.
- **Keyboard:** arrow keys walk a cursor around the board, `Home` and `End`
  jump to the start and the open end, `Enter`/`Space` places the armed piece,
  `Escape` disarms it.
- Every cell, meter and move is described for screen readers, and the status
  line is a polite live region so announcements are not cut off mid-sentence.

## Tuning the game

[js/config.js](js/config.js) is the only file you need to edit to rebalance
anything. It holds the map, every cost and impact number, the technology
multipliers, the scoring budgets, the verdicts and every word of on-screen
text. No other file contains a magic number or a hard-coded string.

The map is written as a picture — nine rows of eleven letters:

```
row 0  FFHHHFFVHHF
row 1  FHWWKFFVKWF
row 2  FFTTTFFVFWF
row 3  FF~SSFFVFTF
row 4  FFFSSFXVFTF     <- generation site at col 0, demand centre at col 10
row 5  FF~SSFFVFTF
row 6  FFWWWFFVFWF
row 7  FBCWWKFVKWF
row 8  FBCWWFXVHHF
```

```
F farmland    W woodland           C connection customer
R road        V river              B community benefit
K rocky       S designated land    X substation
H hills       T houses/industry    ~ open water (blocked)
```

Three deliberate balance decisions live in that map, and are worth preserving
if you redraw it:

- The river fills column 7 top to bottom, so **every** route crosses it once
  and no route can use cable there.
- Columns 3–4 are an impact belt — designated land in the middle, woodland
  above and below, a settlement gap at row 2, clean hills only at the extreme
  top and bottom rows.
- Water at column 2, rows 3 and 5, squeezes the approach to the middle.

There are exactly six pieces because there are exactly six ways to choose two
of four sides. Adding a seventh is not possible; reordering and relabelling
them is fine.

## Layout

```
index.html        markup and script order
css/style.css     all styling; track pieces are drawn in CSS, not images
img/*.svg         terrain and marker icons
js/config.js      all tunable numbers, the map, and all on-screen text
js/score.js       scoring maths and the self test. No DOM, no state
js/render.js      everything that writes to the page. No state, no rules
js/game.js        state and rules. Never touches the DOM directly
```

The separation is strict and worth keeping: if you find yourself deciding
whether a move is legal inside `render.js`, that logic belongs in `game.js`.
