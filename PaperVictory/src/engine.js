// Paper Victory: The Reign -- simulator for the SECOND HALF only
// (Phase 3 The Reign + Phase 4 The Reckoning).
//
// Phase 1/2 carry-over (coin, carried threats, starting assets, and each player's
// public COLOR) is supplied as configurable input. See config.js / README.
//
// Core model (after several design corrections):
//  - Each noble has a PUBLIC COLOR (win/lose, fixed at the Coronation), a PUBLIC
//    FLAG (crown/rebellion, CHOSEN each round), and a SECRET LEAN (survive/depose).
//  - Losing-color nobles are a visible bloc -> the rebellion's coordination nucleus.
//  - A noble raises the rebel FLAG for a reason: it refuses the king's taxes (denies
//    the Castle) and earns the resistance-hero bonus if the king falls. The risk is
//    the purge.
//  - The king's lethal Mandate color is SECRET, so NEITHER flag is safe (the blind
//    guess). A misaligned king purges his own crown-flag backers.
//  - Three reckoning triggers: Castle complete, rebels call, or the KING ATTACKS a
//    rebel -- a forced gamble, decided on visible flags but counted on secret leans.

const { Rng } = require("./rng");
const { buildRoster, HOUSE_KINDS } = require("./bots");

function publicFlag(n) {
  return n.flag;
}

const ASSET_TYPES = ["estate", "factory", "charter"];

function totalAssets(n) {
  return n.assets.estate + n.assets.factory + n.assets.charter;
}

// seize one asset, taking the noble's OWN-House type first (the land the king covets)
function seizeOneAsset(n) {
  const order = [n.scoringType, ...ASSET_TYPES.filter((t) => t !== n.scoringType)];
  for (const t of order) {
    if (n.assets[t] > 0) {
      n.assets[t] -= 1;
      return true;
    }
  }
  return false;
}

function anyAvailableType(deck) {
  for (const t of ASSET_TYPES) if (deck[t] > 0) return t;
  return null;
}

// human label for narration
function label(n) {
  return `${n.house} (${n.kind}, ${n.color === "lose" ? "burned" : "king's"} color)`;
}

function offType(own, deck, rng) {
  const others = ASSET_TYPES.filter((t) => t !== own && deck[t] > 0);
  if (others.length) return rng.pick(others);
  return deck[own] > 0 ? own : anyAvailableType(deck);
}

function makeKing(cfg, rng) {
  const misaligned = rng.chance(cfg.mandateMisalignProb);
  return {
    coin: 0,
    castle: 0,
    misaligned, // public face is crown; if misaligned the lethal color is crown too
    purgeFlag: misaligned ? "crown" : "rebellion", // which PUBLIC flag dies at purge
    deck: { ...cfg.grantDeck }, // finite branding budget by type
    grantsGiven: 0,
    grantsDenied: 0, // wanted to grant but the deck was empty
    seizes: 0,
    seizeThreats: 0,
    seizesExecuted: 0,
    seizesPaidDown: 0,
    imprisonments: 0,
    attacked: 0, // did the king trigger the reckoning by attacking?
  };
}

// ---- King decisions -------------------------------------------------------

function chooseGrantTarget(cfg, king, nobles, rng) {
  const pool = nobles.filter((n) => n.alive && !n.imprisoned);
  if (pool.length === 0) return null;
  if (cfg.kingStrategy === "gentle") {
    return pool.reduce((a, b) => (b.brand < a.brand ? b : a));
  }
  if (cfg.kingStrategy === "savage") {
    return rng.chance(0.4) ? pool.reduce((a, b) => (b.coin > a.coin ? b : a)) : null;
  }
  // adaptive: shore up a wavering bloc member (losing-color, still crown-flagged,
  // least favoured) before they bolt to the rebel flag. This is bloc-fracturing.
  const wavering = pool.filter((n) => n.losing && n.flag === "crown");
  if (wavering.length) return wavering.reduce((a, b) => (b.favor < a.favor ? b : a));
  return pool.reduce((a, b) => (b.resentment > a.resentment ? b : a));
}

