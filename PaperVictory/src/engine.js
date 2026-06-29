// Paper Victory: The Reign -- second-half simulator (Phase 3 Reign + Phase 4 the
// Rebellion muster).
//
// REBELLION MODEL (per Jason's spec): rebellion is a DISCRETE MUSTER, not a drift.
//  - The king goes house to house each round, asking favors (cost scales with Castle
//    progress), sweetening with valued lands while his deck lasts, and -- once nobles
//    can no longer pay -- seizing land (and jailing). This builds grievance.
//  - When the court looks ripe, an aggrieved noble cries "Rebellion!". Every noble
//    then SECRETLY commits to join (send help) or stand with the crown, and all
//    reveal at once. A MAJORITY of nobles answering the call topples the king.
//  - A crushed (minority) rising is purged -- the exposed rebels are executed -- and
//    the reign continues. Completing the Castle forces a final muster.
//  - The hidden layer is the secret commitment: the ally who pledged loyalty and
//    secretly answered is the knife no one saw.

const { Rng } = require("./rng");
const { buildRoster, HOUSE_KINDS } = require("./bots");

const ASSET_TYPES = ["estate", "factory", "charter"];

function label(n) {
  return `${n.house} (${n.kind}, ${n.color === "lose" ? "burned" : "king's"} color)`;
}

// ---- land helpers (typed, valued) ----------------------------------------

function ownWorth(n) {
  let s = 0;
  for (const l of n.lands) if (l.type === n.scoringType) s += l.value;
  return s;
}
function totalWorth(n) {
  let s = 0;
  for (const l of n.lands) s += l.value;
  return s;
}
function bestLandIdx(n) {
  let idx = -1, best = -1;
  for (let i = 0; i < n.lands.length; i++) {
    const l = n.lands[i];
    const pref = (l.type === n.scoringType ? 100 : 0) + l.value;
    if (pref > best) { best = pref; idx = i; }
  }
  return idx;
}
function bestLandValue(n) {
  const i = bestLandIdx(n);
  return i < 0 ? 0 : n.lands[i].value;
}
function seizeBestLand(n) {
  const i = bestLandIdx(n);
  if (i < 0) return null;
  return n.lands.splice(i, 1)[0];
}

// ---- king setup -----------------------------------------------------------

function makeKing(cfg, rng) {
  const deck = [];
  for (const type of ASSET_TYPES)
    for (let i = 0; i < (cfg.grantDeck[type] || 0); i++)
      deck.push({ type, value: cfg.landValueMin + rng.int(cfg.landValueMax - cfg.landValueMin + 1) });
  return {
    coin: 0,
    castle: 0,
    deck,
    deckSize0: deck.length,
    lands: [], // lands the king has SEIZED and holds (his personal score)
    grantsGiven: 0,
    grantsDenied: 0,
    seizes: 0,
    seizeThreats: 0,
    seizesExecuted: 0,
    seizesPaidDown: 0,
    imprisonments: 0,
    earlySeizes: 0,
    lateSeizes: 0,
    musters: 0, // rebellions declared
    crushed: 0, // rebellions crushed
  };
}

// ---- king's house-to-house turn ------------------------------------------

