# Paper Victory: The Reign -- design notes

A record of the design decisions made while building the second-half simulator,
each tied to the simulator result that motivated it. This is the "why" behind the
model in `engine.js`. Numbers are directional (see the caveat at the end), not
balance-grade.

The arc in one line: **the king started ~100% unbeatable; six corrections turned
it into a real contest that produces both signature moments.**

---

## Starting diagnosis (before any corrections)

A naive instantiation of the reign had the king winning ~99-100% of games, and
the simulator contradicted the document's own stated worries:

- The doc frets most about the Phase-1 race-to-lose and the safe-flag degeneracy
  (Q3). Neither was the binding problem in the second half.
- The real problems were: (a) no lean driver that survived a round, so secret
  leans never turned; (b) the "called Rebellion" trigger was effectively dead,
  because rebels had no public signal to coordinate on; (c) the royal levers were
  inert (seize/prison changed king survival by <1%).

Two early findings proved robust because they are arithmetic, not model artifacts:
the count is **structurally crown-biased** (king is a guaranteed +1, ties break
to crown), and `castleVerdict` is **two different games** (outright vs trigger),
not a tuning detail.

---

## Decision 1 -- Seize becomes a *threat* to seize (telegraphed)

**Rule:** instead of seizing a debtor's land immediately, the king issues a
**threat to seize**; he actually takes it a later turn unless the noble pays it
down in the grace window. The live threat is a non-decaying grievance and is
itself a threat token (VP if the king falls).

**Why:** an immediate seizure is a one-shot resentment spike that decays away --
useless as a lean driver. A standing threat-to-seize is a **permanent** grievance,
which is what the deposition count needed to ever turn.

**What the sim showed:** the rule's sign **flips on the pay-down cost**
(`seizeRedeemMult`). Cheap redeem (~the missed tax): 79% pay down, it becomes a
pro-king *escape valve* (king survival 99%+). Dear redeem (~the land's value): few
can pay, seizures execute, the grievance accumulates and drives the count to
parity. **Adopt the rule only with a dear redeem cost**, or it helps the king.

**Caveat surfaced:** even at its most brutal, this rule alone couldn't depose the
king -- it pushed the count to a ~50/50 tie, where the structural +1 / tie-to-crown
ate it. The binding constraint had moved from "no lean driver" to "the count is
crown-biased."

---

## Decision 2 -- Leans change *strategically*, not by grudge

**Correction:** the first model flipped leans like a thermostat (depose when
resentment > favor). That was wrong: a player changes their secret alliance to be
on the **winning side**, because the losing faction is purged and scores zero.

**Why it mattered:** a grudge thermostat settles at parity -- which is exactly what
*manufactured* the "~50% ties, the tie rule decides everything" finding. It was a
modeling artifact, not a property of the game.

**What the sim showed:** switching to strategic "back-the-winner" leans dissolved
the tie artifact (19% -> 8%) -- but exposed a deeper problem (Decision 3).

---

## Decision 3 -- The rebellion needs public coordination signals

**Problem:** under strategic leans, the king won 100% and rebellion was 0%. The
only public signal of the secret count was the **flags**, and flags are grants the
king hands out (purge insurance) -- they read "crown" regardless of true intent.
A rational silent table can never see a rebellion forming, so one never does.

**Two signals added, both public mechanical facts (not table-talk):**

1. **Public color bloc.** After the Coronation colors are face-up. Losing-color
   nobles (who backed the wrong color, ate threats) are a *visible* bloc -- the
   natural rebellion nucleus ("we are all black, he is red, there are more of us").
2. **Imminent-victory pressure.** Castle progress now does two opposing things:
   bandwagons the winning-color nobles toward the king, *and* rallies the losing
   bloc ("now or never -- stop him before he completes it").

**What the sim showed:** rebellion viability became monotonic in the color split.
King survival ran 56% / 64% / 73% / 81% / 89% as the burned bloc shrank from
majority to minority. **The reign inherits its difficulty from how Phase 1 ended.**

---

## Decision 4 -- A reason to throw up the rebel flag

**Rule:** flying the rebel flag must *pay*, or no one commits and the bloc never
becomes visible. A rebel-flagger **refuses the king's demands** (keeps coin, denies
the Castle) and earns a **resistance-hero bonus** at the reckoning if the king
falls. The risk is the purge.

**Why:** before this, raising the flag was all risk and no upside, so everyone
clung to crown and the bloc stayed invisible. The tax-refusal is the concrete
now-payoff; the hero bonus is the if-we-win payoff.

---

## Decision 5 -- The king may attack a rebel (the forced gamble)

**Rule:** the king can strike a rebel flag at any time to put down the rebellion --
but the attack **triggers the reckoning**, which he might lose. He decides from
**visible flags**; the count is on **secret leans**.

**Why it is the keystone:** it gives the rebel flag teeth (a dare the king must
answer) and fixes the dead-trigger problem. The flag/lean gap finally bites: a king
who attacks a court of crown-flag *secret* rebels gets deposed by the hidden knife.

