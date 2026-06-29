// Paper Victory: The Reign -- simulator for the SECOND HALF only
// (Phase 3 The Reign + Phase 4 The Reckoning).
//
// ROUND STRUCTURE (per Jason's spec):
//  - The king goes HOUSE TO HOUSE each round. At each House he asks a favor costing
//    1..8, and may either SWEETEN it with a land of similar value or just demand the
//    tax (coin). Rebels refuse him; he may instead gift a land to lure them back.
//  - Lands are individually VALUED (1..8). A noble scores only its own House's land
//    type, summed by value. Coin is safe; lands are seizable.
//  - Nobles are reactive and may flip their secret lean / public flag AT ANY TIME --
//    modeled as a re-evaluation after every single House visit (even another's).
//
// Three reckoning triggers: Castle complete, rebels call, or the king attacks.
// The king's secret Mandate color decides the purge; neither flag is safe.

const { Rng } = require("./rng");
const { buildRoster, HOUSE_KINDS } = require("./bots");

const ASSET_TYPES = ["estate", "factory", "charter"];

function publicFlag(n) {
  return n.flag;
}
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
// index of the land the king most covets (best own-type, else best by value)
function bestLandIdx(n) {
  let idx = -1;
  let best = -1;
  for (let i = 0; i < n.lands.length; i++) {
    const l = n.lands[i];
    const pref = (l.type === n.scoringType ? 100 : 0) + l.value;
    if (pref > best) {
      best = pref;
      idx = i;
    }
  }
  return idx;
}
function bestLandValue(n) {
  const i = bestLandIdx(n);
  return i < 0 ? 0 : n.lands[i].value;
}
// remove and return the land object the king most covets (null if none)
function seizeBestLand(n) {
  const i = bestLandIdx(n);
  if (i < 0) return null;
  return n.lands.splice(i, 1)[0];
}

// ---- king setup -----------------------------------------------------------

function makeKing(cfg, rng) {
  const misaligned = rng.chance(cfg.mandateMisalignProb);
  const deck = [];
  for (const type of ASSET_TYPES) {
    for (let i = 0; i < (cfg.grantDeck[type] || 0); i++) {
      deck.push({
        type,
        value: cfg.landValueMin + rng.int(cfg.landValueMax - cfg.landValueMin + 1),
      });
    }
  }
  return {
    coin: 0,
    castle: 0,
    misaligned,
    purgeFlag: misaligned ? "crown" : "rebellion",
    deck, // [{type, value}] -- finite, individually valued
    deckSize0: deck.length, // for rationing generosity as it empties
    lands: [], // lands the king has SEIZED and now holds (his personal score)
    grantsGiven: 0,
    grantsDenied: 0,
    seizes: 0,
    seizeThreats: 0,
    seizesExecuted: 0,
    seizesPaidDown: 0,
    imprisonments: 0,
    earlySeizes: 0, // land-grabs while the Castle is < 40% done
    lateSeizes: 0, // land-grabs while the Castle is >= 40% done
    attacked: 0,
  };
}

// the favor cost SCALES with Castle progress: cheap early, dear late
function favorCost(cfg, king, rng) {
  const progress = Math.min(1, king.castle / cfg.castleTarget);
  const base = cfg.favorMin + (cfg.favorMax - cfg.favorMin) * progress;
  const c = Math.round(base + rng.noise(cfg.favorJitter * 2));
  return Math.max(cfg.favorMin, Math.min(cfg.favorMax, c));
}

// record whether a land-grab happened early or late in the build
function tallySeize(cfg, king) {
  if (king.castle / cfg.castleTarget < 0.4) king.earlySeizes += 1;
  else king.lateSeizes += 1;
}

// pull a land from the deck near `cost`, preferring the chosen type. Returns the
// land object (removed from the deck) or null if the deck is empty.
function drawSweetener(king, cost, preferType) {
  if (king.deck.length === 0) return null;
  let idx = -1;
  let bestScore = Infinity;
  for (let i = 0; i < king.deck.length; i++) {
    const l = king.deck[i];
    const typePenalty = l.type === preferType ? 0 : 3; // honor the chosen type first
    const s = Math.abs(l.value - cost) + typePenalty;
    if (s < bestScore) {
      bestScore = s;
      idx = i;
    }
  }
  return king.deck.splice(idx, 1)[0];
}