function favorCost(cfg, king, rng) {
  const progress = Math.min(1, king.castle / cfg.castleTarget);
  const base = cfg.favorMin + (cfg.favorMax - cfg.favorMin) * progress;
  const c = Math.round(base + rng.noise(cfg.favorJitter * 2));
  return Math.max(cfg.favorMin, Math.min(cfg.favorMax, c));
}
function tallySeize(cfg, king) {
  if (king.castle / cfg.castleTarget < 0.4) king.earlySeizes += 1;
  else king.lateSeizes += 1;
}
function anyAvailableType(deck) {
  for (const t of ASSET_TYPES) if (deck.some((l) => l.type === t)) return t;
  return null;
}
function drawSweetener(king, cost, preferType) {
  if (king.deck.length === 0) return null;
  let idx = -1, bestScore = Infinity;
  for (let i = 0; i < king.deck.length; i++) {
    const l = king.deck[i];
    const s = Math.abs(l.value - cost) + (l.type === preferType ? 0 : 3);
    if (s < bestScore) { bestScore = s; idx = i; }
  }
  return king.deck.splice(idx, 1)[0];
}
function giveLand(king, target, land, rec) {
  target.lands.push(land);
  target.favor += land.type === target.scoringType ? land.value * 0.4 + 1 : 1;
  king.grantsGiven += 1;
  if (rec)
    rec.push(`    grants a ${land.type}(${land.value}) to ${label(target)}` +
      (land.type === target.scoringType ? " -- it scores for them." : " -- a cheap brand."));
}
function chooseGrantTarget(cfg, king, nobles) {
  const pool = nobles.filter((n) => n.alive && !n.imprisoned);
  if (!pool.length) return null;
  if (cfg.kingStrategy === "gentle") return pool.reduce((a, b) => (b.favor < a.favor ? b : a));
  const wavering = pool.filter((n) => n.losing);
  if (wavering.length) return wavering.reduce((a, b) => (b.favor < a.favor ? b : a));
  return pool.reduce((a, b) => (b.grievance > a.grievance ? b : a));
}
function decideSweeten(cfg, king, target, rng) {
  if (king.deck.length <= cfg.kingReserve) return false; // hold the reserve to win
  const deckFrac = king.deckSize0 ? king.deck.length / king.deckSize0 : 0;
  if (cfg.kingStrategy === "savage") return rng.chance(0.2 * deckFrac);
  if (cfg.kingStrategy === "gentle") return rng.chance(0.5 + 0.5 * deckFrac);
  if (target.losing && target.favor < cfg.boughtOffFavor + 2) return rng.chance(0.5 + 0.5 * deckFrac);
  return rng.chance(0.2 + 0.5 * deckFrac);
}
function chooseTaxTarget(cfg, nobles) {
  const pool = nobles.filter((n) => n.alive && !n.imprisoned);
  if (!pool.length) return null;
  // squeeze the asset-rich, cash-poor (the seizure target)
  return pool.reduce((a, b) => (totalWorth(b) - b.coin > totalWorth(a) - a.coin ? b : a));
}

function collectDemand(cfg, king, target, amt, rng, rec) {
  if (target.refuseLeft > 0) {
    target.refuseLeft -= 1;
    if (rec) rec.push(`    ${label(target)} invokes Varrochi's right and REFUSES.`);
    return;
  }
  if (target.coin < amt && target.iouToCoinLeft > 0) {
    target.coin += amt;
    target.iouToCoinLeft -= 1;
    if (target.promises > 0) target.promises -= 1;
    if (rec) rec.push(`    ${label(target)} melts an IOU into coin (Brandt) to pay.`);
  }
  if (target.coin >= amt) {
    target.coin -= amt;
    king.castle += amt;
    target.resentment += amt * 0.4;
    if (rec) rec.push(`    ${label(target)} pays ${amt}. Castle ${king.castle}/${cfg.castleTarget}.`);
    return;
  }
  // illiquid -> High Society squeeze: surrender the coveted land, no change, jailed
  if (cfg.seizureEnabled && totalWorth(target) > 0) {
    if (cfg.seizeMode === "immediate") {
      tallySeize(cfg, king);
      const land = seizeBestLand(target);
      king.castle += land.value;
      king.lands.push(land);
      king.seizes += 1;
      if (cfg.landPaymentImprisons) { target.imprisoned = true; king.imprisonments += 1; }
      target.resentment += (land.value - amt) * 0.5 + amt * 0.4;
      target.grievance += cfg.seizeExecGrievance;
      if (rec) rec.push(`    ${label(target)} holds only ${target.coin} coin -- King takes a land worth ${land.value} for a ${amt} tax (no change)` +
        (cfg.landPaymentImprisons ? " and jails them. A martyr made." : "."));
      return;
    }
    if (!target.pendingSeize) {
      target.pendingSeize = cfg.seizeGrace;
      target.pendingAmt = amt;
      target.threats += 1;
      target.grievance += cfg.seizeGrievance;
      king.seizeThreats += 1;
      if (rec) rec.push(`    ${label(target)} holds only ${target.coin} coin -- King demands a land worth ${bestLandValue(target)} for a ${amt} tax. Pay ${amt} in time or lose it.`);
    }
    return;
  }
  if (cfg.prisonEnabled && totalWorth(target) === 0) {
    target.imprisoned = true;
    king.imprisonments += 1;
    target.resentment += 4;
    target.grievance += cfg.seizeExecGrievance;
    if (rec) rec.push(`    ${label(target)} is destitute -- jailed for the unpaid demand.`);
    return;
  }
  target.resentment += 1;
}

