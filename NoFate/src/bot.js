// Heuristic bot policy for NO FATE, shared by autoplay.js and batch.js.
// Uses only IMPLEMENTED mechanics (no one-shot uses, no downgrade/long-reach/
// veteran enforcement).

const { Game } = require('./engine');
const { buildDeckCards, buildHands, DEFAULT_PLAYERS } = require('./cards');

function chooseTake(card) {
  // take prizes/neutrals/upgrades; dodge (send) potatoes and downgrades
  return card.type === 'prize' || card.type === 'neutral' || card.type === 'upgrade';
}

// Style-aware surface choice. Characters: positive-value -> always take; negative
// (pay-points-for-aura) -> spender keeps, hoarder dodges.
function decideTake(g, card) {
  if (card.type === 'kyle') return true; // always keep (hold +2 or plant to rescue)
  if (card.type === 'character') {
    if (card.value >= 0) return true;
    return (g.currentPlayer().style || 'spender') === 'spender';
  }
  return chooseTake(card);
}

// Reactive yeet: a holder flings the just-flipped card to the bottom. A yeet is a
// scarce one-shot, so the bot spends it only on the motivated plays it can see
// with LEGAL info -- it cannot see the Present beneath the flipped card, so the
// convoy-steal (plant your machine second, yeet the rival's top one, inherit the
// haul) is left to humans. Returns the player id who yeets, or null. Priority:
//   1. BLOCK a rival's live rescue -- a rival's OWNED hero is surfacing (a planted
//      rescue / instant-win attempt) -> any other holder flings him.
//   2. SAVE your own protectee -- your sidekick surfaces and you still hold her
//      matching hero -> keep her in the deck for the reunion (the clock won't tick).
//   3. DENY a fat naked haul -- a leading rival is about to bank a high-ladder
//      sidekick he drew, and you're behind -> fling her (also revives her in play).
function yeetDecider(g) {
  const c = g.flipped;
  if (!c) return null;
  const holders = g.players.filter((p) => p.hand.some((h) => h.type === 'upgrade' && h.eff === 'YEET'));
  if (!holders.length) return null;
  const holdsHero = (p) => p.hand.some((h) => h.type === 'kyle' && h.pairId === p.pairId);

  // 1. Block a rival's live rescue attempt (their own planted hero surfacing).
  if (c.type === 'kyle' && c.owner != null) {
    const blocker = holders.find((p) => p.id !== c.owner);
    if (blocker) return blocker.id;
  }
  // 2. Save my own protectee for my reunion (I still hold her hero): yeet her to the
  //    bottom so she can't walk home naked. (No "hunt" follows -- finding her again is
  //    on my future fishes; I don't get to track her through the fog.)
  if (c.type === 'sarah') {
    const keeper = holders.find((p) => p.id === c.owner && holdsHero(p));
    if (keeper) return keeper.id; // save my own protectee from a naked walk-home by burying her
  }
  // 3. Deny a fat naked sidekick to a LEADING rival (she scores to the drawer).
  if (c.type === 'sarah' && g.sarahsLeft >= 2) {
    const drawer = g.currentPlayer();
    const denier = holders.find((p) => p.id !== drawer.id && p.id !== c.owner && g.total(drawer) > g.total(p) + 4);
    if (denier) return denier.id;
  }
  return null;
}

// Effective current value of a peeked prize (handles John's ladder + Sarah-scaling).
function effValue(c, sarahsOut, scale = 1) {
  if (c.valueLadder) return Math.round(Math.pow(2, sarahsOut * scale));
  if (c.scaleWithSarahs) return Math.max(0, c.value + c.scaleWithSarahs * Math.round(sarahsOut * scale));
  if (c.dyn) return c.value + 2; // rough estimate of dynamic value (engine computes the real one on take)
  return c.value;
}
// Normalize clock-keyed value estimates to the 4-player baseline (matches engine _clockScale).
function clockScale(g) { return g.players.length > 1 ? 3 / (g.players.length - 1) : 1; }

function terminators(p) { return p.hand.filter((c) => c.type === 'terminator'); }
function holds(p, eff) { return p.hand.some((c) => c.type === 'upgrade' && c.eff === eff); }

