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

### The reign loop (per round)

1. **King phase.** Carry out matured seize-threats; grant a noble (to shore up a
   wavering bloc member); demand tax from a crown-flagger (rebels refuse to pay);
   pay prison upkeep. Then **decide whether to attack** a visible rebellion -- but
   only if the court is genuinely restless and the Castle is not nearly done. A
   calm court or a near-complete Castle means he builds instead.
2. **Noble phase.** Income; pay down any seize-threat; then each noble re-chooses
   its **flag** and **lean** by estimating who will win from the public board
   (Castle progress, the visible flag split, the size of its own color bloc).

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
- **Deferred:** a finite grant deck (the king's branding is currently unlimited;
  favour decay is a soft stand-in). The three asset *types* are collapsed to a
  matched/mismatched grant.

## Files

- `src/config.js` -- every knob, commented and mapped to an Open Question.
- `src/engine.js` -- the reign loop and reckoning resolution.
- `src/bots.js` -- roster construction (color, flag, lean, carry-over).
- `batch.js` -- Monte Carlo runner, the report, and `--sweep`.
- `DESIGN_NOTES.md` -- the design decisions made while building this, each tied to
  the number that motivated it. Read this for the "why."