function executePendingSeizures(cfg, king, nobles, rec) {
  for (const n of nobles) {
    if (!n.alive || !n.pendingSeize) continue;
    n.pendingSeize -= 1;
    if (n.pendingSeize > 0) continue;
    if (totalWorth(n) > 0) {
      tallySeize(cfg, king);
      const land = seizeBestLand(n);
      king.castle += land.value;
      king.lands.push(land);
      king.seizesExecuted += 1;
      if (cfg.landPaymentImprisons) { n.imprisoned = true; king.imprisonments += 1; }
      n.grievance += cfg.seizeExecGrievance;
      if (rec) rec.push(`  Grace runs out -- King takes ${label(n)}'s land worth ${land.value}` +
        (cfg.landPaymentImprisons ? " and jails them. A martyr made." : "."));
    }
    n.pendingSeize = 0;
  }
}
function maybePayDownSeize(cfg, king, n, rec) {
  if (!n.pendingSeize || n.coin < n.pendingAmt) return;
  // a noble defends its land if it can; the deeply aggrieved let it ride
  if (n.grievance > 6) return;
  n.coin -= n.pendingAmt;
  king.castle += n.pendingAmt;
  n.pendingSeize = 0;
  n.pendingAmt = 0;
  if (n.threats > 0) n.threats -= 1;
  n.grievance = Math.max(0, n.grievance - cfg.seizeGrievance);
  king.seizesPaidDown += 1;
  if (rec) rec.push(`  ${label(n)} scrapes up the coin and buys off the seizure.`);
}

function kingVisitHouse(cfg, king, target, rng, rec) {
  const cost = favorCost(cfg, king, rng);
  const sweeten = decideSweeten(cfg, king, target, rng);
  if (sweeten) {
    const enrich = cfg.kingStrategy === "gentle" ? rng.chance(0.6) : rng.chance(0.3);
    const preferType = enrich ? target.scoringType : rng.pick(ASSET_TYPES);
    if (rec) rec.push(`  King asks a favor of ${cost} from ${label(target)}, sweetened:`);
    const land = drawSweetener(king, cost, preferType);
    if (land) giveLand(king, target, land, rec);
  } else if (rec) {
    rec.push(`  King demands ${cost} of ${label(target)}:`);
  }
  collectDemand(cfg, king, target, cost, rng, rec);
}

function visitOrder(nobles) {
  return nobles
    .filter((n) => n.alive && !n.imprisoned)
    .sort((a, b) => (b.losing ? 1 : 0) - (a.losing ? 1 : 0) || a.favor - b.favor);
}

// ---- the rebellion muster -------------------------------------------------

// how restless the court looks (a public read every noble shares)
function roomDiscontent(cfg, nobles) {
  const all = nobles.filter((n) => n.alive);
  if (!all.length) return 0;
  let d = 0;
  for (const n of all)
    d += n.grievance * 0.3 + (n.losing ? 0.6 : 0) + n.threats * 0.2 - n.favor * 0.2 + (n.imprisoned ? 1 : 0);
  return d / all.length;
}

// each noble's SECRET commitment: join (send help) or stand with the crown
function willJoin(cfg, n, room, rng) {
  if (n.strat === "loyalist") return false; // true believer never rises
  if (n.imprisoned) return true; // a jailed noble wants him gone
  const colorBias = n.losing ? cfg.colorTilt : -cfg.colorTilt;
  const personal = n.grievance + n.threats * cfg.iouTilt - n.favor * 0.5;
  const bandwagon = cfg.coordination * room * cfg.musterK;
  const wBand = n.strat === "opportunist" ? 1.6 : 1.0; // opportunists chase the winner
  const wPers = n.strat === "opportunist" ? 0.4 : 1.0;
  const score = colorBias + personal * wPers + bandwagon * wBand + rng.noise(cfg.musterNoise * 2);
  return score > cfg.musterThreshold;
}

