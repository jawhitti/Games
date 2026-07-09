# Bonsai

One deliberate change per real calendar day, on a tree that grows slowly over
months. A long, patient project — just like the real thing. Abandoned trees are
expected and fine. When a tree is beautiful, export a timelapse of its whole
life as a `.webm` to share.

Plain JavaScript. Pure headless sim core (Node/Vitest) + a thin canvas renderer.

## The core bet

A tree is a **deterministic function of (seed, action log)**. That single
choice earns three things at once:
- **Apical dominance is real.** Left alone, the leader hogs growth and the buds
  below sleep; the tree runs leggy and up. Cutting or pinching the leader
  RELEASES the suppressed buds — "clip and grow", the actual craft of bonsai.
  If this weren't real the game would just be "watch a tree get bigger".
- **The timelapse is free and truthful.** It's not recorded video — it's the
  action log re-simulated at speed, so it can never drift from the tree you
  actually grew. `.webm` export captures that replay.
- **A saved tree is tiny:** just `{ seed, actions }`.

## Layout

- `src/sim/config.js` — every growth tunable (seasons, apical strength, wood)
- `src/sim/tree.js` — the growth model; `createTree({seed})`
- `src/sim/game.js` — action log, one-change-per-day rule, replay
- `src/render/` — canvas drawing + playable readout with timelapse/record
- `test/` — growth stability, apical dominance + release, deterministic replay

## Run

```sh
npm install
npm test
npm run dev   # open the printed URL
```

## Controls

Click a branch tip to select it. Make ONE change — prune, pinch, or wire —
then advance the day (the real game gates this on the wall clock; here it's a
button). `▶ timelapse` replays the whole life; `● record` saves it as `.webm`.

## Tuning history (hard-won — read before touching the growth model)

The organic growth was fiddly. Fixes that landed during development:
- **Runaway growth** → *saturating couplings*: bound the feedback between segments
  so growth can't explode exponentially.
- **Witch's-broom (tips exploding into dense clusters)** → *apex guard*:
  `if (seg.isTip) continue` — a tip must not recursively spawn children.
- **Performance** → a *binned suppression field* (spatial grid) instead of
  all-pairs segment interactions.
- Tuned toward: much more branching / bushier, ~10× tips, branches biased to grow
  **upward** more aggressively, branch **thickness increasing more slowly**, and
  wire/prune effects applied **instantly** (the player must see the result the
  same day, not weeks later).

## Known issue (open)

**Growth stalls** — "at some point the tree stops growing at all." This recurred
during development and was never fully resolved. Start any revisit by auditing the
growth / termination condition — most likely a saturation or suppression-field
threshold that clamps everything to zero once the canopy fills in.