// ---- the House visit (court + demand) ------------------------------------

function giveLand(king, target, land, rec, how) {
  target.lands.push(land);
  target.favor += land.type === target.scoringType ? land.value * 0.4 + 1 : 1;
  king.grantsGiven += 1;
  if (rec)
    rec.push(
      `    ${how} ${land.type}(${land.value}) to ${label(target)}` +
        (land.type === target.scoringType ? " -- it scores for them." : " -- a cheap brand.")
    );
}

function collectDemand(cfg, king, target, amt, rng, rec) {
  // Varrochi: once, refuse outright
  if (target.refuseLeft > 0) {
    target.refuseLeft -= 1;
    if (rec) rec.push(`    ${label(target)} invokes Varrochi's right and REFUSES.`);
    return;
  }
  // Brandt: once, melt an IOU into coin to settle
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
  // Illiquid: cannot cover the demand in coin. The king eyes the land he covets and
  // demands IT as payment -- with NO change (the High Society squeeze): a noble with
  // 1 coin and an estate worth 8 loses the estate to settle a tax of 2. Surrendering
  // a land is a SETTLEMENT, not a punitive seizure, so by default it does not jail.
  if (cfg.seizureEnabled && totalWorth(target) > 0) {
    if (cfg.seizeMode === "immediate") {
      tallySeize(cfg, king);
      const land = seizeBestLand(target);
      const v = land.value;
      king.castle += v; // funds the Castle (no change for the small tax)
      king.lands.push(land); // ...and the king now HOLDS it (his personal score)
      king.seizes += 1;
      if (cfg.landPaymentImprisons) {
        target.imprisoned = true;
        king.imprisonments += 1;
      }
      target.resentment += (v - amt) * 0.5 + amt * 0.4; // the overpay stings
      if (rec)
        rec.push(
          `    ${label(target)} holds only ${target.coin} coin -- King takes a land worth ${v} to settle a ${amt} tax (no change)` +
            (cfg.landPaymentImprisons ? " and jails them. A brutal overpay, and a martyr made." : ". A brutal overpay.")
        );
      return;
    }
    if (!target.pendingSeize) {
      const bestV = bestLandValue(target);
      target.pendingSeize = cfg.seizeGrace;
      target.pendingAmt = amt; // redeem = pay the tax in coin and keep the land
      target.threats += 1;
      target.grievance += cfg.seizeGrievance;
      king.seizeThreats += 1;
      if (rec)
        rec.push(
          `    ${label(target)} holds only ${target.coin} coin -- King demands their land worth ${bestV} for a ${amt} tax. Pay ${amt} coin in time, or lose it.`
        );
    }
    return;
  }
  // truly destitute: no coin, no land -> debtor's prison (the doc's last resort)
  if (cfg.prisonEnabled && totalWorth(target) === 0) {
    target.imprisoned = true;
    king.imprisonments += 1;
    target.resentment += 4;
    if (rec) rec.push(`    ${label(target)} is destitute -- jailed for the unpaid demand.`);
    return;
  }
  target.resentment += 1;
}

// does the king sweeten this House's demand with a land?
function decideSweeten(cfg, king, target, rng) {
  if (king.deck.length === 0) return false;
  // spoil the court while the deck is full; ration generosity as it empties
  const deckFrac = king.deckSize0 ? king.deck.length / king.deckSize0 : 0;
  if (cfg.kingStrategy === "savage") return rng.chance(0.2 * deckFrac);
  if (cfg.kingStrategy === "gentle") return rng.chance(0.5 + 0.5 * deckFrac);
  // adaptive: lavish on the wavering early, then close the purse
  if (target.losing && target.favor < cfg.boughtOffFavor + 2) return rng.chance(0.5 + 0.5 * deckFrac);
  return rng.chance(0.2 + 0.5 * deckFrac);
}