**What the sim showed:** the attack became the dominant trigger and a real gamble
-- the king loses ~3% of attacks at an even table, ~9% against a large bloc. It
gets dangerous precisely when the opposition is big.

---

## Decision 6 -- The Mandate cuts both ways (neither flag is safe)

**Correction:** the model had given crown-flaggers a free safety bonus and only
charged a purge-fear to rebels -- i.e. "backing the king is a safe ticket," which
is wrong. The king's lethal Mandate color is **secret**, so both flags carry the
same unreadable purge risk.

**Consequence built in:** a misaligned king (lethal color = crown) **purges his own
crown-flag backers**, gutting his vote before the count -- so he should be reluctant
to attack, and the loyalists who knelt to him die.

**What the sim showed:** Mandate alignment became the single biggest per-game
factor. Aligned kings ride high; misaligned kings are near coin-flips. Backing the
king is now genuinely unsafe.

---

## Decision 7 -- The ambush, and the build-committed king (the paper victory)

**Goal:** produce the title moment -- *the king completes his Castle and loses the
vote.* Two pieces were needed:

1. **The ambush (a reason NOT to throw up the flag).** A noble who secretly leans
   depose may stay crown-flagged: lie in wait, keep paying tax (funding the very
   Castle that will doom the king), never provoke his attack, and cast the deposing
   vote only at the reckoning. Mirror of Decision 4.
2. **The build-committed king.** A king with a calm-looking court, or one whose
   Castle is nearly done, **builds rather than attacks** -- he believes completion
   is his win. Under `castleVerdict: "trigger"`, it is a reckoning.

**What the sim showed:** the paper victory fires in ~1 of 5 completed Castles at an
even table, ~1 in 3 against a hostile court, ~1 in 7 against a friendly one.
Completing the Castle became "the most dangerous thing the king can do," with its
danger set by how much of the room secretly hates him.

---

## Decision 8 -- Typed assets, House edges, and decoupled assignment

**Built (was the long-deferred item):** the three asset types are now real --
farmers score estates, manufacturers factories, bankers charters. The king bestows
from a **finite typed grant deck**; a matched grant enriches (scores), a mismatched
one is a cheap brand (flag only). The six House edges are implemented, and House is
now assigned **independently of strategy** so neither contaminates the other's
statistics.

**Why:** before this, Houses were mechanically identical, so "how do the Houses
fare" had no real answer -- and the numbers it printed were a confound (the lone
betrayer bot rode a banker seat and dragged bankers down).

**What the sim showed (the win distribution, finally meaningful):**

- By kind: farmer ~12% / manufacturer ~13% / banker ~21% / king ~55%.
- By named House (noble victories only): **Mildegaarde 31%** (+1 income/round),
  Krael 19%, Hesse 15%, Ostlander 15%, Varrochi 11%, **Brandt 10%** (one-shot
  IOU->coin). Fair share is ~17%.
- **Passive per-round edges dominate one-shot edges.** Mildegaarde's steady +1
  income compounds into coin and wins the individual-victor tiebreak; the one-shot
  abilities fire once and fade. The income edge wants a nerf, or the one-shots want
  buffs. The "banker is weak" reading from before was entirely the betrayer
  confound -- it inverts once House and strategy are decoupled.

**Open within this:** at the default deck size (4/4/4) the finite deck is **not yet
binding** -- ~9 grants given against 12 cards in ~9-round games means 0% denied. The
bloc-fracturing squeeze exists but only activates with a smaller deck or longer
reigns; `grantDeck` is the knob.

## Decision 9 -- House-to-house rounds and a valued-land economy

**Corrected (the round structure was entirely my guess):** the king now goes
**House to House** each round rather than touching one noble. At each House he asks a
favor costing **1-8** and chooses to **sweeten it with a land of similar value** or
just **demand the tax**. Lands are **individually valued (1-8)** -- a noble scores
only its own House's land type, summed by value, so not all lands are equal.
Rebels refuse the king (he may gift a land to lure them back). Nobles may flip lean
and flag **at any time, even mid-round** -- modeled as a re-evaluation after every
House visit, which makes visit order a lever.

**What the sim showed:** the new economy is ~6x richer per round (the king extracts
from everyone), so the old `castleTarget: 28` finished in ~2 rounds and the king was
~98% safe. Re-pricing the Castle to **120** restored the contest: king ~78% /
rebellion ~22%, ~9-round reigns, all three triggers live, and the paper victory back
at ~17% of completed castles. The mechanism was sound; only the master needle (tax
vs Castle cost) needed rescaling to the new scale.

**Open within this:** at the restored balance ~32% of games drift to the round cap
(stall) -- the Q5 backstop wants attention (raise `roundCap` or shave `castleTarget`).
The king's sweeten-vs-demand and visit-order logic is still simple AI.

## Decision 10 -- The High Society squeeze (illiquid overpay + debtor's prison)

