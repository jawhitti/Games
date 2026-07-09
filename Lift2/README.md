# Lift 2 — flow-first core (towers, pumps, goo, firemen)

Flow-first personal-finance sim: water (money) moved by pumps (income,
expenses, compounding assets) between towers (savings), against goo (debt)
that spreads on its own and destroys assets unless firemen spray water to
hold the line — where every drop spent defending is a drop you can't build
with.

Replaces the balloon prototype (`../Lift`): the balloon rendered altitude (a
stock) but not flow (a rate); this design is built on flow from the ground up.

## Layout

- `src/config.js` — every tunable + the instrument catalog (the 3-property grid)
- `src/sim/sim.js` — pure sim core; `createSim({seed, config})`
- `src/debug/main.js` — crude playable canvas readout, not real art
- `test/` — compounding stability, net-flow/runway, goo dynamics, the
  instrument grid's truth-seams, defend-vs-build triage, determinism

## Run

```sh
npm install
npm test        # vitest
npm run dev     # vite → open the printed URL; ?seed=N picks a session
```

## Controls (isometric readout)

Hover a tile to highlight it, then build there: `r` rental (cash) ·
`h` house (mortgaged) · `c` car (financed) · `i` invest 5.
Click a goo blob = send an idle fireman · shift+click = recall one ·
click the investment = toggle reinvest/consume valve · alt+click asset = sell ·
`l` bank loan 10 · `d` draw credit 5 · `x` cut lifestyle expense ·
`space` pause · `[` `]` speed · `0` restart · `n` new seed

## The two rules

1. **Two substances only.** Water is money; goo is debt; they never mix.
   Goo compounds at its spread rate (rate = visible speed) and is paid down
   1 water : 1 goo by firemen — water that builds nothing else.
2. **Stock and flow never merge.** Towers only hold; pumps only move. The
   self-feeding pump (speed ∝ level of the tower it fills) is the compounding
   primitive; every quantity that compounds lives in log space.
