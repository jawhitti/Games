# NO FATE — playable simulator

A 3–5 player card game (Terminator × Blade Runner × sci-fi). You reach into a
hidden **Future**, send **Terminators** into it that surface turns later and drag
home whatever's beneath them, and race to reunite your iconic **rescuer ↔
protectee pair** for an outright win. You can edit the future; you cannot touch
the present; and you never fully control what your machine drags back.

## Run

    node smoke.js        # sanity checks (full game + buddy-chain/scoring)
    node autoplay.js     # one bot game -> transcript.txt
    node stats.js        # aggregate stats over many games
    node report.js       # card balance + storytelling metrics + an exemplary game

Print-and-play cards (glyph template, data-driven from the catalog):

    node render-svg.js   # one print-ready SVG per card -> cards-svg/ (2.5x3.5" @ 300 DPI)
    pwsh svg-to-png.ps1  # convert them to PNGs -> cards-png/ (uses headless Edge/Chrome)

Play one step at a time (state persists to state.json):

    node play.js init [--seed N]
    node play.js resolve                 # flip + resolve the top of the Present
    node play.js yeet PID | pass         #   (only if a 13th Monkey window opens)
    node play.js take | send             #   (only if a prize/potato/etc. surfaced)
    node play.js fish POS                # cut + private peek at depth POS
    node play.js plant TERMID [OFFSET]   #   (optional) plant a terminator
    node play.js reorder a,b,c           #   (optional) Temporal Splice the peeked band
    node play.js snipe AIM               #   (optional) Hasta La Vista: destroy a card
    node play.js pull OFF [DEPTH]        #   (optional) Actually, Fate: peeked card -> Present
    node play.js endturn
    # helpers: show | peek (debug) | log [N]

## Components

- **5 Terminators per player**, in hand, **color-grouped by player** (red / blue /
  orange / gold / purple / magenta). Planted via fishing; on surface they drag the
  card below home — points, a potato, a protectee, or another machine. Your machine
  color matches your couple's heart color, so everything you own reads as one set.
- **Each player's PAIR**, both shuffled into the deck: a **protectee** (Sarah
  Connor / Rachel / Marty McFly / Trinity / Princess Leia / Newt) and her matching
  **rescuer** (Kyle Reese / Deckard / Doc Brown / Neo / Han Solo / Ellen Ripley).
  Each player also takes a **"YOUR PAIR" card** at setup to declare their couple.
  A couple's three cards share one **distinctly colored heart** so they read as a
  set at a glance.
- **The ~75-card deck** (prizes, upgrades, downgrades, potatoes, neutrals, one
  global) shuffled with the pairs ≈ 83 cards for 4 players.

## The turn

1. **Resolve** the top of the **Present** (a committed, face-down window of 8),
   then refill it from the Future. A surfacing card may be hit by a reactive
   **13th Monkey** first (below).
2. **Fish** the Future: cut anywhere, privately peek **(Sarahs-out + 1)** cards
   (sight grows as the war goes on), and optionally plant one Terminator on what
   you saw — or spend a one-shot (Splice, EMP, …) as your action. You never cut,
   peek, or plant into the Present.

## Resolution

- **Terminator** → buddy-chain capture: it chains down through consecutive
  terminators and drags the first non-terminator home; the whole convoy's haul
  goes to the **top** terminator's owner (no choice).
- **Protectee (naked)** → scores her **ladder value (1/2/4/8 by order of
  departure)** to whoever **drew** her, **×2 if the drawer owns her**.
- **Rescuer (naked / unowned)** → if a hero surfaces on his own, he simply
  **reports home to his pair's owner** (it's an event before your turn, not a
  capture) and the active player flips again. He can still be **yeeted** off the
  top first (the 13th Monkey denies the walk-home / extends the game).
- **Rescuer (planted)** → beats any terminator that surfaces onto it, dies to a
  terminator below it, and on a protectee below:
  - **matching pair → INSTANT WIN** for the protectee's owner;
  - **wrong pair → no win**, but her ladder value goes to the **rescuer's owner**;
  - **★ star-crossed**: if a protectee walks home with her matching rescuer the
    *very next card*, the pair's owner gets **+2** ("oh well, you tried").