**Built:** an illiquid noble (cannot cover a demand in coin) must surrender a land as
payment with **no change** -- a 1-coin noble holding an estate worth 8 loses the
estate to settle a 2 tax. The king takes the land he covets (most valuable), credits
its full value to the Castle, and -- per Jason's call, matching the doc's debtor's
justice -- **jails the noble too** (the asset and the man). `landPaymentImprisons`
toggles this; default true. Truly destitute nobles (no coin, no land) are jailed
outright.

**Why:** this is the doc's central "wealth must be defended with liquidity." Coin is
safe; land is seizable; an asset-rich, cash-poor noble is the king's prey. The
telegraphed (`seizeMode: threat`) version gives a grace window to scrape the coin and
keep the land -- the real dilemma ("find one more coin or lose my estate").

**What the sim showed:** balance held (king ~78% / rebellion ~22%, paper victory
~17% of completed castles), and land-grabs now equal imprisonments by construction.
**But the squeeze is currently chronic, not special: ~4 land-grabs/jailings per
6-noble game**, because favor costs (1-8, avg ~4.5 from every House each round)
badly outpace income (~2/round). Nobles are almost always illiquid, so the king
seizes and jails most of the court every game. For the overpay to land as a dramatic
*exception* rather than the steady state, income vs favor-cost wants tuning (raise
income, lower/▼frequency of demands, or fatter starting coin).

## Decision 11 -- The generosity-then-brutality arc (income vs favor cost)

**Goal (Jason's):** spoil the court with favors early, run short of them, and force
the king to be brutal a few times late to win -- the brutality breeding the
rebellion.

**Built:** three coupled changes. (1) Favor cost **scales with Castle progress** --
cheap early (~1-2), dear late (~7-8). (2) The king's generosity is **rationed to his
deck** -- he spoils broadly while it's full, then closes the purse as it empties.
(3) Income is **2**, deliberately too low: ~108 total income across the court cannot
cover a 120 Castle, so the king *must* extract from land (seize) late to finish.

**What the sim showed:** the arc landed cleanly. **Early seizures 0.00, late seizures
1.56** per game -- brutality is now entirely late. King ~81% / rebellion ~19%, paper
victory ~16% of completed castles. A representative game: rounds 1-5 gentle and
sweetened, rebel flags go up round 6 as favors dry, the king seizes-and-jails three
nobles in round 8 to complete the Castle -- and is deposed on the reveal, the spoils
going to a noble he had just jailed. Generosity -> scarcity -> brutality -> paper
victory, exactly as specified. Income is the keystone: 2 gives the arc, 2.6 lets the
king coast (92%), 3 removes brutality entirely (97%).

## Decision 12 -- The king judged on lands he holds; the Houses equalized

**Correction (Jason's, the elegant one):** the king's individual-victor score is the
**lands he still controls** (undealt deck + seized), **not the Castle**. Building the
Castle means giving lands away to court nobles; winning personally means still holding
some -- and seizing (his main way to hold land) is the brutality that breeds the
rebellion. The Castle is the crown faction's win condition, never the king's wealth.

**Why it was needed:** when the king scored the Castle (always ~120), he scooped every
crown-win individual prize, starving crown-aligned nobles and concentrating noble wins
into the ~19% rebellion games -- which made threat-edges (Krael) look 2x too strong
(31.8%) and crown-edges (Ostlander's promise) useless. Pure measurement artifact of
the scoring rule, not the edges.

**What the sim showed:** scoring the king on held lands rebalanced the Houses almost
by itself. With two small follow-up nudges (Varrochi/Brandt given a small scoring land
since pure one-shot edges can't win a richest-survivor game; Mildegaarde income 1->2;
Hesse estate 3->2, Brandt factory 2->3) the named-House win shares went from a 10-32%
spread to **15.6-17.5%** -- all within a point of the 16.7% fair line. The king takes
~29% of individual victories (competing, not monopolizing). Edge magnitudes are config
knobs (`edge*`).

**Side effects to watch:** king survival drifted up to ~84% (rebellion ~16%, was
~78/22), and the king's *attack* trigger nearly vanished (~0.5%) -- with nobles a bit
wealthier and seizures down to ~1.2/game, rebellions stay smaller and games resolve by
Castle completion. The paper victory is healthy (~14.5% of castles) but the "king
attacks into the hidden knife" moment is now rare; nudging rebellion back toward ~20%
(and reviving the attack) is the next tuning pass if wanted.

## Still open / deferred

- **Rebellion strength / attack revival.** King ~84% is a touch safe; the attack
  trigger is nearly dead. Retune toward ~78/22 and bring the attack-gamble back.
- **The stall backstop (Q5).** Currently 0% stall at this balance (was ~1/3); watch it.
- **The Mandate deck (Q1).** Only the purge-color half is modeled; private win
  conditions (e.g. Cincinnatus) are not.
- **Scoring weights and economy numbers** are provisional throughout.

## The standing caveat

This is a heuristic behavioral simulation with ~30 free parameters. Its results are
**directional** -- they show the mechanisms produce the intended moments and the
dials move sensibly. They are **not** a substitute for playtesting with humans, who
bluff, talk, and coordinate in ways the bots cannot. Treat every percentage as "the
shape of the thing," not a balanced final number.