function kingVisitHouse(cfg, king, target, rng, rec) {
  const cost = favorCost(cfg, king, rng);
  if (target.flag === "rebellion") {
    // open defiance: refuses demands. The king may gift a land to lure them back.
    if (cfg.kingStrategy !== "savage" && king.deck.length && target.losing && rng.chance(0.5)) {
      const land = drawSweetener(king, cost, target.scoringType);
      if (land) {
        if (rec) rec.push(`  King visits rebel ${label(target)} and offers a gift to lure them back:`);
        giveLand(king, target, land, rec, "gifts a");
      }
    } else if (rec) {
      rec.push(`  King visits ${label(target)}, who flies rebel and refuses him.`);
    }
    return;
  }
  const sweeten = decideSweeten(cfg, king, target, rng);
  if (sweeten) {
    // enrich (own type) or cheap-brand (off type)?
    const enrich = cfg.kingStrategy === "gentle" ? rng.chance(0.6) : rng.chance(0.3);
    const preferType = enrich ? target.scoringType : rng.pick(ASSET_TYPES);
    const land = drawSweetener(king, cost, preferType);
    if (rec) rec.push(`  King asks a favor of ${cost} from ${label(target)}, sweetened:`);
    if (land) giveLand(king, target, land, rec, "grants a");
  } else if (rec) {
    rec.push(`  King demands ${cost} of ${label(target)}:`);
  }
  collectDemand(cfg, king, target, cost, rng, rec); // sweetened or not, the tax is still asked
}

// ---- noble reactions (lean + flag), may fire after any visit -------------

function blocRead(cfg, king, nobles) {
  const alive = nobles.filter((n) => n.alive && !n.imprisoned);
  const rebelFrac = alive.length
    ? alive.filter((n) => n.flag === "rebellion").length / alive.length
    : 0;
  const progress = Math.min(1.3, king.castle / cfg.castleTarget);
  return { total: alive.length + 1, rebelFrac, progress };
}

function commitLean(cfg, n, target) {
  if (target === n.lean) return;
  if (cfg.leanChangeCost > 0) {
    if (n.coin < cfg.leanChangeCost) return;
    n.coin -= cfg.leanChangeCost;
  }
  n.lean = target;
}

function nobleUpdate(cfg, king, n, rng, read, rec) {
  if (!n.alive) return;
  if (n.strat === "loyalist") {
    n.lean = "survive";
    n.flag = "crown";
    return;
  }
  if (n.strat === "safeFlagBetrayer") {
    n.lean = "depose";
    n.flag = "crown";
    return;
  }
  const colorBias = n.losing ? cfg.colorTilt : -cfg.colorTilt;
  const urgency = n.losing ? cfg.urgencyWeight * read.progress : 0;
  const kingStrong = cfg.leanSignalCastle * (read.progress - 0.5);
  const cascade = cfg.coordination * (read.rebelFrac - 0.5) * 4;
  const personal = (n.threats + n.grievance) * cfg.iouTilt - n.favor * 0.5;
  const base =
    cascade + colorBias + urgency + personal - kingStrong + rng.noise(cfg.leanReadNoise * 2);
  const pFall = 1 / (1 + Math.exp(-cfg.leanReadK * base));

  const evDep = pFall * (1 + cfg.iouTilt * (n.threats + n.grievance));
  const evSur = (1 - pFall) * (1 + cfg.iouTilt * n.promises);
  if (Math.abs(evDep - evSur) >= cfg.leanInertia)
    commitLean(cfg, n, evDep > evSur ? "depose" : "survive");

  const survRebel = cfg.perceivedMisalign;
  const survCrown = 1 - cfg.perceivedMisalign;
  const evRebel =
    survRebel * (pFall * (1 + cfg.rebelHeroVP * 0.1 + n.threats * cfg.iouTilt) + cfg.taxReliefTilt);
  const evCrown =
    survCrown * ((1 - pFall) * (1 + n.favor * 0.3 + n.promises * cfg.iouTilt) + cfg.purgeFearRebel);
  const ambush = n.lean === "depose" ? cfg.ambushTilt * pFall * survCrown : 0;
  const flagTarget = evRebel > evCrown + ambush ? "rebellion" : "crown";
  const before = n.flag;
  if (n.flag !== flagTarget && Math.abs(evRebel - evCrown) >= cfg.flagInertia) {
    n.flag = flagTarget;
    if (rec && before !== "rebellion" && n.flag === "rebellion")
      rec.push(`    ${label(n)} throws up the REBEL flag.`);
    if (rec && before === "rebellion" && n.flag === "crown")
      rec.push(`    ${label(n)} lowers the flag back to crown.`);
  }
}

// every noble gets the chance to react after a visit (the "flip any time" rule)
function reactAll(cfg, king, nobles, rng, rec) {
  const read = blocRead(cfg, king, nobles);
  for (const n of nobles) nobleUpdate(cfg, king, n, rng, read, rec);
}

