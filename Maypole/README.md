# MAYPOLE (working title)

Puzzle-platformer where the level is a 4-dimensional building and the only
verb besides walking is rotating it. The player lives on the w=0 cross-section.
Maypole planes (xy, xz, yz) reorient; monkey-bar planes (xw, yw, zw) re-cut
the cross-section — and a 180 through w mirrors the world's handedness.
The word "4-D" is never said.

Plain JavaScript. Pure headless core (Node/Vitest) + thin Three.js renderer.

## Layout

- `src/core/vec4.js` — R^4 vectors, 4x4 matrices
- `src/core/so4.js` — plane rotations, maypole/monkey-bar split, the finite
  rotation group (order 192), handedness detection
- `src/core/slice.js` — (R·cell) ∩ {w=0} → convex polyhedra; exact at rest,
  continuous mid-swing
- `src/core/gravity.js` — g = R·g0 decomposed into screenDown / loom / wash
- `src/core/level.js` — level data model (§7 format) + validation
- `src/core/verify.js` — reachability BFS over (playerCell, R)
- `levels/` — level data; every level ships with passing verification tests
- `render/` — Three.js layer (not yet built)

## Run

```sh
npm install
npm test
```

## Verifier notes (v1)

The walk relation is gravity-blind (any touching present cell), so
reachability is an upper bound: a level proven UNREACHABLE is truly
impossible — the guarantee sealed rooms and chirality locks need. Positive
reachability may still require gravity-aware refinement to guarantee a
human can actually walk the path.
