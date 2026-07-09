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

## Modeling notes (advisor-sim fidelity)

The intended use is a **sandbox**, not a game: *"here's your situation now — plunk
down the house you want to buy and watch what happens."* For the projection to be
truthful rather than rosy, the water/goo picture needs the refinements below. These
supersede the loose "goo = interest" framing above.

### Goo is any drag on cash flow — and it splits by *fate*

Goo is **not** just interest; it's *any* drag on cash flow — all of PITI, rent,
upkeep, lifestyle. For the first question the sim answers (*will I drown this
month?*) lumping it is correct: water leaving is water leaving. But the honest model
must split goo by **where the water goes**:

- **Evaporating goo** — interest, taxes, insurance, rent, upkeep: water that leaves
  and is **gone forever**.
- **Transferring goo** — the **P in PITI** (mortgage principal): leaves your liquid
  tank but lands in the house's (locked) equity tank. Same drag on cash flow this
  month; **opposite** consequence for wealth. Principal is a drag on cash flow but
  not a *cost* — it's forced savings into a locked tank.

Why the split is load-bearing:
- **Rent vs buy at the same payment aren't equal.** The renter's payment is 100%
  evaporation; the owner's principal is water banked into equity. Cash-flow-drag
  alone says they're identical; the fate split shows they aren't.
- **It's what makes the four-square scam visible** (see below): stretching a loan's
  term lowers the payment *and* shifts its composition toward evaporation.
- The truly honest lifetime number is the **area under the *evaporation* curve**
  (total interest + tax + insurance over the life), not total cash out — because the
  principal comes back as (illiquid) equity.

There's a second, weaker cut — by **incidence**: *rate-on-a-stock* goo (interest,
which shrinks as the debt tank drains) vs a *fixed drip* (property tax, insurance,
HOA — constant, indifferent to any tank). It governs the leak's shape over time but
matters less than the fate split.

### The honest number is the area, not the stock or the flow

Neither the lagoon's size nor the stream's height is the truth. Three quantities,
and the whole of predatory finance lives in the gaps between them:

- **Stock** — the debt tank's size (≈ price financed). *Naive error:* fear this
  ("a $400k mortgage is terrifying"). The flow-first correction fixed this error.
- **Flow** — the payment; the height of the goo stream right now. *Four-square
  error:* watch only this. A comfortable height hides everything else.
- **Integral** — total (evaporating) goo before the tank drains = flow × drain-time
  = **area under the leak curve.** This is the honest figure, and it is neither the
  peak stock nor the instantaneous flow.

The hidden dial that decouples flow from integral is the **term (drain time).** A
longer term thins the stream (lower payment) but the tank leaks for more years, so
the **area grows.** The four-square worksheet is a *shape trick on this curve*:
lower the height, widen the base, keep or grow the area — the buyer watches the
height and loses on the area.

The ugliest four-square move the model shows for free: **negative equity rolled
forward.** Trade in before the old debt tank drained and the un-emptied tank is
**poured into the new one** — the new debt tank starts *bigger than the new asset*
(underwater) while the payment still looks comfortable. Same visible flow; a debt
tank overtopping the asset it's tied to.

> One-sentence model: **goo splits by fate into burned vs banked, and every
> predatory-finance trick raises the burned fraction while lowering the flow you're
> watching.**

### Liquidity: not all tanks are tappable

For "plunk down a house," the *first* event is a **liquidity** event, not a
cash-flow one: the liquid tank (checking/savings) craters by the down payment +
closing, instantly. Survival then depends on how much **routable** water is left —
and here's the gap: **home equity is not routable water.** You can't spray a locked
growth tank on a goo spike without selling. So the model needs **tank tappability**:

- **Liquid water** — spendable/routable now.
- **Locked water** — home equity, retirement: can't fight a leak without a sale.

This is how real people blow up — asset-rich, cash-poor, one shock forces a sale at
the worst time. If every tank is equally tappable, the sim will cheerfully report
"fine" when the player is one water-heater failure from a forced sale. Corollary:
**appreciation is inert until realized** — a rising locked-tank level does nothing
to help you survive a goo spike; it helps net worth, not flows, until rent (open the
tap) or sale (drain the tank).

### Amortization is emergent (a reason to build the model)

The flow model *produces* an amortization curve with no special code, if
"neutralize" and "shrink" are distinct routes: the debt tank leaks interest-goo at
rate r; routing exactly enough water to neutralize the leak leaves the tank
unchanged (**interest-only, treading water**); routing *more* than the leak shrinks
the tank (**principal**). Early on almost all routed water just holds the goo line;
as the tank shrinks its leak shrinks, so a fixed payment bites more each year. The
curve falls out of the physics — the sim *shows* what a spreadsheet only tabulates.