function applyGrant(cfg, king, target, rng, rec) {
  const own = target.scoringType;
  // gentle kings enrich (matched type) often; adaptive/savage prefer the cheap brand.
  const wantEnrich = cfg.kingStrategy === "gentle" ? rng.chance(0.6) : rng.chance(0.35);
  let type = wantEnrich ? own : offType(own, king.deck, rng);
  if (!type || king.deck[type] <= 0) type = anyAvailableType(king.deck);
  if (!type) {
    king.grantsDenied += 1; // deck is empty -- he can no longer brand
    if (rec) rec.push(`  King wants to court ${label(target)} but the grant deck is empty.`);
    return;
  }
  king.deck[type] -= 1;
  target.assets[type] += 1;
  target.favor += type === own ? 2 : 1; // a matched grant is worth more
  king.grantsGiven += 1;
  if (rec)
    rec.push(
      `  King grants a ${type} to ${label(target)}` +
        (type === own ? " -- enriching a rival." : " -- a cheap brand.")
    );
}

function taxAmount(cfg, king) {
  if (cfg.kingStrategy === "gentle") return cfg.taxBase;
  if (cfg.kingStrategy === "savage") return cfg.taxBase + 2;
  const progress = king.castle / cfg.castleTarget;
  return cfg.taxBase + (progress > 0.6 ? 2 : progress > 0.3 ? 1 : 0);
}

function chooseTaxTarget(cfg, nobles, rng) {
  // rebel-flaggers REFUSE the king's demands, so he can only tax crown-flaggers.
  const pool = nobles.filter((n) => n.alive && !n.imprisoned && n.flag === "crown");
  if (pool.length === 0) return null;
  if (cfg.kingStrategy === "savage") return rng.pick(pool);
  // squeeze the asset-rich, cash-poor (the seizure target)
  return pool.reduce((a, b) =>
    totalAssets(b) - b.coin > totalAssets(a) - a.coin ? b : a
  );
}

function kingDemand(cfg, king, target, rng, rec) {
  if (!target || target.flag !== "crown") return; // rebels pay nothing
  const amt = taxAmount(cfg, king);
  // EDGE -- Varrochi: once per game, refuse a demand outright and pay nothing.
  if (target.refuseLeft > 0) {
    target.refuseLeft -= 1;
    if (rec) rec.push(`  King demands ${amt} of ${label(target)}, who invokes Varrochi's old right and REFUSES.`);
    return;
  }
  // EDGE -- Brandt: once per game, turn an IOU into the liquidity to settle.
  if (target.coin < amt && target.iouToCoinLeft > 0) {
    target.coin += amt;
    target.iouToCoinLeft -= 1;
    if (target.promises > 0) target.promises -= 1;
    if (rec) rec.push(`  ${label(target)} melts an IOU into coin (Brandt's works) to meet the demand.`);
  }
  if (target.coin >= amt) {
    target.coin -= amt;
    king.castle += amt;
    target.resentment += amt * 0.4;
    if (rec) rec.push(`  King demands ${amt} of ${label(target)}, paid in coin. Castle now ${king.castle}/${cfg.castleTarget}.`);
    return;
  }
  // Cannot pay in coin -> the king reaches for the seizure lever (asset-rich,
  // cash-poor is exposed).
  if (cfg.seizureEnabled && totalAssets(target) > 0) {
    if (cfg.seizeMode === "immediate") {
      king.castle += amt;
      seizeOneAsset(target);
      king.seizes += 1;
      if (cfg.prisonEnabled) {
        target.imprisoned = true;
        king.imprisonments += 1;
      }
      target.resentment += 4;
      if (rec) rec.push(`  ${label(target)} cannot pay -- King SEIZES the land and throws them in prison.`);
      return;
    }
    // telegraphed: a THREAT to seize (counterplay + a non-decaying grievance)
    if (!target.pendingSeize) {
      target.pendingSeize = cfg.seizeGrace;
      target.pendingAmt = Math.round(amt * cfg.seizeRedeemMult);
      target.threats += 1; // a threat-to-seize -> VP if the king falls
      target.grievance += cfg.seizeGrievance; // PERSISTENT depose-pressure
      king.seizeThreats += 1;
      if (rec) rec.push(`  ${label(target)} cannot pay -- King THREATENS to seize their land (redeem for ${target.pendingAmt} or lose it).`);
    }
    return;
  }
  target.resentment += 1; // missed tax, mild resentment
}