- **Prize / clock-scaled prize / John Connor / potato / upgrade / downgrade /
  character** → the active player chooses **take** or **send** to the bottom.
  (Captured/looted versions are forced. A dragged protectee scores **×2** to the
  captor.)
- **Timequake** (the one global) → shuffles the entire Future; fires on flip,
  can't be refused, sent, looted, or yeeted.

## Notable cards

- **The 13th Monkey** (×1) — reactive one-shot: when any card surfaces (anything
  but the Timequake), any holder may fling it to the deck bottom; the active
  player flips again. On a terminator it flings only the **top** one — the rest
  of the would-be convoy evaluates normally. The clock doesn't advance, so it
  extends the game, revives the dead bottom, and keeps a sidekick in play for a
  reunion or denies a rival's walk-home.
- **Temporal Splice** (×4) — one-shot: after you peek, **reorder** that band.
  Weapon (line your hero over your sidekick; route your sidekick to your own
  draw) and shield (star-cross a rival pair; pull your sidekick off a terminator).
- **Hasta La Vista, Baby** (×3) — one-shot: cut, peek a card, and **destroy** it
  outright — anything but a protectee, a hero, or the Timequake. Vaporize a rival
  machine, John Connor, or a fat prize before someone banks it. The slugfest button.
- **Actually, Fate** (×2) — one-shot: drag a card from the band you just peeked
  **up out of the Future and into the Present** at a depth you choose. Bring your
  own hero home fast, or time a Hot Potato onto a rival — risky, since a machine
  already in the (face-down) Present may grab it first.
- **John Connor** & **Into the Unknown** (×2) — clock-ladder prizes worth the
  current Sarah-ladder value when taken (1/2/4/8 as the clock advances); take one
  cheap, or send it to the bottom and gamble it resurfaces late worth more. Three
  roaming hunt-magnets, fat in the late war.
- **Veteran Chassis** — your terminators can't be buddied/taken (the convoy
  brake). **Sharp Eyes** — +1 peek. **Deep Recon** — peek (4 − Sarahs-out), sharp
  early, fading late. Plus EMP, Sabotage, Field Promotion, Jury-Rig, Temporal
  Insertion, Quartermaster, and three downgrades.

## Scoring & end

The game ends the moment a **reunion** triggers an instant win, or when **all
protectees have left the board** (the clock), at which point most points wins.
Sarah-scaled and clock-ladder prizes (John Connor, Into the Unknown) track the
clock; held hot potatoes subtract
(the worst, **A Potato**, is −9 — literally a potato the displacement field grabbed
by mistake); rescuers are worth 0 banked (they exist to be used).

## Files

    src/rng.js       seeded shuffle
    src/catalog.js   the ~75-card deck list (swap point for tuning)
    src/cards.js     deck / protectee / rescuer / hand construction (the pairs)
    src/engine.js    rules engine (turn, capture, scoring, heroes, globals, yeet, splice)
    src/bot.js       heuristic bot policies (hoarder / spender / smart / pro) + playGame
    src/render.js    table / log rendering
    play.js          interactive harness
    autoplay/stats/report/ab/batch/analysis/test-smart.js   analysis harnesses

## Notes for tuning

- Config knobs (engine `DEFAULT_CONFIG` / `playGame` opts): `cutJitter`,
  `peekScalesWithSarahs`, `sarahCaptureMult`, `sarahLadderMult`, `handCap`,
  `maxBuddy`, `timequakeOff`, plus `charScale` / `prizeScale` / `deckScale` in
  `playGame` for deck experiments.
- The bot is a reasonable evaluator for the core economy and the reunion race,
  but it **underuses the situational one-shots** (Splice, 13th Monkey, the
  upgrades) — those are human-facing strategic tools. A lookahead bot would be
  needed to balance them by simulation.
