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

## Model correction (worked out after the build)

The prototype above still leans on the **stock** as the threat — goo is a
quantity you spray down. A later session concluded that's the wrong emphasis.
**Nobody drowns because their debt *number* is large — they drown because the
interest gushing out of it outruns what their assets trickle in.** The thing
that matters is the **flow**, not the size of the lagoon.

The corrected framing:

- **Tanks are reservoirs (stocks); goo and water are the taps (flows).** The
  assets lagoon leaks water at ~**4%/yr**; the debt lagoon leaks goo at ~**8%/yr**
  (water and goo still stay **1:1**).
- **The 4-vs-8 asymmetry is the entire engine.** Per dollar, debt gushes twice as
  fast as assets trickle — a dollar of debt hurts you twice as hard as a dollar of
  assets helps.
- **You can't dodge flow by distance.** Goo is proportional to its tank, so a big
  debt lagoon *anywhere* still pours at 8%. The only way to slow the goo is to
  **shrink its source** — pay down principal — which is the satisfying loop:
  paying debt visibly cuts the flood. (This retires the old "just build your
  sludge ponds far away" escape hatch.)

### The engine: a bistable tug-of-war

Cross-connect the two tanks — water services debt, goo eats assets — and the
asymmetry produces a knife-edge, not a gentle drift:

- At equal tanks, goo (8%) drains faster than water (4%) pushes back → **goo wins**.
- Break-even is where the flows match: `4%·assets = 8%·debt` → you need roughly
  **2× assets for every 1× debt** just to hold even. Below that ratio goo wins;
  above it, water wins.
- It's **positive feedback both ways:**
  - goo winning → unmet goo compounds the debt tank → more goo next tick →
    **death spiral**;
  - water winning → surplus pays down debt / grows assets → less goo →
    **wealth spiral**.

The same machine runs you to bankruptcy *or* to riches depending which side of the
**2:1 tipping point** you're on, and once tipped it *accelerates*. Every player
action — pumps, firemen, restructuring — is really about nudging the **ratio**
across the tip, never about the absolute size of either lagoon. **This is the
design to build toward on any revisit.**

### The instrument taxonomy

Everything the player builds is assembled from three parts — a **growth tank**
(appreciates), a **water tap** (throws off cash), and a **goo leak** (negative
cash flow) — plus **valves** that open/close taps and **routing** decisions. The
menu:

| Instrument | Growth tank | Water tap | Goo leak | Notes |
|------------|:-----------:|:---------:|:--------:|-------|
| **Job** | — | ✔ steady | — | A fresh water source that emits **no** goo. |
| **House (owned)** | ✔ | — | ✔ | Appreciates but throws off no cash; still leaks goo (upkeep/interest/tax). |
| **House (rented)** | ✔ | ✔ | ✔ | Same house — the **rent valve** opens the cash tap. |
| **Stocks** | ✔ (higher/variable rate) | optional | small | A growth tank you can set to reinvest or consume. |
| **Student loan** | — | — | ✔ | Adds to the goo pond **but permanently widens the Job's water tap** — the one *good* leverage. |
| **Consumer debt** | — | — | ✔ | Goo that only ever leaks. The mirror of the student loan. |

Two structural notes this table encodes:

- **An asset is not one thing.** It's a growth tank + a goo leak with an
  *optional* water tap; **renting is a valve** (same primitive as reinvest/consume)
  that opens the tap. Appreciation and cash flow are independent outputs.
- **Good vs bad leverage falls out of *where the debt points*,** with no
  special-casing: "add to the goo pond" is one action, but a student loan also
  fattens a tap while consumer debt does not.

### Routing: the core verb

Goo flows through a **sewer pipe to a treatment facility**, and the player decides
**how much clean water to send to treat it.** Water routed to treatment is water
that isn't compounding — so debt service *is* the defend-vs-build triage, made
continuous. The full verb set is small: **build** an instrument, **valve** it
(rent? reinvest?), **route** water (how much to treatment vs the growth tanks).

### Deliberately omitted: taxes

Taxes are cut on purpose. They don't fit the instrument model because they aren't
an instrument — they're a **leak on the flows themselves** (a tap on Job water;
another on realized growth), and the real game of taxes is *routing to avoid them*
(tax-advantaged accounts), which would need a whole second treatment layer. Out of
scope for the core dynamic. The one place the omission shows: without taxes there's
no real-world reason to prefer slow-appreciation / no-cash-flow assets (unrealized
gains going untaxed). That's the seam if taxes are ever added.