function executePendingSeizures(cfg, king, nobles, rec) {
  for (const n of nobles) {
    if (!n.alive || !n.pendingSeize) continue;
    n.pendingSeize -= 1;
    if (n.pendingSeize > 0) continue;
    if (totalAssets(n) > 0) {
      king.castle += n.pendingAmt;
      seizeOneAsset(n);
      king.seizesExecuted += 1;
      if (cfg.prisonEnabled) {
        n.imprisoned = true;
        king.imprisonments += 1;
      }
      n.grievance += cfg.seizeExecGrievance;
      if (rec) rec.push(`  The grace runs out -- King seizes ${label(n)}'s land and jails them. A martyr is made.`);
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

// The king may strike a rebel flag to put it down -- but the attack TRIGGERS the
// reckoning. He decides from VISIBLE flags and his OWN known purge color; the count
// is on SECRET leans, so he can walk into the hidden knife (crown-flag depose-rs).
function kingConsiderAttack(cfg, king, nobles, rng) {
  if (!cfg.kingAttackEnabled) return false;
  const alive = nobles.filter((n) => n.alive && !n.imprisoned);
  const rebelFlags = alive.filter((n) => n.flag === "rebellion").length;
  if (rebelFlags === 0) return false;
  const rebelFrac = alive.length ? rebelFlags / alive.length : 0;
  // A calm court is not worth triggering an uncertain reckoning over -- build.
  if (rebelFrac < cfg.attackThreshold) return false;
  // So close to done that he would rather lay the last stones than gamble. The trap:
  // he believes completion is his win, but under "trigger" it is a reckoning.
  if (king.castle / cfg.castleTarget > cfg.buildCommit) return false;
  // simulate the purge he would cause, then guess the count (leans ~ flags).
  let crown = 1; // himself
  let reb = 0;
  for (const n of alive) {
    if (n.flag === king.purgeFlag) continue; // dies in his purge -> no vote
    if (n.flag === "crown") crown += 1;
    else reb += 1;
  }
  reb += nobles.filter((n) => n.alive && n.imprisoned).length; // jailed lean depose
  const denom = crown + reb || 1;
  const estEdge = (crown - reb) / denom + rng.noise(cfg.attackReadNoise);
  if (estEdge > cfg.kingAttackConfidence) {
    king.attacked = 1;
    return true;
  }
  return false;
}

// ---- Noble decisions ------------------------------------------------------

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

function updateLeanGrudge(cfg, n, rng) {
  // OLD thermostat (comparison only): flip when resentment > favor. Settles at
  // parity -> manufactures the ~50% tie artifact.
  const desire =
    n.resentment + n.grievance + n.threats - n.favor + rng.noise(cfg.leanNoise * 6);
  const target = desire > 0 ? "depose" : "survive";
  if (Math.abs(desire) < cfg.leanInertia * 6) return;
  commitLean(cfg, n, target);
  n.flag = n.lean === "depose" ? "rebellion" : "crown";
}

function nobleUpdate(cfg, king, n, rng, read) {
  if (n.strat === "loyalist") {
    n.lean = "survive";
    n.flag = "crown";
    return;
  }
  if (n.strat === "safeFlagBetrayer") {
    n.lean = "depose";
    n.flag = "crown"; // safe-LOOKING flag, secret knife (but crown is not truly safe)
    return;
  }

  // shared read of the rebellion's prospects from VISIBLE commitment + color + urgency
  const colorBias = n.losing ? cfg.colorTilt : -cfg.colorTilt;
  const urgency = n.losing ? cfg.urgencyWeight * read.progress : 0;
  const kingStrong = cfg.leanSignalCastle * (read.progress - 0.5);
  const cascade = cfg.coordination * (read.rebelFrac - 0.5) * 4;
  const personal = (n.threats + n.grievance) * cfg.iouTilt - n.favor * 0.5;
  const base =
    cascade + colorBias + urgency + personal - kingStrong +
    rng.noise(cfg.leanReadNoise * 2);
  const pFall = 1 / (1 + Math.exp(-cfg.leanReadK * base));

  // SECRET LEAN: back the side you believe will win (spoils tilt the margin)
  const evDep = pFall * (1 + cfg.iouTilt * (n.threats + n.grievance));
  const evSur = (1 - pFall) * (1 + cfg.iouTilt * n.promises);
  if (Math.abs(evDep - evSur) >= cfg.leanInertia)
    commitLean(cfg, n, evDep > evSur ? "depose" : "survive");

  // PUBLIC FLAG: dare to commit openly? The king's kill-color is secret, so NEITHER
  // flag is safe -- crown earns no free safety. The reason to fly rebel is tax relief
  // + the hero bonus if the king falls; the pull back is favour + the standing fear.
  const survRebel = cfg.perceivedMisalign; // rebel fatal if the king is aligned
  const survCrown = 1 - cfg.perceivedMisalign; // crown fatal if the king is misaligned
  const evRebel =
    survRebel *
    (pFall * (1 + cfg.rebelHeroVP * 0.1 + n.threats * cfg.iouTilt) + cfg.taxReliefTilt);
  const evCrown =
    survCrown *
    ((1 - pFall) * (1 + n.favor * 0.3 + n.promises * cfg.iouTilt) + cfg.purgeFearRebel);
  // AMBUSH value: a secret depose-leaner gains by HIDING under a crown flag -- the
  // more likely the rebellion wins the count, the more valuable it is to be a
  // surviving hidden vote (dodge the purge, never trip the king's attack).
  const ambush = n.lean === "depose" ? cfg.ambushTilt * pFall * survCrown : 0;
  const flagTarget = evRebel > evCrown + ambush ? "rebellion" : "crown";
  if (n.flag !== flagTarget && Math.abs(evRebel - evCrown) >= cfg.flagInertia) {
    n.flag = flagTarget; // open defiance; the noble keeps its holdings either way
  }
}

function maybeCallRebellion(cfg, king, nobles, rng) {
  const alive = nobles.filter((n) => n.alive && !n.imprisoned);
  const total = alive.length + 1;
  const rebelFlags = alive.filter((n) => n.flag === "rebellion").length;
  const progress = Math.min(1.3, king.castle / cfg.castleTarget);
  for (const n of alive) {
    if (n.flag !== "rebellion" || n.lean !== "depose" || n.strat === "loyalist") continue;
    const estimate = rebelFlags * (0.4 + 0.6 * cfg.coordination) + rng.noise(cfg.callNoise * 2);
    const edge = estimate / total - 0.5 + progress * 0.3; // urgency lowers the bar
    if (edge > cfg.callerConfidence) return true;
  }
  return false;
}

// ---- The Reckoning --------------------------------------------------------

function score(cfg, n, crownWon) {
  let rewards = crownWon ? n.promises * cfg.promiseVP : n.threats * cfg.threatVP;
  if (!crownWon && n.flag === "rebellion") rewards += cfg.rebelHeroVP; // defiance pays
  // a House scores ONLY its own asset type; off-type grants were just brands
  return n.coin * cfg.coinVP + n.assets[n.scoringType] * cfg.assetVP + rewards;
}

function reckoning(cfg, king, nobles, trigger, round, rec) {
  if (rec)
    rec.push(
      `\n=== THE RECKONING (round ${round}, triggered by ${trigger}) ===\n` +
        `The king reveals his Mandate: he purges the ${king.purgeFlag.toUpperCase()} flag` +
        (king.misaligned ? " -- his own apparent colors!" : ".")
    );
  // 2. Purge: execute everyone flying the king's secret lethal color (jailed exempt).
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
    let crown = 1; // the king
    let rebellion = 0;
    for (const n of survivors) (n.lean === "survive" ? crown++ : rebellion++);
    if (rec) {
      rec.push(`  The secret leans turn face-up among the survivors:`);
      for (const n of survivors)
        rec.push(`    ${label(n)} -- ${n.lean === "survive" ? "CROWN" : "REBELLION"}${n.imprisoned ? " (from a cell)" : ""}`);
      rec.push(`  Count: Crown ${crown} (incl. the king) vs Rebellion ${rebellion}${tie ? "" : ""}.`);
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
  let victorIsKing = false;
  if (crownWon) {
    const kingScore = king.castle * cfg.assetVP + king.coin * cfg.coinVP;
    if (kingScore >= victorScore) {
      victorIsKing = true;
      victor = null;
    }
  }
  if (rec) {
    rec.push(
      `  >> The king ${crownWon ? "HOLDS the throne" : "FALLS"}${tie ? " (on the tiebreak)" : ""}.`
    );
    rec.push(
      `  >> Spoils to ${victorIsKing ? "the KING himself" : victor ? label(victor) : "no one"}.`
    );
  }
  return { crownWon, tie, outright, trigger, round, winners, victor, victorIsKing };
}

// ---- Top-level game -------------------------------------------------------

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
      rec.push(`  ${label(n)} [${n.strat}] -- secretly leans ${n.lean}.`);
  }

  let trigger = "stall";
  let endRound = cfg.roundCap;

  for (let round = 1; round <= cfg.roundCap; round++) {
    if (rec) rec.push(`\n-- Round ${round} --`);
    // --- King phase ---
    executePendingSeizures(cfg, king, nobles, rec);
    const gt = chooseGrantTarget(cfg, king, nobles, rng);
    if (gt) applyGrant(cfg, king, gt, rng, rec);
    const tt = chooseTaxTarget(cfg, nobles, rng);
    if (tt) kingDemand(cfg, king, tt, rng, rec);
    const prisoners = nobles.filter((n) => n.alive && n.imprisoned).length;
    king.castle = Math.max(0, king.castle - prisoners * cfg.prisonUpkeep);

    if (kingConsiderAttack(cfg, king, nobles, rng)) {
      if (rec) rec.push(`  The king's patience breaks -- he ATTACKS the rebellion, forcing a reckoning.`);
      trigger = "attack";
      endRound = round;
      break;
    }

    // --- Noble phase ---
    const read = blocRead(cfg, king, nobles);
    for (const n of nobles) {
      if (!n.alive) continue;
      if (!n.imprisoned) n.coin += cfg.income + n.incomeBonus; // Mildegaarde: +1
      maybePayDownSeize(cfg, king, n, rec);
      n.resentment *= 0.9;
      n.favor *= 0.9; // buy-offs wear off (soft stand-in for a finite grant deck)
      const before = n.flag;
      if (cfg.leanModel === "grudge") updateLeanGrudge(cfg, n, rng);
      else nobleUpdate(cfg, king, n, rng, read);
      if (rec && before !== "rebellion" && n.flag === "rebellion")
        rec.push(`  ${label(n)} throws up the REBEL flag.`);
      if (rec && before === "rebellion" && n.flag === "crown")
        rec.push(`  ${label(n)} quietly lowers their flag back to crown.`);
    }

    // --- Triggers ---
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
    for (const n of nobles) {
      if (n.alive && !n.imprisoned && n.flag === king.purgeFlag) n.alive = false;
    }
    const winners = nobles.filter(
      (n) => n.alive && ((crownWon && n.lean === "survive") || (!crownWon && n.lean === "depose"))
    );
    if (rec) rec.push(`\nThe reign drifts to its cap with no reckoning called; it defaults to ${cfg.stallDefault}.`);
    return finalize(cfg, king, nobles, {
      crownWon, tie: false, outright: false, trigger, round: endRound,
      winners, victor: null, victorIsKing: crownWon,
    });
  }

  const res = reckoning(cfg, king, nobles, trigger, endRound, rec);
  return finalize(cfg, king, nobles, res);
}

function finalize(cfg, king, nobles, res) {
  let frontrunner = null;
  let fw = -Infinity;
  for (const n of nobles) {
    const w = n.coin * cfg.coinVP + n.assets[n.scoringType] * cfg.assetVP;
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
