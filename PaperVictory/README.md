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

Rebellion is a **discrete muster**, not a standing stance. During the reign nobles
have no public side -- they pay the king's favors and accumulate grievance. Each
noble has a public **color** (win/lose, fixed at the Coronation -- the burned losing
bloc is the natural core of any rising) and, *only when a rising is called*, a
**secret commitment** to join or stand aside.

When the king pushes too far, a rising is called (see triggers). Every noble
**secretly** chooses to **join (send help)** or **stand with the crown**, all reveal
at once, and **a majority of nobles topples the king.** The hidden layer is that
commitment: the ally who seemed loyal and secretly answered the call is the knife no
one saw. A crushed (minority) rising is purged -- the exposed rebels executed -- and
the reign goes on. (The earlier flag/lean/secret-Mandate model was replaced by this
muster; see `DESIGN_NOTES.md` Decision 13.)

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
   The king also **reserves** a few lands he won't grant away (`kingReserve`): to
   build he must give lands out, but to win he must still control some -- the central
   give-vs-keep tension.
3. **End of round:** favour fades (grievance does not); then the rising checks below.

Lands carry value, so every choice is real: which House to enrich vs cheap-brand,
which land the king covets enough to seize (he takes the most valuable), which
holdings a noble must defend with liquid coin, and how much of his deck the king
dares keep for himself.

### What calls a rising

- **The Castle is completed** -- the king believes he has won, but completion forces
  a final muster; a majority can still topple him (the paper victory). Under
  `castleVerdict: "outright"` completion simply wins instead.
- **A brutal push** -- the round the king jails someone, an aggrieved noble may cry
  "Rebellion!" and force a muster then and there.
- **The round cap** -- a final muster is forced if nothing else has ended it.

### The muster

Every noble secretly commits (join / stand aside), all reveal at once, and the heads
are counted: **a strict majority of nobles answering the call topples the king.** If
the rising falls short it is crushed -- the exposed rebels are purged. The winning
faction (the joiners if the king falls, the abstainers + king if he holds) then
contests the **individual prize**: the richest survivor by own-House land value + coin
+ (flipped threats if the rebellion won, or promises if the crown won), plus a hero
bonus for a noble who joined a winning rising.

The king competes for that individual prize too, **judged on the lands he still
CONTROLS (his undealt deck plus what he has seized), never the Castle.** This is the
keystone tension: to build the Castle he must give lands away (courting nobles); to
win personally he must still hold some -- and seizing land (his main way to keep
holding) is exactly the brutality that breeds the rising. The Castle is the crown
faction's win condition, not the king's personal wealth.

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