// Anti-machine one-shots, all post-fish: act on a rival terminator I actually PEEKED this
// turn (no blind re-aim, no jitter). One fish, then one card. EMP/Snipe destroy it; Claw
// sends it home (softer denial). Each returns true if it fired.
function empRival(g, me, seen) {
  if (!holds(me, 'U05')) return false;
  const ti = seen.findIndex((c) => c.type === 'terminator' && c.owner !== me.id);
  if (ti < 0) return false;
  g.useEMP(ti); return true;
}
function snipeRival(g, me, seen) {
  if (!holds(me, 'SNIPE')) return false;
  const ti = seen.findIndex((c) => c.type === 'terminator' && c.owner !== me.id);
  if (ti < 0) return false;
  g.useSnipe(ti); return true;
}
function clawRival(g, me, seen) {
  if (!holds(me, 'CLAW')) return false;
  const ti = seen.findIndex((c) => c.type === 'terminator' && c.owner !== me.id);
  if (ti < 0) return false;
  g.useClaw(ti); return true;
}
// Actually, Fate: if my own (still-unowned) hero is in the band I just peeked, drag
// him into the Present so he surfaces soon and reports home to me -- accelerates my
// reunion. (Returns true if used; call right after a fish.)
function pullOwnHero(g, me, seen) {
  if (!holds(me, 'PULL')) return false;
  const off = seen.findIndex((c) => c.type === 'kyle' && c.owner == null && c.pairId === me.id);
  if (off < 0) return false;
  g.usePull(off, 0); // top of the Present -> he comes home within a turn
  return true;
}

// Recovery: if I peeked my OWN hero adrift in the Future (planted, then scattered by a
// Timequake or just stranded), scoop them home for FREE -- the only way to re-stage a
// reunion after a quake. Skip if they're already set to win (my matching protectee sits
// directly below). Returns true if extracted (caller should end the fish: hero's home).
function tryExtractHero(g, me, seen) {
  if (!g.lastFish || g.lastFish.by !== me.id || g.lastFish.turn !== g.turn) return false;
  const { pos, count } = g.lastFish;
  let heroIdx = -1;
  for (let i = pos; i < pos + count && i < g.future.length; i++) {
    const c = g.future[i];
    if (c && c.type === 'kyle' && c.owner === me.id) { heroIdx = i; break; }
  }
  if (heroIdx < 0) return false;
  const below = heroIdx + 1 < pos + count ? g.future[heroIdx + 1] : null; // only judge what I actually peeked
  if (below && below.type === 'sarah' && below.owner === me.id) return false; // about to win -- leave them
  return !!g.extractHero();
}

// NOTE: there is deliberately NO targeted "hunt my sidekick" routine. A bot cannot read
// the hidden Future to find her, and (as we learned the hard way) even "track where I last
// saw her and drift" reconstructs that cheat -- with ~1 card draining per turn the estimate
// re-locks on her true position every turn, so the bot aims dead-on ~99% of the time, which
// is NOT something a human can do through interior cut-jitter. Reunions must EMERGE: the bot
// only plants its hero on its protectee when an ordinary (untargeted) fish happens to peek
// her -- see heroPlay(), which acts strictly on the band actually peeked this turn.

// Most recent rival plant depth from the log (leaked info), with how long ago.
function recentRivalPlant(g, meId) {
  for (let i = g.log.length - 1; i >= Math.max(0, g.log.length - 16); i--) {
    const e = g.log[i];
    const m = e.msg.match(/plants .* at depth (\d+)/);
    if (m && e.by !== meId) return { depth: +m[1], turn: e.turn };
  }
  return null;
}

// --- Timequake awareness: don't sink a targeted plant below an unfired quake ---
function recordTq(g, me, seen) {
  if (!g.lastFish || g.lastFish.by !== me.id) return;
  const i = seen.findIndex((c) => c.type === 'global'); // Timequake is the only global
  if (i >= 0) me._tq = { depth: g.lastFish.pos + i, turn: g.turn };
}
// True if planting at the just-fished offset would sit BELOW a known, unfired Timequake
// (which would reshuffle the Future and scatter the plant before it pays off).
function tqBlocks(g, me, off) {
  if (me.tqAware === false) return false; // ablation switch for A/B testing
  if (g.timequakeInfo || !me._tq) return false; // already fired (deck settled) or never seen
  const pos = g.lastFish.pos + off;
  const est = me._tq.depth - (g.turn - me._tq.turn); // drift up as the deck drains
  return est >= 0 && est < pos;
}

