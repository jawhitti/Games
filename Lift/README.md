# Lift — Layer 1: simulation core

Headless, log-space simulation of Lift's core loop — balloons (capital) produce
lift (returns) against load (creatures) under drifting rain (income) and
continuous entropy (upkeep), stable to millions-fold growth, playable as gray
circles.

## Layout

- `src/config.js` — every tunable, one file
- `src/sim/sim.js` — the pure sim core (no DOM, no I/O); `createSim({seed, config})`
- `src/debug/main.js` — crude canvas readout, not the real UI
- `test/` — numerical-stability and behavior tests

## Run

```sh
npm install
npm test        # vitest
npm run dev     # vite → open the printed URL; ?seed=N picks a session
```

## Debug readout keys

`b` buy balloon · `1–5` swap balloon (loses its compounding) · `p` passenger
(cash) · `f` financed · `d` financed + depreciating · `c` crew for the worst
entropy kind · `x` shed heaviest creature · click map to fly · `space` pause ·
`[` `]` time speed · `r` restart · `n` new seed

## The one rule

Balloon size lives in **log space** (`logVolume`, natural log). Growth is
addition on the exponent; linear volume is materialized only at boundaries
(lift, rain, prices) via `exp`/`log1p`. Renderers get a bounded `displaySize`,
never raw volume.