function resolveMuster(cfg, king, nobles, trigger, rng, rec) {
  king.musters += 1;
  const all = nobles.filter((n) => n.alive);
  const room = roomDiscontent(cfg, nobles);
  if (rec) rec.push(`\n=== "REBELLION!" (${trigger}) -- the court commits in secret, then reveals... ===`);
  let joiners = 0;
  for (const n of all) {
    n.joined = willJoin(cfg, n, room, rng);
    if (n.joined) joiners += 1;
  }
  const N = all.length;
  const success = joiners * 2 > N; // a majority of nobles topples the king
  if (rec) {
    for (const n of all)
      rec.push(`  ${label(n)} -- ${n.joined ? "JOINS the rising" : "stands with the crown"}${n.imprisoned ? " (from a cell)" : ""}.`);
    rec.push(`  ${joiners}/${N} answered the call -> ${success ? "the king FALLS" : "REBELLION CRUSHED"}.`);
  }
  return { success, joiners, N };
}

// a crushed rising: the exposed rebels are purged
function crushRebellion(king, nobles, rec) {
  for (const n of nobles)
    if (n.alive && n.joined) {
      n.alive = false;
      if (rec) rec.push(`  PURGE: ${label(n)} is executed for rising.`);
    }
}

// ---- scoring --------------------------------------------------------------

function score(cfg, n, rebelWon) {
  let rewards = rebelWon ? n.threats * cfg.threatVP : n.promises * cfg.promiseVP;
  if (rebelWon && n.joined) rewards += cfg.rebelHeroVP;
  return n.coin * cfg.coinVP + ownWorth(n) * cfg.assetVP + rewards;
}

// ---- top-level game -------------------------------------------------------

// inject (optional): { nobles: [campaign carry-over], king: {elimRank, crownDesire} }
function playGame(cfg, seed, rec, inject) {
  const rng = new Rng(seed);
  const king = makeKing(cfg, rng);
  const nobles = buildRoster(cfg, rng, inject ? inject.nobles : null);
  for (const n of nobles) n.joined = false;

  if (rec) {
    rec.push(`A king is crowned and sets to building his Castle (${cfg.castleTarget}).`);
    rec.push(`The court:`);
    for (const n of nobles) rec.push(`  ${label(n)} [${n.strat}] -- holdings worth ${ownWorth(n)}.`);
  }

  let trigger = "cap";
  let endRound = cfg.roundCap;
  let rebelWon = false;
  let resolved = false;

  for (let round = 1; round <= cfg.roundCap && !resolved; round++) {
    if (rec) rec.push(`\n-- Round ${round} --`);
    const jailedBefore = king.imprisonments;
    for (const n of nobles) {
      if (!n.alive) continue;
      if (!n.imprisoned) n.coin += cfg.income + n.incomeBonus;
      maybePayDownSeize(cfg, king, n, rec);
    }
    executePendingSeizures(cfg, king, nobles, rec);
    const prisoners = nobles.filter((n) => n.alive && n.imprisoned).length;
    king.castle = Math.max(0, king.castle - prisoners * cfg.prisonUpkeep);

    for (const target of visitOrder(nobles)) {
      if (!target.alive || target.imprisoned) continue;
      kingVisitHouse(cfg, king, target, rng, rec);
    }
    for (const n of nobles) n.favor *= 0.9; // favour fades; grievance does not
    const brutalThisRound = king.imprisonments > jailedBefore; // the king jailed someone

    // Castle complete -> the win path
    if (king.castle >= cfg.castleTarget) {
      endRound = round;
      trigger = "castle";
      if (cfg.castleVerdict === "outright") {
        if (rec) rec.push(`  The Castle is COMPLETE -- an outright royal victory.`);
        rebelWon = false;
      } else {
        if (rec) rec.push(`  The Castle is COMPLETE. The king believes he has won -- but the court rises:`);
        rebelWon = resolveMuster(cfg, king, nobles, "castle", rng, rec).success;
      }
      resolved = true;
      break;
    }

    // mid-reign: a brutal push (a jailing) can provoke a noble to cry "Rebellion!"
    if (round > 1 && brutalThisRound && roomDiscontent(cfg, nobles) > cfg.declareThreshold) {
      const m = resolveMuster(cfg, king, nobles, "declared", rng, rec);
      if (m.success) {
        trigger = "declared";
        endRound = round;
        rebelWon = true;
        resolved = true;
        break;
      } else {
        king.crushed += 1;
        crushRebellion(king, nobles, rec); // exposed rebels purged; reign continues
      }
    }
  }

  if (!resolved) {
    // round cap -> a final muster is forced
    if (rec) rec.push(`\n  The reign reaches its limit; a final reckoning is forced:`);
    rebelWon = resolveMuster(cfg, king, nobles, "cap", rng, rec).success;
    trigger = "cap";
  }

  if (rec) {
    rec.push(`\n  >> The king ${rebelWon ? "FALLS" : "HOLDS the throne"}.`);
  }
  return finalize(cfg, king, nobles, { rebelWon, trigger, round: endRound, rec, inject });
}