// Decide a hero plant from the peeked cards. Returns {heroId, off} or null.
//  1) WIN: your matching hero on your own protectee.
//  2) POINTS: spend a hero on a mismatched RIVAL protectee (ladder value to you),
//     but only a denial hero (not your pair) OR your own hero once your reunion is dead;
//     never your own protectee, never the pair that would gift a rival the win.
function canSendHero(g, me) {
  if (g.config.heroPlantCost === false) return true;
  return me.hand.some((c) => (c.type === 'prize' || c.type === 'neutral') && (c.locked || 0) >= 1); // a kept prize to spend
}
// When a reunion scores on the 1-2-4-8 clock (not an instant win), TIME it: later rungs
// are exponentially bigger, so don't bring your pair home early. Reunite only when the rung
// is already ripe, OR she's about to be lost (about to surface naked / a machine is poised to
// capture her) and this is the last safe shot. Otherwise HOLD and let the rung climb.
function shouldReuniteNow(g, me, seen, winIdx) {
  if (g.config.reunionEndsGame) return true;          // legacy instant-win: grab it the instant you can
  if (me.rushReunion) return true;                    // A/B: this bot always reunites on sight (no timing)
  const N = g.players.length;
  if (g.sarahsLeft >= N - 1) return true;             // top of the ladder -- the big payoff is now
  const depth = g.lastFish.pos + winIdx;              // her current Future depth
  if (depth <= g.config.presentSize) return true;     // about to cross into the frozen Present with no hero -> bank now or lose her
  if (winIdx > 0) {                                    // a rival machine sitting right above her = capture/convoy threat -> bank now
    const above = seen[winIdx - 1];
    if (above.type === 'terminator' && above.owner !== me.id) return true;
  }
  return false;                                        // safe and early -> hold for a fatter rung
}
function heroPlay(g, me, seen) {
  const heroes = me.hand.filter((c) => c.type === 'kyle');
  if (!heroes.length || !canSendHero(g, me)) return null;
  const myHero = heroes.find((h) => h.pairId === me.pairId);
  if (myHero) {
    const winIdx = seen.findIndex((c) => c.type === 'sarah' && c.owner === me.id);
    if (winIdx >= 0 && !tqBlocks(g, me, winIdx) && shouldReuniteNow(g, me, seen, winIdx)) return { heroId: myHero.id, off: winIdx };
  }
  for (const h of heroes) {
    const spendable = h.pairId !== me.pairId || me.protecteeGone; // denial hero, or my reunion is dead
    if (!spendable) continue;
    const idx = seen.findIndex((c) => c.type === 'sarah' && c.owner !== me.id && c.pairId !== h.pairId);
    if (idx >= 0 && !tqBlocks(g, me, idx)) return { heroId: h.id, off: idx };
  }
  return null;
}

// STAR-CROSS: a rival's planted hero is in my peeked band -> drop a terminator directly
// BELOW him. A terminator beneath a hero kills the hero on surfacing (the machine even
// survives), so this snuffs the rival's reunion for the price of one planted unit. Legal:
// acts only on the band peeked this turn; the terminator must land within that band.
// Returns true if it planted.
function starCross(g, me, seen) {
  if (me.noPlant > 0) return false;
  const terms = terminators(me);
  if (!terms.length) return false;
  for (let k = 0; k < seen.length - 1; k++) { // -1: need room to plant BELOW him, inside the band
    const c = seen[k];
    if (c.type === 'kyle' && c.owner && c.owner !== me.id && !tqBlocks(g, me, k + 1)) {
      g.plant(terms[0].id, k + 1); // terminator directly beneath the rival hero -> he dies on surfacing
      return true;
    }
  }
  return false;
}

// SABOTAGE star-cross: if I hold Sabotage and peeked a rival's planted hero, bury HIM to the
// bottom of the Future -- reliably (acts on the card I saw). His sidekick surfaces alone: he's
// banished to the far end and arrives way too late. The cheapest, surest star-cross (no machine
// spent), and it's the reason to actually play the card instead of hoarding it. Returns true if used.
function sabotageStarCross(g, me, seen) {
  if (!holds(me, 'U06')) return false;
  const hi = seen.findIndex((c) => c.type === 'kyle' && c.owner && c.owner !== me.id);
  if (hi < 0) return false;
  g.useSabotage(hi); // bury the rival hero -> reunion denied, "they just missed it"
  return true;
}

// HUNT A FLARE: a Flare has lit up a card for the whole table. If it's worth targeting (a
// rival hero to star-cross, a rival sidekick to capture), go after it -- fish where it was
// lit (drifting up as the deck drains; the CUT carries jitter, so you can miss), and if the
// fish actually turns it up, strike RELIABLY (terminator below a hero / above a sidekick).
// Legal: you act on a publicly-revealed card's last-known spot, not the hidden deck. This is
// what turns a Flare into the rotating-hall brawl -- everyone converging on the lit target.
// TEMPORAL SHIFT star-cross: if I hold it and peeked a rival hero, shove him 3 spaces back --
// behind his sidekick if she was above him, so she surfaces first and he's too late. Reliable.
function shiftDeny(g, me, seen) {
  if (!holds(me, 'U17')) return false;
  const hi = seen.findIndex((c) => c.type === 'kyle' && c.owner && c.owner !== me.id);
  if (hi < 0) return false;
  g.useShift(hi, 'down');
  return true;
}
function huntFlared(g, me) {
  if (me.noPlant > 0) return false;
  const terms = terminators(me);
  if (!terms.length) return false;
  const flares = (g.flareReveals || []).filter((f) => g.turn - f.turn <= 10 && g.future.some((c) => c.id === f.cardId));
  const tgt = flares.find((f) => (f.type === 'kyle' && f.owner && f.owner !== me.id) || (f.type === 'sarah' && f.owner !== me.id));
  if (!tgt) return false;
  const est = Math.max(0, Math.min(tgt.depth - (g.turn - tgt.turn), g.future.length - 1)); // drift up
  const n = g.peekCount(me.id);
  const seen = g.fish(Math.max(0, est - Math.floor(n / 2))); // hunt the lit spot (jittered cut -- may miss)
  const k = seen.findIndex((c) => c.id === tgt.cardId);
  if (k >= 0) { // found it -> reliable strike
    if (tgt.type === 'kyle' && k < seen.length - 1 && !tqBlocks(g, me, k + 1)) { g.plant(terms[0].id, k + 1); return true; } // terminator below the rival hero
    if (tgt.type === 'sarah' && !tqBlocks(g, me, k)) { g.plant(terms[0].id, k); return true; } // terminator above the rival sidekick
  }
  return true; // committed the fish to the hunt; jitter made me miss -> try again next turn
}