// ---- seizure timing -------------------------------------------------------

function executePendingSeizures(cfg, king, nobles, rec) {
  for (const n of nobles) {
    if (!n.alive || !n.pendingSeize) continue;
    n.pendingSeize -= 1;
    if (n.pendingSeize > 0) continue;
    if (totalWorth(n) > 0) {
      tallySeize(cfg, king);
      const land = seizeBestLand(n);
      const v = land.value;
      king.castle += v; // the coveted land funds the Castle (no change)
      king.lands.push(land); // ...and the king now holds it for his personal score
      king.seizesExecuted += 1;
      if (cfg.landPaymentImprisons) {
        n.imprisoned = true;
        king.imprisonments += 1;
      }
      n.grievance += cfg.seizeExecGrievance;
      if (rec)
        rec.push(
          `  Grace runs out -- King takes ${label(n)}'s land worth ${v} for an unpaid ${n.pendingAmt} tax. No change` +
            (cfg.landPaymentImprisons ? ", and jails them. A martyr made." : ". A bitter overpay.")
        );
    }
    n.pendingSeize = 0;
  }
}

function maybePayDownSeize(cfg, king, n, rec) {
  if (!n.pendingSeize || n.coin < n.pendingAmt) return;
  const wantsToKeep =
    n.strat === "loyalist" || (n.strat === "honest" && n.lean === "survive");
  if (!wantsToKeep) return;
  n.coin -= n.pendingAmt;
  king.castle += n.pendingAmt;
  n.pendingSeize = 0;
  n.pendingAmt = 0;
  if (n.threats > 0) n.threats -= 1;
  n.grievance = Math.max(0, n.grievance - cfg.seizeGrievance);
  king.seizesPaidDown += 1;
  if (rec) rec.push(`  ${label(n)} scrapes up the coin and buys off the seizure.`);
}

// ---- the king's attack (forced gamble) -----------------------------------

function kingConsiderAttack(cfg, king, nobles, rng) {
  if (!cfg.kingAttackEnabled) return false;
  const alive = nobles.filter((n) => n.alive && !n.imprisoned);
  const rebelFlags = alive.filter((n) => n.flag === "rebellion").length;
  if (rebelFlags === 0) return false;
  const rebelFrac = alive.length ? rebelFlags / alive.length : 0;
  if (rebelFrac < cfg.attackThreshold) return false;
  if (king.castle / cfg.castleTarget > cfg.buildCommit) return false;
  let crown = 1;
  let reb = 0;
  for (const n of alive) {
    if (n.flag === king.purgeFlag) continue;
    n.flag === "crown" ? crown++ : reb++;
  }
  reb += nobles.filter((n) => n.alive && n.imprisoned).length;
  const denom = crown + reb || 1;
  const estEdge = (crown - reb) / denom + rng.noise(cfg.attackReadNoise);
  if (estEdge > cfg.kingAttackConfidence) {
    king.attacked = 1;
    return true;
  }
  return false;
}

function maybeCallRebellion(cfg, king, nobles, rng) {
  const alive = nobles.filter((n) => n.alive && !n.imprisoned);
  const total = alive.length + 1;
  const rebelFlags = alive.filter((n) => n.flag === "rebellion").length;
  const progress = Math.min(1.3, king.castle / cfg.castleTarget);
  for (const n of alive) {
    if (n.flag !== "rebellion" || n.lean !== "depose" || n.strat === "loyalist") continue;
    const estimate = rebelFlags * (0.4 + 0.6 * cfg.coordination) + rng.noise(cfg.callNoise * 2);
    const edge = estimate / total - 0.5 + progress * 0.3;
    if (edge > cfg.callerConfidence) return true;
  }
  return false;
}

// ---- the Reckoning --------------------------------------------------------

function score(cfg, n, crownWon) {
  let rewards = crownWon ? n.promises * cfg.promiseVP : n.threats * cfg.threatVP;
  if (!crownWon && n.flag === "rebellion") rewards += cfg.rebelHeroVP;
  return n.coin * cfg.coinVP + ownWorth(n) * cfg.assetVP + rewards;
}