function finalize(cfg, king, nobles, st) {
  const { rebelWon, trigger, round, rec, inject } = st;
  // winning faction: if the rebellion won, the joiners; else the abstainers (+ king)
  const winners = nobles.filter((n) => n.alive && n.joined === rebelWon);
  let victor = null, victorScore = -Infinity;
  for (const n of winners) {
    const s = score(cfg, n, rebelWon);
    if (s > victorScore) { victorScore = s; victor = n; }
  }
  // if the crown won, the king competes on the LANDS HE HOLDS (deck + seized), not the Castle
  let victorIsKing = false, kingWorth = 0;
  if (!rebelWon) {
    kingWorth = king.deck.reduce((s, l) => s + l.value, 0) + king.lands.reduce((s, l) => s + l.value, 0);
    if (kingWorth * cfg.assetVP + king.coin * cfg.coinVP >= victorScore) {
      victorIsKing = true;
      victor = null;
    }
  }
  if (rec) {
    if (!rebelWon) rec.push(`  >> The king controls lands worth ${kingWorth} (${king.lands.length} seized + ${king.deck.length} ungranted).`);
    rec.push(`  >> Spoils to ${victorIsKing ? "the KING himself" : victor ? label(victor) : "no one"}.`);
  }

  let frontrunner = null, fw = -Infinity;
  for (const n of nobles) {
    const w = n.coin * cfg.coinVP + ownWorth(n) * cfg.assetVP;
    if (w > fw) { fw = w; frontrunner = n; }
  }
  const winnerSet = new Set(winners);

  return {
    trigger,
    round,
    kingSurvives: !rebelWon,
    rebelWon,
    paperVictory: trigger === "castle" && rebelWon,
    musters: king.musters,
    crushed: king.crushed,
    seizes: king.seizes,
    seizeThreats: king.seizeThreats,
    seizesExecuted: king.seizesExecuted,
    seizesPaidDown: king.seizesPaidDown,
    earlySeizes: king.earlySeizes,
    lateSeizes: king.lateSeizes,
    imprisonments: king.imprisonments,
    castle: king.castle,
    victorIsKing,
    victorKind: victorIsKing ? "king" : victor ? victor.kind : "none",
    victorHouse: victorIsKing ? "king" : victor ? victor.house : "none",
    // Campaign provenance of the overall winner (for the race-to-lose measurement)
    victorElimRank: victorIsKing
      ? inject && inject.king ? inject.king.elimRank : null
      : victor ? victor.elimRank : null,
    victorCrownDesire: victorIsKing
      ? inject && inject.king ? inject.king.crownDesire : null
      : victor ? victor.crownDesire : null,
    grantsGiven: king.grantsGiven,
    grantsDenied: king.grantsDenied,
    frontrunnerWon: frontrunner ? winnerSet.has(frontrunner) : false,
    frontrunnerAlive: frontrunner ? frontrunner.alive : false,
  };
}

module.exports = { playGame, HOUSE_KINDS };
