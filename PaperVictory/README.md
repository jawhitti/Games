# Paper Victory: The Reign -- second-half simulator

A dependency-free Node Monte Carlo for **Phase 3 (The Reign) + Phase 4 (The
Reckoning)** of *Paper Victory: The Reign*. It exists to answer one question:
do the rules produce the two dramatic moments the design is chasing --

- **the paper victory:** the king completes his Castle and is deposed on the
  reveal (crowned and toppled in the same breath), and
- **the forced gamble:** the king attacks a rebel to put down the rebellion, and
  walks into a hidden majority he could not see.

Phase 1/2 (the Campaign and Coronation) are **not** simulated. Their carry-over
into the reign -- each noble's coin, carried threats, starting grants, and public
**color** -- is supplied as configurable input.

## Run it

```
node batch.js                       # default config, 5000 games
node batch.js -n 20000              # more games
node batch.js --set winColorProb=0.3 --set castleVerdict=trigger
node batch.js --sweep               # one-axis-at-a-time degeneracy sweep
```

Every Open Question and every design lever is a knob in `src/config.js`, each
commented with what it does and which question it answers. Nothing is settled
design; the defaults just make it run.

## The model (current)

Each noble carries **three** allegiances, on three axes:

| axis | visibility | when set | what it does |
|---|---|---|---|
| **color** (win/lose) | public, fixed | Coronation | losing-color nobles are the visible opposition bloc |
| **flag** (crown/rebellion) | public, chosen each round | the reign | declares allegiance; a rebel flag refuses tax + earns the hero bonus |
| **lean** (survive/depose) | secret, chosen each round | the reign | the actual deposing vote at the reckoning |

The king has a **secret Mandate color** -- the flag he executes at the purge.
It may not match his public face, so **neither flag is safe**; backing the king
is a blind bet, and a misaligned king purges his own crown-flag loyalists.

### The reign loop (per round) -- house to house

1. **Upkeep.** Each noble takes income; anyone under a seize-threat may pay it down;
   matured seize-threats are carried out; prison upkeep slows the Castle.
2. **The king goes House to House.** He visits every noble in turn (the wavering,
   burned-color Houses first). At each House he asks a favor whose cost **scales with
   Castle progress** -- cheap early (~1-2), dear late (~7-8) -- and either **sweetens
   it with a land of similar value** (courting that House) or just **demands the
   tax**. His generosity is **rationed to a finite deck**: he spoils the court while
   it is full, then closes the purse. Rebels refuse him; he may **gift a land to lure
   them back**. Lands are **individually valued (1-8)**; a matched type enriches (it
   scores for that House), a mismatched one is a cheap brand.
   An **illiquid** noble -- one who cannot cover the demand in coin -- must surrender
   a land as payment with **no change** (an estate worth 8 settles a tax of 2), and is
   **jailed** for it (debtor's justice: the asset and the man). So land wealth must be
   defended with liquid coin -- the High Society squeeze.
3. **Nobles react after every visit.** Leans and flags may flip *at any time, even
   on another House's turn* -- so visit order matters, and a noble watches what
   befalls its neighbors. Each re-estimates who will win from the public board
   (Castle progress, visible flag split, its own color bloc).
4. **The king may attack** a visible rebellion -- but only if the court is genuinely
   restless and the Castle is not nearly done (otherwise he lays the last stones).
5. **End of round:** grudges fade; check for Castle completion or a called rebellion.

Lands carry value, so every choice is real: which House to enrich vs cheap-brand,
which land the king covets enough to seize (he takes the most valuable), and which
holdings a noble must defend with liquid coin.

### The three reckoning triggers

- **Castle complete** -- the king's victory race. Under `castleVerdict: "trigger"`
  it only *forces the count*; a secret majority can still depose him (the paper
  victory). Under `"outright"` it just wins.
- **Rebels call** -- a rebel-flag noble bets the frozen snapshot favors them.
- **King attacks** -- he strikes a rebel, which *is* a reckoning; decided on
  visible flags, counted on secret leans.

### The Reckoning

Freeze -> the king purges everyone flying his secret lethal color (jailed nobles
are exempt and still vote) -> surviving secret leans are counted, king is +1, ties
break per `tieRule` -> the losing faction is purged; among the winning faction the
richest survivor (own-House asset + coin + promises-or-flipped-threats) takes it.

## What the simulator established

Starting point: with the rules as first written, **the king was ~100%
unbeatable.** Six design corrections (see `DESIGN_NOTES.md`) turned it into a real
contest whose outcome turns on the court the king inherited and his hidden Mandate.

The reign now plays a **generosity-then-brutality arc**: the king spoils the court
with favors early (cheap demands, lands flowing), runs short as his deck empties and
demands climb, and -- because income can't cover the Castle -- is forced to seize
land a few times late to finish. That late brutality breeds the rebellion that can
depose him. (Measured: early seizures ~0, late seizures ~1.5/game.)

Both target moments now occur and are tunable:

- **Paper victory:** the king completes his Castle and loses the vote in roughly
  **1 of 5 completions** at an even table, rising to **~1 in 3 against a hostile
  court** (`winColorProb 0.3`) and falling to ~1 in 7 against a friendly one.
- **Forced gamble:** the king's attack loses ~3% at an even table and ~9% against
  a large burned bloc -- it gets dangerous exactly when the opposition is big.

And the key dials move monotonically and intuitively:

- **Campaign color split** (`winColorProb`) sets the whole difficulty of the
  reign: king survival ran 56% -> 64% -> 73% -> 81% -> 89% as the burned bloc
  shrank. The reign inherits its tension from how Phase 1 ended.
- **Secret Mandate alignment** is the biggest single per-game factor: aligned
  kings ride high; misaligned kings are near coin-flips, because attacking would
  purge their own side.

## Honest caveats

- This is a **heuristic behavioral sim with ~30 free parameters.** The numbers are
  **directional, not balance-grade** -- their value is showing the *mechanisms*
  produce the right moments and respond sensibly to the dials, not that "20.6%" is
  a true rate. A real table of humans bluffing and talking will differ.
- **Table-talk is unmodeled.** Bots coordinate only through public mechanical
  signals (color bloc, flags, Castle). The `coordination` knob is a crude proxy
  for whispering-at-the-table.
- **Houses are now real** (typed assets, finite grant deck, six edges, House
  assigned independently of strategy). The measured distribution shows passive
  per-round edges (Mildegaarde's +1 income -> 31% of noble wins) dominating
  one-shot edges (Brandt 10%); fair share is ~17%. See `DESIGN_NOTES.md`.
- **Deferred:** the deck size isn't binding at the default 4/4/4 in short reigns
  (shrink `grantDeck` to feel the squeeze); House edges want rebalancing; the
  Mandate deck's private win-conditions (Cincinnatus) are unmodeled.

## Files

- `src/config.js` -- every knob, commented and mapped to an Open Question.
- `src/engine.js` -- the reign loop and reckoning resolution.
- `src/bots.js` -- roster construction (color, flag, lean, carry-over).
- `batch.js` -- Monte Carlo runner, the report, and `--sweep`.
- `DESIGN_NOTES.md` -- the design decisions made while building this, each tied to
  the number that motivated it. Read this for the "why."
