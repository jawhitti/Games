# NO FATE — design & balance notes

Working log of design decisions and what simulation measured. The README is the
player-facing summary; this is the "why it's tuned this way" record. Numbers below
are from the heuristic bot (`src/bot.js`) over a few thousand seeded games per row.

## SETTLED DESIGN (2026-06) — read this first

**The soul: it's a chase, and the table decides whether love survives.**

- **Bringing your pair home is an INSTANT WIN** (`reunionEndsGame: true`). Reuniting is the
  goal — urgent, rewarding, the throughline. The whole game is "can I sneak my hero home to
  my sidekick before the table star-crosses me?"
- **The win condition self-scales with table meanness — and that's the feature.** Measured
  (% of games ending on a reunion): **casual ~49%** (love gets through), **realistic ~40%**,
  **cutthroat ~8%** (love is crushed; it becomes an attrition war for the spoils, decided by
  the 1-2-4-8 ladder — the *last* sidekick is worth 16 and usually decides it). Same deck,
  two genres, chosen by how hard players deny. A friendly table tells a romance; a cutthroat
  table tells a tragedy.
- **It's FAIR.** Sidekicks scatter randomly in the bottom half; win-rate by how *shallow*
  your Sarah starts is flat (~25/25/25/25). A shallow Sarah is exposed early and the
  clear-the-way contest lets rivals fight any head start — the deal doesn't decide it, play does.
- **Comebacks are the norm (~68%):** a reunion is a from-behind sneak, so the winner usually
  trailed at halftime.
- **The slugfest starts deep:** couples scatter across the bottom half, so each has a
  different-length journey home; the deep ones are long contested runs, not doorstep snipes.

**Locked config:** instant-win; heroes start in hand; prizes kept in hand (hand-capped);
growing sight (`1 + sidekicks-out`, the "fog lifts toward the crescendo"); machines worth 2
(`terminatorBounty`); de-jittered "one fish (the only jitter), then one card" for every
targeting one-shot; the star-cross suite (terminator-below-hero, Sabotage, Temporal Shift);
the shared-sight social globals (Flare, Pass the Watch, A Word in Your Ear).