function reckoning(cfg, king, nobles, trigger, round, rec) {
  if (rec)
    rec.push(
      `\n=== THE RECKONING (round ${round}, triggered by ${trigger}) ===\n` +
        `The king reveals his Mandate: he purges the ${king.purgeFlag.toUpperCase()} flag` +
        (king.misaligned ? " -- his own apparent colors!" : ".")
    );
  for (const n of nobles) {
    if (n.alive && !n.imprisoned && n.flag === king.purgeFlag) {
      n.alive = false;
      if (rec) rec.push(`  PURGE: ${label(n)}, flying ${n.flag}, is executed.`);
    }
  }
  let crownWon, tie = false, outright = false;
  if (trigger === "castle" && cfg.castleVerdict === "outright") {
    crownWon = true;
    outright = true;
  } else {
    const survivors = nobles.filter((n) => n.alive);
    let crown = 1;
    let rebellion = 0;
    for (const n of survivors) n.lean === "survive" ? crown++ : rebellion++;
    if (rec) {
      rec.push(`  The secret leans turn face-up among the survivors:`);
      for (const n of survivors)
        rec.push(`    ${label(n)} -- ${n.lean === "survive" ? "CROWN" : "REBELLION"}${n.imprisoned ? " (from a cell)" : ""}`);
      rec.push(`  Count: Crown ${crown} (incl. the king) vs Rebellion ${rebellion}.`);
    }
    if (crown === rebellion) {
      tie = true;
      crownWon = cfg.tieRule === "crown";
    } else {
      crownWon = crown > rebellion;
    }
  }
  const winners = nobles.filter(
    (n) => n.alive && ((crownWon && n.lean === "survive") || (!crownWon && n.lean === "depose"))
  );
  let victor = null;
  let victorScore = -Infinity;
  for (const n of winners) {
    const s = score(cfg, n, crownWon);
    if (s > victorScore) {
      victorScore = s;
      victor = n;
    }
  }
  // If the crown wins, the king competes for the individual prize like a noble -- but
  // judged on the LANDS HE CONTROLS (undealt deck + what he seized), NOT the Castle.
  // To build he must give lands away; to win he must still hold some. Brutality (seize)
  // is his main way to hold land -- and the very thing that breeds the rebellion.
  let victorIsKing = false;
  let kingWorth = 0;
  if (crownWon) {
    const deckWorth = king.deck.reduce((s, l) => s + l.value, 0);
    const seizedWorth = king.lands.reduce((s, l) => s + l.value, 0);
    kingWorth = deckWorth + seizedWorth;
    const kingScore = kingWorth * cfg.assetVP + king.coin * cfg.coinVP;
    if (kingScore >= victorScore) {
      victorIsKing = true;
      victor = null;
    }
  }
  if (rec) {
    rec.push(`  >> The king ${crownWon ? "HOLDS the throne" : "FALLS"}${tie ? " (on the tiebreak)" : ""}.`);
    if (crownWon)
      rec.push(`  >> The king controls lands worth ${kingWorth} (${king.lands.length} seized + ${king.deck.length} ungranted).`);
    rec.push(`  >> Spoils to ${victorIsKing ? "the KING himself" : victor ? label(victor) : "no one"}.`);
  }
  return { crownWon, tie, outright, trigger, round, winners, victor, victorIsKing };
}

// ---- top-level game -------------------------------------------------------

function visitOrder(nobles) {
  // king courts the wavering first (burned-color, least favoured) so he can react
  return nobles
    .filter((n) => n.alive && !n.imprisoned)
    .sort((a, b) => (b.losing ? 1 : 0) - (a.losing ? 1 : 0) || a.favor - b.favor);
}