// Temporal Splice: returns a reorder permutation for a clear weapon/defense play, or null.
function reorderOpportunity(g, me, seen) {
  if (!me.hand.some((c) => c.type === 'upgrade' && c.eff === 'REORDER')) return null;
  const n = seen.length; if (n < 2) return null;
  // WEAPON: my own planted hero + my protectee in the band, not aligned -> hero directly above her.
  const hi = seen.findIndex((c) => c.type === 'kyle' && c.owner === me.id && c.pairId === me.pairId);
  const si = seen.findIndex((c) => c.type === 'sarah' && c.owner === me.id);
  if (hi >= 0 && si >= 0 && hi !== si - 1) {
    const order = [...Array(n).keys()].filter((i) => i !== hi);
    order.splice(order.indexOf(si), 0, hi); // hero immediately before his protectee
    return order;
  }
  // DEFENSE: any rival's planted hero in the band -> star-cross him. Splice's superpower.
  const rh = seen.findIndex((c) => c.type === 'kyle' && c.owner && c.owner !== me.id);
  if (rh >= 0) {
    const idxs = [...Array(n).keys()];
    // (a) a terminator is in the band -> re-splice it directly BELOW the hero (he dies on surfacing).
    const ti = seen.findIndex((c, i) => c.type === 'terminator' && i !== rh);
    if (ti >= 0) {
      const order = idxs.filter((i) => i !== ti);
      order.splice(order.indexOf(rh) + 1, 0, ti); // terminator immediately beneath the rival hero
      return order;
    }
    // (b) otherwise bury the hero at the bottom of the band -- away from any sidekick above him.
    if (rh !== n - 1) { const order = idxs.filter((i) => i !== rh); order.push(rh); return order; }
  }
  return null;
}

// Pick the best plant target among peeked cards. Returns {off, score}.
function bestTarget(seen, meId, sarahsOut, scale = 1) {
  let off = -1, best = 0;
  seen.forEach((c, i) => {
    let s = 0;
    if (c.type === 'sarah' && c.owner !== meId) s = 100;          // capture rival Sarah
    else if (c.type === 'terminator' && c.owner !== meId) s = 60; // sandwich rival machine
    else if (c.type === 'prize') s = effValue(c, sarahsOut, scale); // grab a prize (John scales!)
    if (c.type === 'sarah' && c.owner === meId) s = -1;           // never your own
    if (s > best) { best = s; off = i; }
  });
  return { off, best };
}

function normalFishPlant(g, rnd, me) {
  const terms = terminators(me);
  if (!terms.length && !me.hand.some((c) => c.type === 'kyle')) return;
  const aim = Math.min(g.future.length - 1, Math.floor(rnd() * rnd() * g.future.length));
  const seen = g.fish(aim);
  recordTq(g, me, seen);
  if (tryExtractHero(g, me, seen)) return; // scattered hero spotted -> pull home, re-stage next turn
  if (pullOwnHero(g, me, seen)) return; // Actually, Fate: bring my hero home fast
  if (!seen.length || me.noPlant > 0) return;
  const ro = reorderOpportunity(g, me, seen);
  if (ro) { g.reorderHere(ro); return; } // Temporal Splice: align my pair / break a rival's
  const hp = heroPlay(g, me, seen); // win or mismatch-points with a hero
  if (hp) { g.plant(hp.heroId, hp.off); return; }
  if (sabotageStarCross(g, me, seen)) return; // bury a peeked rival hero -> his sidekick comes home alone
  if (shiftDeny(g, me, seen)) return; // shove a peeked rival hero 3 back -> star-cross
  if (starCross(g, me, seen)) return; // kill a peeked rival hero (deny their reunion)
  if (empRival(g, me, seen)) return; // EMP a peeked rival machine
  if (snipeRival(g, me, seen)) return; // Hasta La Vista a peeked rival machine
  if (clawRival(g, me, seen)) return; // Claw a peeked rival machine home
  const { off, best } = bestTarget(seen, me.id, g.sarahsLeft, clockScale(g));
  if (!terms.length) return;
  let plant = false;
  if (off >= 0) {
    if (best >= 100) plant = true;
    else if (best >= 60 && terms.length >= 1) plant = true;
    else if (best >= 4 && terms.length >= 2) plant = true;
  }
  if (!plant && terms.length >= 3 && g.future.length < 70 && rnd() < 0.25) return;
  if (plant && off >= 0 && !tqBlocks(g, me, off)) g.plant(terms[0].id, off);
}