**The ladder experiment (relaxed instant-win) was TRIED and REVERTED — don't re-litigate.**
We spent a session on "reunion scores on the 1-2-4-8 ladder, game plays on, last couple home
wins." It bought nice comeback numbers but killed the soul: no urgency, "nobody wants to be
first off the board," reuniting became a hoarded late cash-out, and the romance stopped being
a live concern early/mid (sidekicks are deep). Instant-win has none of those problems —
reuniting *is* winning. The denial suite we built is what keeps instant-win from ending games
too cheaply (it's now a real fight to sneak one home). Kept behind `reunionEndsGame: false`
if ever wanted again.

**Honest caveats (don't oversell the sim):** the social globals, the reveal-hunt, alliance
ideas (share-a-Sarah's-points-with-your-left), and the potato's hot-potato comedy are all
**human-table** value the bots can't exercise — bots don't talk, negotiate, gang up, or pass
the potato. The sim shows the points and combat; the politics and the laughs live at the
table. Don't trust a sim number that claims those move balance — they don't, by construction.

### What it feels like (actual games)

*Casual, seed 1001:* a dead 30-30 tie broken at T83 when Kyle Reese finally reaches Sarah
Connor for the instant win — after a 5-machine convoy and a Timequake. The chase wins a photo
finish. *Casual, seed 1007:* nobody gets home; P1 just loots hardest (a 4-convoy, the +8
sidekick) and blows it out 45 — the war swallowed the romance. *Cutthroat, seed 2002:* zero
reunions, the sidekicks fall +1/+2/+4 and then the **last one is worth +16** and decides it,
39-35. *Cutthroat, seed 2009:* a 116-turn grind where a hero wipes a convoy of *six* mid-war
and the winner laps the field at 68. Friendly table → romance; mean table → knife-fight.

## Setup & seeding (the early-robbery fix)

**Problem:** with all pairs blind-shuffled across the whole deck, a player's protectee
could surface naked on turn ~2 and depart permanently before the owner had any agency
(no hero yet, can't touch the Present, almost never holding the 1 yeet). Measured: 61%
of departures were naked walk-homes, and **58% of games** robbed at least one player
early (a naked protectee leaving in the first quarter). The hero already had grace (a
naked hero reports home to his owner); the protectee did not — that asymmetry was the bug.

**Setup procedure (table-legal, `engine` `splitSeed: true` + `heroesInHand: true`, the defaults):**
1. **Deal each player their hero** straight to hand (`heroesInHand`). The portal never
   holds a hero — your protagonist is your agent from turn one.
2. Shuffle all cards **except the pairs**.
3. Deal **8 off the top** — that's the opening **Present** (so no pair is ever in it).
4. Cut the rest into two roughly equal piles.
5. Shuffle the **protectees into the bottom half** (rescuers are already in hands).
6. Put the top half on top. Ready to play.

Effect: you start armed with your hero (no portal-wait), and your protectee can't surface
to strand you until mid-game. `heroesInHand: false` restores the legacy "rescuers seeded
into the top half of the deck, acquired on surfacing." `splitSeed: false` restores the
fully-blind shuffle.

| setup | early-robbery (games) | reunion | captures | median length | terminates |
|---|---|---|---|---|---|
| completely random (blind) | **58.0%** | 22.1% | 35% | 71 | yes |
| split, roughly-equal (45-55%) | 3.4% | 35.6% | 44% | 77 | yes |
| split, cut @ 25% | 3.4% | 38.4% | 42% | 74 | yes |
| split, cut @ 50% | 3.0% | 35.9% | 44% | 77 | yes |
| split, cut @ 75% | 3.5% | 32.9% | 43% | 79 | yes |

**Conclusion: keep the structured setup; completely-random is rejected** (it robs >half
of games). The fork that matters is split-seed vs random (robbery 58% -> ~3%, reunion
22% -> ~36%, and captures rise 35% -> 44% because sidekicks now survive into the late
game where convoys can grab them). **Where the players cut is a mild, free lever** — over
the whole 25-75% range robbery stays ~3% and reunion only moves 33-38%, so there's no
need to police the cut: shallow = faster/reunion-forward, deep = longer/economy-forward.
The cut point can't be enforced anyway (it's a human action), and it can't break the game.

**Timequake interaction (intentional, accepted):** the split-seed structure only holds
until the Timequake fires. `_fireGlobal` shuffles the *entire* remaining Future, erasing
the hero-top/sidekick-bottom ordering for the rest of the game — so afterward sidekicks
are uniformly distributed again and any staged reunion (planted hero + located sidekick)
is scattered. This promotes the lone global from "annoying shuffle" to *the* structure-
breaker: one uncatchable card that detonates everyone's ordering at once. Accepted as a
feature (it gives the late game a "will it flip before I land my reunion?" tension). The
bot's `rigReunion` already abandons its hunt when a quake fires.

## Heroes start in hand + inverted peek ("the portal is breaking down")

**Problem (heroes in deck):** with rescuers seeded into the top half, the median player
waited a third of the game just for their hero to surface, and the tail was a feel-bad —
a hero mixed low, surfacing late, was exactly the one a Timequake would scatter back down.
Measured per player-seat (mixed-denial, 5000 games): **median hero arrival ~38% into the
game; ~10% of seats only in the final third; ~4-6% never got their hero before the game
ended.** That's 1-in-7 seats spending most or all of the game with no protagonist on the
board ("I had nothing to do, this game sucks").

**Fix: `heroesInHand` (default true).** Heroes start in their owner's hand; the portal
emits only sidekicks + catalog + threats. Eliminates the portal-wait entirely and removes
the Timequake-scatters-my-protagonist case (the quake still scatters *sidekicks*, which is
fine drama). Thematically cleaner: the hero is your ready agent, the portal is the chaos.

**`peekInverted` (default true): "the portal is breaking down."** The clock-scaled peek
now runs *backwards* — most sight EARLY, the fog thins as the city empties (mirror of the
old grow-with-the-clock curve, same 1..4 range at 4p). Thematic: the portal is most
legible before it destabilizes. `peekInverted: false` restores growth.

**Stats (2000 games per meta, 4p):**

| variant | casual reunion | realistic | cutthroat | length (casual→cutthroat) | comeback |
|---|---|---|---|---|---|
| baseline (deck heroes, peek grows) | 36% | 32% | 6% | 71→79t | ~67% |
| heroes in hand (peek grows) | 43% | 38% | 7% | 70→79t | ~68% |
| **heroes in hand + inverted peek** | **46%** | **42%** | **7%** | **69→78t** | **~64%** |

**Read:** moving heroes to hand raises the casual/realistic reunion rate ~6-10 points
(both halves of a pair are reachable from turn one), but **cutthroat stays pinned at 6-7%
— denial still craters it**, so the self-scaling-with-skill property holds. Game length is
unchanged (~70t casual / ~79t cutthroat). Inverted peek adds a couple more reunion points
and shaves ~1-2 turns; comeback% stays high (~64%). Hero-wait drops to zero by construction
(`never` and `medianWait` are n/a). Both shipped on by default. Harness: `hero-start.js`.

### Hero recovery: extract (free) + pay-to-send tribute

**Problem the hand-start *exposed*:** a hero is safe in hand, but the instant you PLANT
him he's a board object in the Future — and a Timequake shuffles the whole Future. The old
rules then converted your committed hero into a **self-destructing card you couldn't touch**:
`_resolveKyle` discards a hero in every branch, and The Claw is terminator-only, so once
scattered he'd surface alone, resolve as "spent," and be gone forever. Scenario that named
it: *"I hold Han, turn 2 I send him after Leia, turn 4 the Timequake hits — how do I ever
reunite them?"* Answer under the old rules: you couldn't. The wait-feel-bad we moved off the
unplanted hero landed harder on the planted one.

**Fix 1 — `extractHero` (FREE).** If you peek your OWN hero in the band you fished this
turn, you may scoop him back to hand for free (reset plant state). Finding him *is* the cost
(you have to see him through the fog, and inverted peek thins sight late). The only recovery
path after a quake: re-find, pull home, re-stage. Bot calls it via `tryExtractHero` (skips
if the hero is already set to win — protectee directly below). Engine: `extractHero()`,
gated on `lastFish` like Pull/Splice. You can't reach for a *rival's* hero (table-legal:
act only on what you can see, and it's your own piece).

**Fix 2 — `heroPlantCost` (pay-to-send, default on).** Every hero plant burns one tribute
card from hand — a spare terminator or a held one-shot, **never a potato** (a liability;
burning it isn't a cost) and never the hero. Charged every time, including the first. Since
prizes always bank to *score* (never to hand), the only hand fuel is your fleet/one-shots,
so the tribute is small but real — re-sending a hero that whiffed actually costs you
something. If you have nothing payable, the hero stays home. `_heroTribute` picks the
cheapest payable card (terminator first).

**Stats (2000 games/meta, 4p, both on = current defaults):**

| variant | casual | realistic | cutthroat |
|---|---|---|---|
| hand + inverted, no extract (earlier) | 46% | 42% | 7% |
| + extract, **free** plant (no tribute) | 50% | 43% | 7% |
| + extract, **TRIBUTE** (current default) | 51% | 45% | 7% |

**Read:** extract lifts casual/realistic reunion ~3-5 points by *recovering* heroes that
the old rules deleted — and it makes the scenario solvable: across 400 mixed games, **136
of 176 reunions happened AFTER a Timequake fired** (0.62 extractions/game). The tribute is
a near-zero balance lever (~1-2 points; ~3 cards burned/game) — exactly "costs something,
not extravagant." Cutthroat stays pinned at 7% (denial still scales). Comeback ~68%.

### Bot honesty: NO omniscient deck reads (the rigReunion cheat, removed)

`rigReunion` used to call `g.future.findIndex(my sidekick)` — reading her exact hidden
position straight out of the deck — and aim the cut at her. That is illegal (you cannot
search the fogged Future; you act only on what you peek). **Removed.** Worse: the first
"fix" (aim at where I last *legally* saw her, drifting up ~1/turn) silently RE-created the
cheat — with ~1 card draining per turn the drift estimate re-locks on her true position
every turn, so the bot still aimed dead-on. There is now deliberately **no targeted hunt
at all**: the bot plants its hero on its protectee only when an *untargeted* fish happens
to peek her (`heroPlay`, acting strictly on the band peeked that turn).

**How to audit aim-cheating (don't trust plant-conditioned detectors — they're tautological,
since heroPlay only plants when she's already in the band):** measure, over *all* fishes,
how often the bot peeks its own sidekick vs the random-aim expectation. Clean result after
removal: **4.4% peeked vs 4.1% expected** (mean |aim − her true pos| = 17.5 cards). The bot
finds her only by luck, like a human.

**Magnitude of the cheat on the aggregate: ~1 point** (reunion 45%→44% mixed). So the cheat
was a real correctness bug but NOT the cause of the high reunion rates — those are genuine,
driven by heroes-in-hand + free extract, and are knocked down only by denial. Corrected
honest table (2000 games/meta, 4p, current defaults = hand + inverted + extract + tribute):

| meta | reunion | length | comeback |
|---|---|---|---|
| casual (no denial) | 50% | 67t | 67% |
| realistic (mixed) | 44% | 68t | 64% |
| cutthroat (all deny) | 7% | 78t | 52% |

### Prizes are KEPT cards, in hand (not banked-to-score)

Resolved: taken prizes (value >= 1) go into your HAND as cards, worth their locked value
(computed at take time -- dynamic prizes don't re-float). Your "score" is the chits on the
cards you hold. They count against the hand cap (use it or lose it: over the cap you ditch
the cheapest, losing those points), and the **hero-send tribute burns one kept prize** --
so deploying your hero costs real points, and you can't send him until you've earned a prize.
Single source of truth: `Game.total(pl)` sums held prizes + potatoes + heroes + banked
(captures/characters); burning or ditching a card removes its points automatically. Hand-cap
enforced immediately on take + an end-of-game sweep (verified: 0 over-cap, 0 score mismatches).

### Star-crossing: the obstacle that makes the reunion mean something

CENTRAL THEME: "hero and sidekick battle to find their way home together." The reunion is
the emotional payoff, NOT something to minimize -- star-crossing is the *obstacle* that gives
it stakes. Denial channels, all table-legal (act only on the peeked band / a surfacing card):

- **Terminator below a hero (base rules).** A terminator directly BENEATH a hero kills it on
  surfacing (the machine survives). A terminator ABOVE a hero dies (the hero wins). So the
  star-cross is to plant your machine one slot *below* a peeked rival hero. Bots do this now
  (`starCross`), ~0.43/game.
- **Temporal Splice (U11, ×4) -- its superpower.** Reorder your peeked band: slot a terminator
  directly below a rival hero (kill), or bury the hero away from his sidekick. Broadened from
  "only a perfectly-aligned couple" (fired ~0.01/game) to any peeked rival hero (~0.14/game).
- **The 13th Monkey (YEET)** flings a *surfacing* rival hero to the bottom; **Sabotage** can
  send a peeked rival hero/sidekick to the bottom (separate the couple).

Why reunions still land ~50% casual despite aggressive denial: the **fog favors offense.**
The reuniter only needs to eventually align their own pair over ~70 turns of fishing; a
defender must spot the *specific* rival hero in a narrow window (~5%/fish) AND hold/position
a counter. Bots capture rival sidekicks on sight 91% of the time and star-cross heroes when
seen -- aggression isn't the limiter, *reach* is. Honest balance (1500 games/meta, 4p):

| meta | reunion | length | star-cross/game |
|---|---|---|---|
| casual (no denial) | 50% | 69t | ~0.6 |
| realistic (mixed) | 44% | 71t | ~0.6 |
| cutthroat (all deny) | 8% | 78t | ~0.25 |

The chase pays off about half the time casually (theme lands); skilled, actively-denying
opponents crater it to ~8% (hard-won, dramatic). Lever for tuning the chase = sight/reach
for defenders, not bot aggression (already maxed on sight).

## Canonical baseline (denial-aware, 2-6 players)

The numbers to design against. Reunion rate by player count across the denial spectrum
(no denial = all economy bots; mixed = ~half deniers; full = all deniers):

| players | casual (no denial) | realistic (mixed) | cutthroat (full) | length (mixed) |
|---|---|---|---|---|
| 2p | 34% | 30% | 10% | 71 |
| 3p | 32% | 24% | 7% | 78 |
| 4p | 33% | 26% | 6% | 80 |
| 5p | 34% | 28% | 6% | 84 |
| 6p | 34% | 31% | 7% | 86 |

Realistic (mixed) meta, full picture:

```
2p: stack 61/42              seat-win 45/55%          reunion 30%
4p: stack 43/32/25/18        seat-win 27/26/25/22%    reunion 26%
6p: stack 35/27/22/18/14/10  seat-win 19/16/19/16/16/14%  reunion 31%
```

Takeaways: realistic reunion ~24-31% (back near the original ~22-25% target -- contested
play self-corrects the inflated no-denial 33%); difficulty scales with table skill (same
game = ~33% casual, ~7% cutthroat, no rule change); seat balance fair at every count;
graduated score stacks. Design against the **mixed** column; cite the meta with any
reunion number.

## Player-count scaling (clock normalization)

Everything that "grows as the war progresses" keys off the number of sidekicks
that have left (`sarahsLeft`). But the sidekick count **is** the player count, so a
formula calibrated at 4 players breaks at the extremes.

Measured **before** normalization:

| metric | 2p | 4p | 6p |
|---|---|---|---|
| sidekick pts as % of all points | 5.9% | 19.6% | 44.7% |
| biggest single sidekick payout | 4 | 16 | 64 |
| max peek reached | 4 | 6 | 8 |
| biggest John / Into-the-Unknown | 2 | 8 | 32 |

Fix: key the clock systems off **progress (fraction of sidekicks gone)**, anchored
so 4p is unchanged. `engine._clockScale() = 3 / (players - 1)` (1 at 4p, >1 fewer,
<1 more). Applied to the departure ladder (`2^((n-1)*scale)`), John/ITU
(`2^(sarahsLeft*scale)`), peek (`1 + round(sarahsLeft*scale)`), `decayPeek`, and
`scaleWithSarahs` prizes. Bot value estimates mirror it (`bot.clockScale`).

Measured **after** (4p byte-for-byte unchanged):

| metric | 2p | 3p | 4p | 5p | 6p |
|---|---|---|---|---|---|
| sidekick pts as % | 13.8% | 16.2% | 19.6% | 23.3% | 25.1% |
| max sidekick payout | 16 | 16 | 16 | 16 | 16 |
| max peek | 6 | 6 | 6 | 6 | 6 |
| max John/ITU | 8 | 8 | 8 | 8 | 8 |
| reunion rate | 22.8% | 23.0% | 22.1% | 24.5% | 23.6% |
| median length | 58 | 66 | 71 | 75 | 78 |

Caps now identical at every table size. Residual: sidekick share still drifts
~14%→25% across 2p→6p — not from bigger payouts (capped) but from more departure
*events* summed. Mild (~2× vs the old ~8×) and left as intended flavor.

## Player counts (2–6)

- Pairs are 1:1 with players — only in-play pairs are shuffled in (2p deck holds
  just 2 pairs, clock = 2). Five iconic pairs + a sixth (Ripley → Newt, *Aliens*)
  so 6 works; before the 6th, player 6 reused Sarah/Kyle and the two owners
  collided on `pairId` (reunions misrouted).
- Character by size: **2p** a tight analytical duel (comeback ~27%, the leader
  holds); **4p** swingy (comeback ~56%); **6p** a sprawling brawl where the winner
  pulls away (1st ~75 vs 2nd ~45). Seat balance is near-fair at every count.

## Send / dead-bottom dynamics

- **Send always means the bottom of the Future** — one concrete, table-legal
  action (the old "clock cards reseed mid-deck" teleport was removed; not legal).
- Only ~1% of clock-ended games drain to the bottom; a median ~25 cards are never
  resolved. So sending a card down ≈ sacrificing it — **unless**:
  - it's sent **before the Timequake fires** (the single shuffle likely
    redistributes it back into the live zone), or
  - someone **yeets a sidekick** — that gates the clock (she can't leave until she
    resurfaces), forcing a near-full drain (dead zone ~25 → ~11) and reviving the
    graveyard.
- So "send to the bottom" is a read-the-board bet on remaining Timequake/yeet action.

## Crisp-ends fishing

- The only reliably-readable cards are the **top and bottom** of the Future;
  interior cuts are a guess. `_jitter` tapers to 0 at the ends
  (`J = min(cutJitter, distToEnd)`). (`cutJitter` is the simulator's model of an
  imprecise human cut — it is not a card-facing mechanic.)
- This makes bottom plays reliable: yeet John to the graveyard then pull him back
  with Actually, Fate; or yeet your own sidekick, then fish the bottom and plant
  your hero directly above her (`bot.rigReunion`) — the clock-gated drain delivers
  the couple for the instant win unless a rival breaks the stack first.

## Reunion economy

- One **13th Monkey** in the deck. At 2 copies a denial-savvy bot drove reunion
  down to ~18% (it spends the yeet almost entirely to block rival rescues); 1 copy
  → ~22%, the keeper.
- Reunion holds ~22–25% across all player counts.

## One-shots / the slugfest

- **Hasta La Vista, Baby** ×3 — destroy a peeked card; never a protectee, a hero,
  or the Timequake. ~1.3 uses/game by the bot.
- **Actually, Fate** ×2 — drag a peeked card up into the Present. A human timing
  tool; the bot effectively never fires it (its only self-interested use,
  accelerating its own hero, is a rare coincidence).
- **Into the Unknown** ×2 — clock-ladder hunt-magnets, John Connor's mechanic.
- **A Potato** — the worst Hot Potato (−9), literally a potato.

## Terminators are a REUSABLE fleet (keystone rule)

A terminator is NOT a one-shot. A lone machine plants, surfaces, hauls the card below
home, and **returns to its owner's hand to be planted again**. BUT in a buddy convoy
only the **TOP (winning) terminator survives** -- it takes the loot and recycles, while
every buddied machine below it goes **OUT OF COMMISSION** (swept home with the winner,
discarded, NOT returned to its owner). Machines also die to a hero's convoy-defense
(Kyle stands his ground), EMP, or Hasta La Vista. (Engine `_capture`: `convoy.forEach`
recycles idx 0 to hand, discards the rest; all discard if `destroyed`.)

This is the mechanism behind the "machines fighting over the last real cards" endgame --
with reuse the fleet persists and in-deck density climbs toward the end -- AND it self-
brakes, because every convoy culls its losers (~6 machines/game out of commission). So
the swarm grows but can't run away, and positioning (be the top machine, don't get
absorbed) is real skill: buddying into a convoy you don't top costs you a machine for good.

Impact (4p):

| metric | one-shot (old) | winner-only recycle (now) |
|---|---|---|
| reunion | 35.6% | 32.5% |
| captured departures | 44% | 51% |
| terminator density Q1→Q4 | 2/6/11/10% | 3/7/13/14% |
| median length | 77 | 78 |
| machines out-of-commission to rival convoys / game | n/a | ~6 |

Density climbs to the endgame and capture becomes the dominant departure fate, so late
reunions get harder (the goal). Fleet size is now a persistent swarm knob (more = denser
endgame), NOT a spend-down budget -- the section below is superseded by this model.

## Terminator count (under the OLD one-shot model -- superseded by reuse above)

Measured plant usage (bot plants aggressively, so these are upper-bound):

| players | planted/player (of 5) | ran completely out |
|---|---|---|
| 2p | 4.64 | 75% |
| 4p | 4.33 | 64% |
| 6p | 4.00 | 51% |

Players use the large majority of their machines and almost never hoard (≤1 unused on
average). **5 is well-calibrated, leaning slightly scarce** -- a majority run out, so
demand mildly exceeds supply and "I'm out of machines" is a real late-game state (good
spend-wisely tension). Not too many. 2-player is tightest (75% exhaust all five); a 6th
machine there would soften the run-dry moment but isn't needed. Don't cut below 5.

**Terminator count is an inverse lever on reunion** (4p, sweep): 3 -> 40.0% reunion,
5 -> 35.6%, 7 -> 34.3%, 9 -> 31.5%. More machines convert would-be reunions into
convoy-captures (captured departures rise 37% -> 51%, naked fall 63% -> 49%) -- a
protectee grabbed by a convoy is a reunion that never happens. It's a blunt knob though
(~2-3 reunion points per +2 machines) and high counts bloat hands (low utilization), so
prefer the cut / seeding depth for tuning reunion. Fewer machines (3) is the interesting
direction: higher reunion (40%) AND a tighter resource game (players use all three).

## Print-and-play output

- `node render-svg.js` -> `cards-svg/`, one SVG per **design** (69 designs: deck cards
  + per pair a protectee/rescuer/"YOUR PAIR" card sharing a colored heart + 6 color-
  grouped terminators). 750x1050 px = 2.5"x3.5" @ 300 DPI.
- `node render-sheets.js` -> `cards-sheets/`, the **full physical deck** expanded by real
  counts (123 cards: catalog at their copies, 6 pairs x3, 30 terminators = 5 x 6 colors),
  6-up on 8"x10" @ 300 DPI with cut marks -> 21 sheets.
- `pwsh svg-to-png.ps1 [-SvgDir .. -PngDir .. -Width .. -Height ..]` converts via headless
  Edge/Chrome (no ImageMagick needed).

## Reunion rate is a META knob (denial works -- decisively)

The denial toolkit (all engine-verified working): kill a rival's hero by planting a
terminator directly BELOW him (he charges it and dies); capture a rival sidekick
(terminator on her); mismatch-rescue her (your hero on her -> no win, her points to you,
she's gone); splice a staged couple apart. A terminator dropped ON TOP of a hero does
NOT kill him -- correct by the rule (he beats those above; kill from below).

A `denier` bot style actively executes these (hunts recent rival plants + the bottom).
Measured (4p): reunion rate is NOT a fixed property -- it depends entirely on how much
the table denies:

| opponents | reunion | length |
|---|---|---|
| passive mix (spender/hoarder/smart/pro) | 32.5% | 78 |
| ALL deniers (max denial) | 6.7% | 91 |
| 3 deniers vs 1 reuniter | 15.9% | 85 |

So the ~32% in every other measurement here is the **no-denial ceiling** -- an artifact of
bots that pursue their own couple but don't stop others. With competent, coordinated
denial reunions collapse to ~7%, and get harder the more the table wises up. The engine
already delivers "hard to reunite against good play"; the default bots just don't fight.
**When citing a reunion number, say which meta it assumes.**

## Exploit audit (degenerate-strategy hunt)

Tested for mindless/uncounterable dominant lines (bot fixtures: `topsniper`, `hijacker`,
`denier`). Seat-1 win rate, fair = 25%:

| candidate | mechanic | result |
|---|---|---|
| top-snipe | watch crisp top, drop a machine on it (uncounterable capture) | ~fair: 25% vs economy, 28% vs mix, 48% vs all-deniers |
| convoy hijack | plant above a rival's machine to steal the convoy + cull their fleet | **17% (below fair)** -- bad strategy |
| "Actually, Fate" self-delivery | pull a fat card into the Present timed to your resolve | bounded -- only 2 copies; can't build around it |
| hero-wall / self-capture / naked-theft | various | reasoned out (trade away win-con / not manipulable) |
| all-out denial | hunt+break every couple | self-neutralizing (deniers cancel; sniper counters over-denial) |

**Verdict: no dominant exploit.** Key insight -- mechanical "unstoppability" (the snipe
and hijack capture ARE uncounterable due to refill timing: a planted machine enters the
committed Present before any rival's fish) does NOT equal strategic dominance, because
every turn spent on an uncounterable parasite play is a turn not spent on your own win.
The meta is rock-paper-scissors (sniper > over-deniers > reuniters > passive farmers).
Caveat: this is "no exploit found by bot tests," not a proof -- bots can't execute every
human line (esp. the limited one-shots), so human playtest is the real audit. The only
mild outlier is the mindless top-snipe at ~28% vs realistic play: viable, not winning.

## Bot caveats

- Styles: hoarder / spender / smart / pro. Roughly balanced (~within 7 pts at 4p);
  `smart` is the weakest (it over-commits to fog plays). The bot evaluates the
  economy and the reunion race well but **underuses situational one-shots**
  (Temporal Splice, the 13th Monkey, Actually Fate) — those are human tools. A
  lookahead bot would be needed to balance them by simulation.