function playGame(cfg, seed, rec) {
  const rng = new Rng(seed);
  const king = makeKing(cfg, rng);
  const nobles = buildRoster(cfg, rng);

  if (rec) {
    rec.push(
      `A king is crowned. His secret Mandate ${
        king.misaligned
          ? "BETRAYS his face: he means to purge those who fly his own crown colors."
          : "matches his face: he will purge the rebels."
      }`
    );
    rec.push(`The court (secret leans hidden from the king):`);
    for (const n of nobles)
      rec.push(`  ${label(n)} [${n.strat}] -- holdings worth ${ownWorth(n)}, secretly leans ${n.lean}.`);
  }

  let trigger = "stall";
  let endRound = cfg.roundCap;

  outer: for (let round = 1; round <= cfg.roundCap; round++) {
    if (rec) rec.push(`\n-- Round ${round} --`);
    // upkeep + income + paydown window
    for (const n of nobles) {
      if (!n.alive) continue;
      if (!n.imprisoned) n.coin += cfg.income + n.incomeBonus;
      maybePayDownSeize(cfg, king, n, rec);
    }
    executePendingSeizures(cfg, king, nobles, rec);
    const prisoners = nobles.filter((n) => n.alive && n.imprisoned).length;
    king.castle = Math.max(0, king.castle - prisoners * cfg.prisonUpkeep);

    // HOUSE TO HOUSE: visit each, and let everyone react after each visit
    for (const target of visitOrder(nobles)) {
      if (!target.alive || target.imprisoned) continue;
      kingVisitHouse(cfg, king, target, rng, rec);
      reactAll(cfg, king, nobles, rng, rec); // nobles may flip after any visit
    }

    // the king may now strike a visible rebellion (forced-gamble reckoning)
    if (kingConsiderAttack(cfg, king, nobles, rng)) {
      if (rec) rec.push(`  The king's patience breaks -- he ATTACKS the rebellion, forcing a reckoning.`);
      trigger = "attack";
      endRound = round;
      break outer;
    }

    // grudges and favours fade (grievance does not)
    for (const n of nobles) {
      n.resentment *= 0.9;
      n.favor *= 0.9;
    }

    if (king.castle >= cfg.castleTarget) {
      if (rec) rec.push(`  The Castle is COMPLETE. The king believes he has won...`);
      trigger = "castle";
      endRound = round;
      break;
    }
    if (maybeCallRebellion(cfg, king, nobles, rng)) {
      if (rec) rec.push(`  A rebel calls for the reckoning, betting the room has turned.`);
      trigger = "rebellion";
      endRound = round;
      break;
    }
  }

  if (trigger === "stall" && cfg.stallDefault !== "count") {
    const crownWon = cfg.stallDefault === "crown";
    for (const n of nobles) if (n.alive && !n.imprisoned && n.flag === king.purgeFlag) n.alive = false;
    const winners = nobles.filter(
      (n) => n.alive && ((crownWon && n.lean === "survive") || (!crownWon && n.lean === "depose"))
    );
    if (rec) rec.push(`\nThe reign drifts to its cap; it defaults to ${cfg.stallDefault}.`);
    return finalize(cfg, king, nobles, {
      crownWon, tie: false, outright: false, trigger, round: endRound, winners,
      victor: null, victorIsKing: crownWon,
    });
  }
  return finalize(cfg, king, nobles, reckoning(cfg, king, nobles, trigger, endRound, rec));
}

function finalize(cfg, king, nobles, res) {
  let frontrunner = null;
  let fw = -Infinity;
  for (const n of nobles) {
    const w = n.coin * cfg.coinVP + ownWorth(n) * cfg.assetVP;
    if (w > fw) {
      fw = w;
      frontrunner = n;
    }
  }
  const winnerSet = new Set(res.winners);
  const betrayers = nobles
    .filter((n) => n.strat === "safeFlagBetrayer")
    .map((n) => ({ won: winnerSet.has(n), alive: n.alive }));

  return {
    trigger: res.trigger,
    round: res.round,
    crownWon: res.crownWon,
    kingSurvives: res.crownWon,
    kingOutright: !!res.outright,
    kingMisaligned: !!king.misaligned,
    kingAttacked: !!king.attacked,
    tie: res.tie,
    seizes: king.seizes,
    seizeThreats: king.seizeThreats,
    seizesExecuted: king.seizesExecuted,
    seizesPaidDown: king.seizesPaidDown,
    earlySeizes: king.earlySeizes,
    lateSeizes: king.lateSeizes,
    imprisonments: king.imprisonments,
    castle: king.castle,
    victorIsKing: res.victorIsKing,
    victorKind: res.victorIsKing ? "king" : res.victor ? res.victor.kind : "none",
    victorHouse: res.victorIsKing ? "king" : res.victor ? res.victor.house : "none",
    grantsGiven: king.grantsGiven,
    grantsDenied: king.grantsDenied,
    betrayers,
    frontrunnerWon: frontrunner ? winnerSet.has(frontrunner) : false,
    frontrunnerAlive: frontrunner ? frontrunner.alive : false,
  };
}

module.exports = { playGame, publicFlag, HOUSE_KINDS };