## The model (minimal core)

The intended use is a **sandbox**, not a game: *"here's your situation now — plunk
down the house you want to buy and watch what happens."* The whole model is small —
resist the urge to grow it. It's a **gravity plumbing** picture:

- **Sources sit uphill.** A job is a spring — fresh water, no goo — feeding down.
- **Water tanks and goo tanks sit downhill.** Both **compound at their own rate**
  (water tank ~4%/yr, a debt/goo tank ~8%/yr). Rate = visible speed.
- **The only action on goo is to pour water into it to dissolve it, 1:1.** Pour is
  the payment.
- **Assets are separate.** A house/car/business sits upstream and appreciates (or
  not) on its own; *its growth is unrelated to the water/goo plumbing.* An asset
  touches the plumbing only through a **valve** — open a tap (rent → a water source)
  or dump the tank (sell → a slug of water).

That's the entire model. The equation behind a goo tank is just `dB/dt = rB − pour`.

### Everything else is emergent — do not track it

The refinements an earlier draft made into machinery all fall out of the plumbing
for free. They are consequences to *observe*, not quantities to *store*:

- **Principal vs interest.** Pour exactly the goo's growth → tank flat (interest-only,
  treading water). Pour more → tank shrinks (principal). No "fate tag" on any dollar
  — the split is just whether your pour beats the leak.
- **Equity.** Not a tank. Derived on demand: `asset value − goo level`.
- **Liquidity / lockup.** *Topological.* An upstream asset with no open downhill pipe
  can't be routed — that *is* illiquidity. Appreciation is inert until you open a tap
  (rent) or dump the tank (sell). "Asset-rich, cash-poor, one shock from a forced
  sale" is just a locked asset above a draining water tank — drawn, not ruled.
- **The four-square / total cost.** Total water poured over a goo tank's life *is*
  the honest number (the area). Pour slower (lower payment) → goo compounds on a
  bigger balance longer → you pour **more** total. `pour × time` rises as `pour`
  falls, so the stretched-term scam emerges from the one equation — you never model
  "term" at all.
- **Underwater / rolled negative equity.** `asset value < goo level` — two numbers.
  Sell before the goo drained and the leftover goo merges into the next tank.

The one thin pipe that *must* exist: an asset is **collateral** for its own goo, so
**dumping an asset dissolves its own goo tank first**, remainder to your water tank.
Otherwise you could sell the house and keep the mortgage. Appreciation stays
decoupled from the flows; only the *sale* is wired to the lien.

## Rendering (the actually-hard part)

The model is easy; making it *appealing* is the work. The target is **SimCity-ish**:
**assets on the surface** — houses, cars, businesses as little buildings you place —
over a visible **subterranean network of water and goo pipes, pumps, and valves.**
You watch water flow downhill from job-springs, pool in tanks, and get poured into
goo to dissolve it; you build and toggle the plumbing. The surface reads as a life;
the underground reads as its cash flow. Nailing that split — legible plumbing that's
also nice to look at — is the open problem, not the sim.

### Prototype: `proto/iso-edit.html`

A self-contained canvas prototype (open in a browser) that proves the rendering
paradigm is reachable. Not coherent yet — a vertical slice, not a design:

- **Isometric tile grid** with **segment-by-segment pipes** (each tube is tile-center
  → shared-edge, so straights / elbows / tees / crosses emerge from the connections).
- **Editable:** tool palette to drop Job / Savings / House+Mortgage / Lagoon on tiles
  and click-drag two independent networks — a **water supply** (blue) and a **goo
  sewer** (green).
- **Goo lives in a cistern under the leveraged asset.** Water piped to the house
  dissolves it; connectivity-gated (`dB/dt = rB − pour` runs only when actually
  plumbed).
- **Overflow destroys the asset.** Pour below the interest with no sewer → the
  cistern overtops, floods the lot, and the goo eats the house (cracks → sinks →
  `FORECLOSED`). Plumb the sewer to the Lagoon and the excess drains off safely.
- **Surface / Underground view toggle** — the tidy neighborhood vs. the plumbing
  truth beneath it.

Known-incoherent: single hardcoded mortgage loop (not per-instrument economics),
plain geometric building art (the sprite-polish ceiling), global flow-direction
animation. All incremental; none are walls.
