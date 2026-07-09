# Balance (AlgebraCubes)

Learn algebra by **manipulation**, never by being told the rules. An equation is a
row of cubes; you drag, combine, and transform them, and a wordless 👍/👎 tester
tells you when a statement is true. The name is deliberately *not* "algebra" — the
game hides the math behind emoji.

Plain JavaScript, Vite + Vitest. Hard **engine / renderer split**: the engine is
pure (exact math, zero DOM); the renderer does no math.

## The idea

- **Every token is its own cube** — numbers, variables, operators, and `=`.
- **Values render as emoji** (digits → animals, `x` → ☀️, `y` → 🌙), proving the
  engine/renderer boundary: the meaning (`[🌸][🐶]` is still 12, positional) is
  untouched; only the *look* changes.
- The equation is **symbolic / lexical**, not evaluated — `3/2` is literally the
  cubes for 3, ÷, 2 until you choose to simplify (candy-crush "show unevaluated,
  then collapse with a flourish").
- A left-side **editor tray** composes an operation that then applies to **both
  sides**; a **history** stacks each step so you can inspect and undo.

## Two ideas worth preserving

- **Negate and invert are graphical involutions.** A white corner-dot + a flipped
  glyph encodes sign and reciprocal: negate = mirror (dot moves left), invert =
  flip upside-down (dot moves down). Together they're the **Klein four-group**
  (two commuting involutions), so `−1/x` falls out for free. You *perform* the
  involution (the `×(−1)` / `invert` buttons) rather than writing a symbol.
- **Adjacency multiplies** — unless two neighbours are same-orientation digits,
  which concatenate. So `2x` is `[2][x]` (no `×` cube), `n(…)` drops the `×`, and a
  run of digit cubes is one positional numeral. The only surviving `×` cube sits
  between two bare numbers (so `2×3` can't be misread as `23`). `−` is gone
  entirely: `a − b` is `a + (−b)` via the negate dot.

## Layout

- `src/rational.js` — exact bigint rationals (no floats).
- `src/engine.js` — pure `Equation -> {equation, delta}` ops (cross, gather,
  scale/wrap both sides, distribute, combine, negate/invert a term, `isSolved`…).
  Fully unit-tested.
- `src/main.js` — the entire SVG UI: cube layout, drag/selection, the editor tray,
  history, the truth-tester, and the emoji/dot render boundary.
- `index.html` — single SVG stage.
- `test/engine.test.js` — engine tests (25+).

## Run

```sh
npm install
npm test
npm run dev   # open the printed URL
```

## How you play

Drag a term across the `=` to cross it (its sign flips); drop it on a like term to
combine. Build an operation in the tray (grab cubes from the pinned `×`/`+` dock or
copy them out of the equation), then apply it to both sides. `×(−1)` and `invert`
flip the shape of a selection. **simplify** distributes and combines, writing the
unevaluated intermediate step into history. Solve when `x` stands alone (coefficient
1) on **either** side.