// --- Smart bot: memory of peeked cards + targeted hunting -------------------
function noteMem(g, me, seen) {
  if (!g.lastFish || g.lastFish.by !== me.id) return;
  const mem = me._mem || (me._mem = {});
  seen.forEach((c, k) => {
    mem[c.id] = { id: c.id, type: c.type, owner: c.owner, value: c.value, valueLadder: c.valueLadder, scaleWithSarahs: c.scaleWithSarahs, depth: g.lastFish.pos + k, turn: g.turn };
  });
}
function estDepth(g, m) { return Math.max(0, Math.min(m.depth - (g.turn - m.turn), g.future.length - 1)); }
function huntTarget(g, me) {
  const mem = me._mem || {};
  let best = null, bestS = 4; // only hunt things worth >=4
  for (const id in mem) {
    const m = mem[id];
    if (m.turn < g.turn - 12) continue; // memory goes stale (deck shifts, Timequake)
    let s = 0;
    if (m.type === 'sarah' && m.owner !== me.id) s = 100;
    else if (m.type === 'prize') s = effValue(m, g.sarahsLeft, clockScale(g));
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}
function smartPlant(g, me, seen, off, best) {
  const terms = terminators(me);
  const kyle = me.hand.find((c) => c.type === 'kyle' && c.pairId === me.pairId);
  const card = seen[off];
  if (card.type === 'sarah' && card.owner !== me.id) {
    if (terms.length && me.hand.some((c) => c.eff === 'U03')) {        // Temporal Insertion: exact steal for points
      g.useTemporalInsertion(g.lastFish.pos, terms[0].id, g.lastFish.pos + off); return true;
    }
  }
  let plant = false;
  if (best >= 100) plant = true; else if (best >= 60 && terms.length) plant = true; else if (best >= 4 && terms.length >= 2) plant = true;
  if (plant && terms.length && !tqBlocks(g, me, off)) { g.plant(terms[0].id, off); return true; }
  return false;
}
function smartFish(g, rnd, me) {
  // dump a stuck potato (Quartermaster if held, else re-bury)
  const potato = me.hand.find((c) => c.type === 'potato');
  if (potato) {
    if (me.hand.some((c) => c.eff === 'U07')) { g.useQuartermaster(potato.id); return; }
    if (rnd() < 0.8) { g.reburyPotato(potato.id, Math.floor(rnd() * g.future.length)); return; }
  }
  // hunt a remembered target, else scan to build memory (anti-machine one-shots fire POST-fish, below)
  const tgt = huntTarget(g, me);
  me._scan = ((me._scan || 0) + 9) % Math.max(1, g.future.length);
  const aim = tgt ? estDepth(g, tgt) : Math.min(g.future.length - 1, me._scan);
  const seen = g.fish(aim);
  noteMem(g, me, seen); recordTq(g, me, seen);
  if (tryExtractHero(g, me, seen)) return; // scattered hero spotted -> pull home, re-stage next turn
  if (pullOwnHero(g, me, seen)) return; // Actually, Fate: bring my hero home fast
  if (me.noPlant === 0) {
    const ro = reorderOpportunity(g, me, seen);
    if (ro) { g.reorderHere(ro); return; }
    const hp = heroPlay(g, me, seen); // win, or mismatch-points with a hero
    if (hp) { g.plant(hp.heroId, hp.off); return; }
    if (sabotageStarCross(g, me, seen)) return; // bury a peeked rival hero -> his sidekick comes home alone
    if (shiftDeny(g, me, seen)) return; // shove a peeked rival hero 3 back -> star-cross
    if (starCross(g, me, seen)) return; // kill a peeked rival hero (deny their reunion)
    if (empRival(g, me, seen)) return; // EMP a peeked rival machine
    if (snipeRival(g, me, seen)) return; // Hasta La Vista a peeked rival machine
    if (clawRival(g, me, seen)) return; // Claw a peeked rival machine home
  }
  if (seen.length && me.noPlant === 0) {
    const { off, best } = bestTarget(seen, me.id, g.sarahsLeft, clockScale(g));
    if (off >= 0) smartPlant(g, me, seen, off, best);
  }
  // bonus actions
  if (terminators(me).length >= 2 && me.hand.some((c) => c.eff === 'U04')) {
    g.useFieldPromotion();
    const s2 = g.fish(Math.min(g.future.length - 1, (me._scan + 5) % Math.max(1, g.future.length)));
    noteMem(g, me, s2); recordTq(g, me, s2);
    if (s2.length && me.noPlant === 0) { const t = bestTarget(s2, me.id, g.sarahsLeft, clockScale(g)); if (t.off >= 0) smartPlant(g, me, s2, t.off, t.best); }
  }
  if (me.defector && terminators(me).length && me.noPlant === 0) {
    const s3 = g.fish(Math.min(g.future.length - 1, (me._scan + 13) % Math.max(1, g.future.length)));
    noteMem(g, me, s3); recordTq(g, me, s3);
    if (s3.length) { const t = bestTarget(s3, me.id, g.sarahsLeft, clockScale(g)); if (t.off >= 0) smartPlant(g, me, s3, t.off, t.best); }
  }
}

// --- Pro bot: bank like the hoarder, add ONLY clearly +EV active plays --------
function proPlant(g, rnd, me) {
  const terms = terminators(me);
  if (!terms.length && !me.hand.some((c) => c.type === 'kyle')) return;
  const aim = Math.min(g.future.length - 1, Math.floor(rnd() * rnd() * g.future.length));
  const seen = g.fish(aim);
  recordTq(g, me, seen);
  if (tryExtractHero(g, me, seen)) return; // scattered hero spotted -> pull home, re-stage next turn
  if (pullOwnHero(g, me, seen)) return; // Actually, Fate
  if (!seen.length || me.noPlant > 0) return;
  const ro = reorderOpportunity(g, me, seen);
  if (ro) { g.reorderHere(ro); return; }
  const hp = heroPlay(g, me, seen);
  if (hp) { g.plant(hp.heroId, hp.off); return; }
  if (sabotageStarCross(g, me, seen)) return; // bury a peeked rival hero -> his sidekick comes home alone
  if (shiftDeny(g, me, seen)) return; // shove a peeked rival hero 3 back -> star-cross
  if (starCross(g, me, seen)) return; // kill a peeked rival hero (deny their reunion)
  if (empRival(g, me, seen)) return; // EMP a peeked rival machine
  if (snipeRival(g, me, seen)) return; // Hasta La Vista a peeked rival machine
  if (clawRival(g, me, seen)) return; // Claw a peeked rival machine home
  const { off, best } = bestTarget(seen, me.id, g.sarahsLeft, clockScale(g));
  if (off < 0 || tqBlocks(g, me, off)) return; // don't sink a plant below an unfired Timequake
  if (terms.length) {
    if (best >= 60) { g.plant(terms[0].id, off); return; }       // capture rival Sarah / sandwich
    if (best >= 5 && terms.length >= 2) { g.plant(terms[0].id, off); return; } // strong prize only
  }
}
function proFish(g, rnd, me) {
  const potato = me.hand.find((c) => c.type === 'potato');
  if (potato) {
    if (me.hand.some((c) => c.eff === 'U07')) { g.useQuartermaster(potato.id); return; }
    if (rnd() < 0.8) { g.reburyPotato(potato.id, Math.floor(rnd() * g.future.length)); return; }
  }
  proPlant(g, rnd, me); // anti-machine one-shots fire POST-fish inside proPlant, on the peeked band
  if (terminators(me).length >= 2 && me.hand.some((c) => c.eff === 'U04')) { g.useFieldPromotion(); proPlant(g, rnd, me); }
  if (me.defector && terminators(me).length && me.noPlant === 0) { proPlant(g, rnd, me); }
}

// --- Top-sniper: the mindless exploit. Watch the crisp TOP; if a grabbable enemy
// card is there, drop a terminator on it. Uncounterable (the machine enters the
// committed Present before any rival's fish). Used to test whether it dominates.
function topSniperFish(g, me) {
  const seen = g.fish(0); // crisp top of the Future
  if (!seen.length || me.noPlant > 0) return;
  const top = seen[0]; const terms = terminators(me);
  if (!terms.length) return;
  const grab = (top.type === 'sarah' && top.owner !== me.id) || top.type === 'prize';
  if (grab) g.plant(terms[0].id, 0); // terminator ON the top card -> captures it, uncounterably
}

// --- Convoy hijacker: steal rivals' convoys by planting ABOVE their machines
// (their loot comes to me, their machines get absorbed). Audit fixture.
function hijackerFish(g, me) {
  const rp = recentRivalPlant(g, me.id);
  const aim = rp ? Math.max(0, rp.depth - (g.turn - rp.turn))
    : Math.max(0, g.future.length - 1 - Math.floor((g.peekCount(me.id) + 4)));
  const seen = g.fish(aim);
  if (!seen.length || me.noPlant > 0) return;
  const terms = terminators(me); if (!terms.length) return;
  // own win if it's right here
  const hp = heroPlay(g, me, seen); if (hp) { g.plant(hp.heroId, hp.off); return; }
  if (sabotageStarCross(g, me, seen)) return; // bury a peeked rival hero
  if (shiftDeny(g, me, seen)) return; // shove a peeked rival hero 3 back -> star-cross
  if (starCross(g, me, seen)) return; // kill a peeked rival hero
  // hijack: plant directly ABOVE a rival's planted terminator -> I top the convoy
  const ri = seen.findIndex((c) => c.type === 'terminator' && c.owner !== me.id);
  if (ri >= 0 && !tqBlocks(g, me, ri)) { g.plant(terms[0].id, ri); return; }
  // else grab loot off the top
  const top = seen[0];
  if (((top.type === 'sarah' && top.owner !== me.id) || top.type === 'prize') && !tqBlocks(g, me, 0)) g.plant(terms[0].id, 0);
}

// --- Denier bot: actively HUNTS and breaks rivals' couples ------------------
// Still pursues its own win, but otherwise spends its turn denying: kill a rival's
// planted hero (terminator directly BELOW him), capture/mismatch-rescue a rival
// sidekick, or splice a staged pair apart. Hunts recent rival plants + the bottom.
function denierFish(g, rnd, me) {
  const potato = me.hand.find((c) => c.type === 'potato');
  if (potato && rnd() < 0.7) { g.reburyPotato(potato.id, Math.floor(rnd() * g.future.length)); return; }
  const rp = recentRivalPlant(g, me.id);
  const aim = rp ? Math.max(0, rp.depth - (g.turn - rp.turn))
    : Math.max(0, g.future.length - 1 - Math.floor(rnd() * Math.min(g.future.length, g.peekCount(me.id) + 6))); // scan near the bottom, where sidekicks/couples live
  const seen = g.fish(aim);
  if (!seen.length) return;
  // 1) take my own win / mismatch-deny with my hero (heroPlay covers both)
  if (me.noPlant === 0) { const hp = heroPlay(g, me, seen); if (hp) { g.plant(hp.heroId, hp.off); return; } }
  if (sabotageStarCross(g, me, seen)) return; // bury a peeked rival hero -> his sidekick comes home alone
  if (shiftDeny(g, me, seen)) return; // shove a peeked rival hero 3 back -> star-cross
  if (starCross(g, me, seen)) return; // kill a peeked rival hero (deny their reunion)
  // 2) splice a rival's staged couple apart
  const ro = reorderOpportunity(g, me, seen); if (ro) { g.reorderHere(ro); return; }
  const terms = terminators(me);
  if (me.noPlant === 0 && terms.length) {
    // 3) KILL a rival's planted hero -- terminator directly BELOW him (he charges it and dies)
    const hOff = seen.findIndex((c) => c.type === 'kyle' && c.owner != null && c.owner !== me.id);
    if (hOff >= 0 && hOff < seen.length - 1 && !tqBlocks(g, me, hOff + 1)) { g.plant(terms[0].id, hOff + 1); return; }
    // 4) CAPTURE a rival's sidekick (denies her reunion, and scores to me)
    const sOff = seen.findIndex((c) => c.type === 'sarah' && c.owner !== me.id);
    if (sOff >= 0 && !tqBlocks(g, me, sOff)) { g.plant(terms[0].id, sOff); return; }
  }
  // 5) fall back to own economy (strong targets only)
  if (me.noPlant > 0) return;
  const { off, best } = bestTarget(seen, me.id, g.sarahsLeft, clockScale(g));
  if (terms.length && off >= 0 && best >= 60 && !tqBlocks(g, me, off)) g.plant(terms[0].id, off);
}

// The full Fish phase: play free intel (Bullet Time), take one Fish action, then any
// extra Fish actions granted by prize riders.
function doFish(g, rnd) {
  const me = g.currentPlayer();
  if (g.future.length === 0) return;
  if (holds(me, 'BULLET')) g.useBulletTime(); // free read of the whole Present (bot can't deeply exploit foreknowledge -- a human card)
  doFishOnce(g, rnd, me);
  let guard = 0;
  while ((me.extraFish || 0) > 0 && g.future.length > 0 && guard++ < 6) { me.extraFish -= 1; doFishOnce(g, rnd, me); }
}

// One Fish action for the current player. `rnd` is the bot's RNG.
// me.style: 'hoarder' | 'spender' | 'smart' | 'pro' | 'denier'.
function doFishOnce(g, rnd, me) {
  const style = me.style || 'spender';
  if (g.future.length === 0) return;
  if (me.skipFish > 0) { g.fish(0); return; } // Temporal Sickness
  if (style !== 'topsniper' && huntFlared(g, me)) return; // a Flare lit a juicy target -> converge on it
  if (style === 'topsniper') { topSniperFish(g, me); return; }
  if (style === 'hijacker') { hijackerFish(g, me); return; }
  if (style === 'denier') { denierFish(g, rnd, me); return; }
  if (style === 'pro') { proFish(g, rnd, me); return; }
  if (style === 'smart') { smartFish(g, rnd, me); return; }

  // Both: ditch a stuck potato (point preservation, not an "ability use").
  const potato = me.hand.find((c) => c.type === 'potato');
  if (potato && rnd() < 0.6) {
    if (style === 'spender' && me.hand.some((c) => c.eff === 'U07')) { g.useQuartermaster(potato.id); return; }
    g.reburyPotato(potato.id, Math.floor(rnd() * g.future.length)); return;
  }

  // Normal fish + plant (anti-machine one-shots are decided POST-fish, inside, on the peeked band).
  normalFishPlant(g, rnd, me);

  // Spender: Field Promotion buys an extra fish+plant (more machines down).
  if (style === 'spender' && terminators(me).length >= 2 && me.hand.some((c) => c.eff === 'U04') && rnd() < 0.7) {
    g.useFieldPromotion();
    normalFishPlant(g, rnd, me);
  }

  // The Defector aura: a free extra Fish + plant every turn (whoever kept it).
  if (me.defector && terminators(me).length && g.future.length > 0 && me.noPlant === 0) {
    normalFishPlant(g, rnd, me);
  }
}

function playGame({ seed = 1, jitter = 3, seeding = 'blind', players, maxBuddy = null, timequakeOff = false, styles, charScale = 1, handCap = 7, sarahLadderMult = 1, sarahCaptureMult = 2, basePeek = 1, peekScalesWithSarahs = true, peekInverted = false, heroesInHand = true, heroPlantCost = true, yeetCopies = 2, splitSeed = true, splitFraction = null, terminatorsPer = 5 } = {}) {
  let deckCards = arguments[0].deckCards; // explicit deck override (e.g. for A/B deck experiments)
  const prizeScale = arguments[0].prizeScale != null ? arguments[0].prizeScale : 1;
  const deckScale = arguments[0].deckScale != null ? arguments[0].deckScale : 1;
  if (charScale !== 1 || prizeScale !== 1 || deckScale < 1) {
    let cards = buildDeckCards().map((c) => {
      if (c.type === 'character') return { ...c, value: Math.round(c.value * charScale) };
      if (c.type === 'prize' && !c.valueLadder && !c.scaleWithSarahs && prizeScale !== 1) return { ...c, value: Math.max(0, Math.round(c.value * prizeScale)) };
      return c;
    });
    if (deckScale < 1) {
      const keep = cards.filter((c) => c.type === 'global' || c.valueLadder); // globals + John always survive
      const trim = cards.filter((c) => !(c.type === 'global' || c.valueLadder));
      let s = (seed * 7919 + 13) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (let i = trim.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [trim[i], trim[j]] = [trim[j], trim[i]]; }
      const target = Math.max(0, Math.round(cards.length * deckScale) - keep.length);
      cards = keep.concat(trim.slice(0, target));
    }
    deckCards = cards;
  }
  if (yeetCopies !== 2) { // A/B knob: 1 vs 2 copies of The 13th Monkey
    const base = deckCards || buildDeckCards();
    const yeets = base.filter((c) => c.eff === 'YEET');
    deckCards = base.filter((c) => c.eff !== 'YEET').concat(yeets.slice(0, yeetCopies));
  }
  const hands = terminatorsPer !== 5 ? buildHands(players || DEFAULT_PLAYERS, terminatorsPer) : undefined;
  const g = new Game({ seed, players, deckCards, hands, config: { cutJitter: jitter, maxBuddy, timequakeOff, handCap, sarahLadderMult, sarahCaptureMult, basePeek, peekScalesWithSarahs, peekInverted, heroesInHand, heroPlantCost, reunionEndsGame: arguments[0].reunionEndsGame !== undefined ? arguments[0].reunionEndsGame : true, splitSeed, splitFraction } });
  if (styles) g.players.forEach((p, i) => { p.style = styles[i] || 'spender'; });
  if (arguments[0].tqAware) g.players.forEach((p, i) => { p.tqAware = arguments[0].tqAware[i]; });
  if (arguments[0].rush) g.players.forEach((p, i) => { p.rushReunion = !!arguments[0].rush[i]; });
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  let guard = 0;
  while (!g.isOver() && guard++ < 2000) {
    if (g.phase === 'setup') { g.deal(); continue; }
    if (g.phase === 'resolve') { g.resolveTop(); continue; }
    if (g.phase === 'yeetWindow') { const y = yeetDecider(g); if (y) g.doYeet(y); else g.passYeet(); continue; }
    if (g.phase === 'choice') { g.choose(decideTake(g, g.pending)); continue; }
    if (g.phase === 'fish') { doFish(g, rnd); g.endTurn(); continue; }
    break;
  }
  for (const p of g.players) g.enforceCap(p); // a game can end mid-turn; trim any final over-cap hand
  return g;
}

// Convoy-size stats from a finished game's log.
function convoyStats(g) {
  const sizes = [];
  for (const e of g.log) {
    const m = e.msg.match(/convoy of (\d+) ->/);
    if (m) sizes.push(+m[1]);
  }
  return {
    convoys: sizes.length,
    maxConvoy: sizes.length ? Math.max(...sizes) : 0,
    mega: sizes.filter((n) => n >= 4).length, // 4+ machines
    sizes,
  };
}

module.exports = { playGame, doFish, chooseTake, convoyStats };
