# games — notes

A rapid game-prototyping repo. Each subfolder is a self-contained experiment
(mostly plain JS; several are a single `index.html` you can double-click). These
notes capture what each is and the design lessons learned, so directions don't get
re-walked.

## Prototypes

- **AlgebraCubes/ ("Balance")** — learn algebra by manipulating an equation shown
  as a row of emoji cubes; the player is never told the rules. Exact bigint
  rationals, hard engine/renderer split, negate/invert rendered as mirror/flip
  "dots" (the Klein-four involutions), adjacency-multiplies notation (`2x`, not
  `2×x`). Committed.
- **MovieHex/** — daily movie-title **chain** game on a blooming hex flower
  (last word = next first word; START → TARGET; longer route scores higher). Full
  write-up + the unresolved core design question are in `MovieHex/README.md`.
  Committed.
- **Bonsai/** — deterministic **one-change-per-day** tree-growing sim for social
  time-lapse clips. See `Bonsai/README.md` (incl. tuning history + a known
  growth-stall bug). Committed.
- **Lift/ , Lift2/** — log-space balloon / flow-first personal-finance sims.
  Committed.
- **Maypole/** — 4D puzzle-platformer core (slicing + reachability verifier). Art
  direction: strict black-and-white Escher line art, no color. Committed.
- **Twins/ , Prism/ , Tangle/ , Tumbler/** — a "cuddly, non-arithmetic operations"
  exploration. Each a single self-contained `index.html`:
  - **Twins** — (ℤ/2)ⁿ toggle group (day/night puppy flips). Verdict: "makes no sense."
  - **Prism** — GF(4) color-mixing bench (⚪🔴🟢🔵; XOR add, 3-cycle multiply). "Sterile."
  - **Tangle** — non-commutative dihedral solver (rotate/mirror a fox; peel moves off a row).
  - **Tumbler** — a 3D CSS cube you rotate; occluded faces cast colored light; it
    hums/sparks on a hidden rule (star face on top). The one that had "a pulse."
  Exploratory; may be uncommitted — check `git status`.

## Design lessons (the throughline)

1. **Don't design games math-first.** Picking a clever structure (a finite field,
   a group, a toggle system) and *then* bolting a game on reliably produces things
   that are clever and **dead** — the structure becomes the star, and structure is
   never the star. The GF(4) / dihedral / toggle prototypes all fell flat. The
   *alive* ones (Balance, the Tumbler cube toy, MovieHex) got their life from
   **feel**: dragging cubes and watching them cancel, a mysterious cube that hums
   when you do the right thing, a chain that reads as an absurd run-on sentence.
   Start from a toy that feels good to touch; let the math serve it. Judge by
   playing, not by argument.
2. **For a daily / social game:** the score must reward **skill** (a luck-based
   score is unbraggable — nobody challenges a friend to be luckier), and the puzzle
   must be **deterministic** (luck can't be competitive). This is MovieHex's
   unresolved core.
3. **The movie-chain novelty is squeezed:** *recall* (name the movies to connect
   A→B) tests knowledge but is the single most-cloned movie game; *variable link
   rules* (year / actor / director) collapse into Six-Degrees trivia; the one
   un-derivative angle left is **longest-path optimization on a fully-visible shared
   board** — real skill (NP-hard), deterministic, beatable/postable — at the cost
   of testing route-*planning* rather than movie knowledge.

## Working preferences

Plain JavaScript over TypeScript for prototypes. Build fast, react to visuals,
iterate. State design forks in prose and keep moving rather than blocking on
questions.
