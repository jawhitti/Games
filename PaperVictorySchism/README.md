# Paper Victory -- King vs Pope (base game) simulator

A dependency-free Node Monte Carlo for the **two-throne base game** (rulebook v0.1):
a King and a Pope race to raise a monument while everyone secretly banks Conviction.
The secret aggregate decides which throne is legitimate; the other is the pretender;
anyone whose *public* favor leaned pretender is purged; among survivors the top secret
backer of the legitimate throne wins. Completing a monument only *triggers* the
reckoning -- it does not win (the paper victory).

Separate and self-contained -- shares nothing with the `PaperVictory` (The Reign) sim.

## Run

```
node batch.js              # default, 5000 games
node batch.js --sweep      # sweep the Fine (the designer's #1 question)
node batch.js --set monumentCost=20
```

## Honest abstraction

Deliberate **feinting/bluffing and table-talk are not modeled.** Bots play honestly:
public favor tracks their real predicted side as far as coin allows, and the only
source of public/secret divergence is **poverty-coercion** (a courtier too poor to pay
the Fine is forced to accept a brand they don't believe). So the sim measures the
mechanical skeleton, not the social game -- and it specifically reveals where the
social game is load-bearing.

## What it shows (defaults, thousands of games)

- **The thrones almost never win** (~5%; courtiers take ~85%). The two marquee seats
  are maximally branded to one color and mostly *facilitate* a quiet courtier's win.
  This is the base game's version of the worry I had about The Reign's king -- and it's
  real here too.
- **Completing a monument is near-certain death** (paper victory ~= 100% of
  completions). Building means levying and fining the court, which alienates it, which
  makes you the pretender -- so you finish your monument and die on it. The "build your
  own gallows" tragedy is *very* strong; arguably too deterministic (pure DENOUNCE
  dominates as the safer trigger).
- **The assassination/vitality game is dead** (~0% deaths) under honest bots -- the -1
  "cup" only gets planted when an *opponent* is coerced into a Branding favor, which is
  rare. A greedier courtier (take the bribe AND stab) would revive it; my bots leave it
  on the table. Likely a bot-logic suppression, not a pure design flaw.
- **The Fine knob works BACKWARDS from the design intuition** in an honest-bot model.
  The rulebook expects "high Fine -> no feints -> the ledger predicts the secret vote
  (flat); low Fine -> cheap feints -> noise." But with no strategic feinting, the only
  decorrelator is poverty-coercion, which a *higher* Fine *increases* -- so the ledger
  gets *less* predictive as the Fine rises (~84% -> ~66%). The designer's hoped-for
  dynamic only exists if players actually feint. **The central tension rests on a
  social layer the sim can't supply.**

## The "whose call do you answer" variant (`calls.js`, `src/engine_calls.js`)

The strongest synthesis of the whole design exploration. Each round **both thrones
call the court**, and every courtier answers **one**: a GIFT call pays them and brands
them (courtship); a DEMAND call taxes them into that throne's monument and brands them
harder (coercion). Answering one snubs the other -- the accumulated brand *is* your
public allegiance. Two thrones compete for one scarce pool of answers; conviction is
still banked in secret; the reckoning (the paper king) is unchanged.

Run: `node calls.js` / `node calls.js --set monumentCost=22`.

What emerges (the sim only judges the economy; the whisper layer is table-only):

- **The generosity→brutality arc arises on its own.** Share of calls that are gifts:
  **~54% early → 0% late.** No hand-tuned schedule -- a throne courts while on pace and
  is forced to coerce once its monument lags. Robust across monument costs.
- **The funding "struggle" is real, expressed as compulsion.** Gifting wins allegiance
  but builds nothing; only demanding builds. So a throne *cannot finish by being loved*
  -- it must turn coercive to raise its monument, and the coercion is what damns it.
- **Paper kings hold.** Thrones win ~11-13%, courtiers ~87-89%. Completing your monument
  gets you executed ~17% of the time (the paper victory). The man on the throne is the
  mark; the Littlefingers win.

This is the recommended direction: it keeps the land-gifting/fund-squeeze economy, makes
public allegiance an active per-round choice between two suitors, and stays true to the
"whispers in the hallway / paper king" thesis. (An optional per-round event card could
tilt *whose call is worth answering* for variety -- not needed for the engine.)

## Files

- `src/config.js` -- all knobs.
- `src/engine.js` -- the two-throne game + reckoning.
- `batch.js` -- runner + the Fine sweep.

## Noted future direction

Courtiers passing **secret messages to a throne urging a DENOUNCE** -- a private
(possibly lying) information channel to the throne's one big decision. This is exactly
the manipulation layer the Fine-sweep finding says the game needs, and the natural next
thing to model.
