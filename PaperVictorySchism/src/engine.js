// Paper Victory (BASE game): King vs Pope two-throne schism.
//
// Two thrones race to raise a monument; everyone secretly banks Conviction each round.
// The SECRET aggregate decides which throne is legitimate; the other is the pretender.
// Anyone whose PUBLIC favor leaned pretender is purged; among survivors the top secret
// backer of the legitimate throne wins. Completing a monument only TRIGGERS the
// reckoning -- it does not win (the paper victory).
//
// HONEST ABSTRACTION: deliberate bluffing/feinting (the social layer) is NOT modeled;
// bots play "honestly" -- public favor tracks their real predicted side as far as coin
// allows, and poverty-coercion is the natural source of public/secret divergence. The
// sim measures the mechanical skeleton (death paths, who wins, and -- the designer's #1
// question -- how well the public ledger predicts the secret vote vs the Fine).

const { Rng } = require("./rng");

const HOUSES = ["Mildegaarde", "Varrochi", "Ostlander", "Senne"];
const other = (c) => (c === "crown" ? "mitre" : "crown");

function buildDeck(cfg, rng) {
  const deck = [];
  for (const [card, n] of Object.entries(cfg.deck)) for (let i = 0; i < n; i++) deck.push(card);
  return rng.shuffle(deck);
}

function makeGame(cfg, seed) {
  const rng = new Rng(seed);
  const players = [];
  // 2 thrones + courtiers
  const roles = ["king", "pope"];
  const houses = rng.shuffle(HOUSES.slice());
  for (let i = 0; i < cfg.players; i++) {
    const role = i < 2 ? roles[i] : "courtier";
    const house = role === "courtier" ? houses[(i - 2) % houses.length] : null;
    const hand = { ...cfg.chaliceHand };
    if (house === "Ostlander") { hand.plus += cfg.ostlanderExtraChalice; hand.minus += cfg.ostlanderExtraChalice; }
    players.push({
      id: i, role, house,
      coin: cfg.startCoin,
      favor: { crown: 0, mitre: 0 }, // public, visible
      conv: { crown: 0, mitre: 0 }, // secret
      chalice: hand,
      alive: true,
      predicted: "crown",
      loyalty: role === "king" ? "crown" : role === "pope" ? "mitre" : (rng.chance(0.5) ? "crown" : "mitre"),
      publicLean: "crown",
      varrochiRefuse: house === "Varrochi" ? 1 : 0,
      senneSurge: house === "Senne" ? 1 : 0,
    });
  }
  const mkThrone = (color, name, pid) => ({
    color, name, construction: 0, vitality: cfg.startVitality,
    deck: buildDeck(cfg, rng), discard: [], reshuffles: 0, player: players[pid],
  });
  return {
    cfg, rng, players,
    thrones: { crown: mkThrone("crown", "King", 0), mitre: mkThrone("mitre", "Pope", 1) },
    round: 0, trigger: null, completer: null,
  };
}

function courtiers(g) { return g.players.filter((p) => p.role === "courtier"); }
function totalFavor(g, color) { return g.players.reduce((s, p) => s + p.favor[color], 0); }

// a player's read of which throne will prove legitimate (public signals + noise)
function predict(g, p) {
  const sig = (c) => {
    const t = g.thrones[c];
    return t.construction * 0.3 + t.vitality * 0.5 + totalFavor(g, c) * 0.6;
  };
  const crown = sig("crown") + g.rng.noise(g.cfg.predictNoise * 2);
  const mitre = sig("mitre") + g.rng.noise(g.cfg.predictNoise * 2);
  return crown >= mitre ? "crown" : "mitre";
}

function predictPhase(g) {
  for (const p of g.players) {
    if (!p.alive) continue;
    p.predicted = predict(g, p);
    // public lean: wear your true colors -- unless you're loyal to the side you read
    // LOSING, in which case you may feint toward the winner to dodge the purge
    if (p.role !== "courtier") p.publicLean = p.loyalty;
    else if (p.loyalty !== p.predicted && g.rng.chance(g.cfg.feintTendency)) p.publicLean = p.predicted;
    else p.publicLean = p.loyalty;
  }
}

// ---- deck draw with reshuffle / backstop ----
function draw3(g, t) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    if (t.deck.length === 0) {
      if (t.discard.length === 0) break;
      t.deck = g.rng.shuffle(t.discard);
      t.discard = [];
      t.reshuffles += 1;
    }
    out.push(t.deck.pop());
  }
  return out;
}

// ---- favors ----
function favorResolve(g, t, tier, target, rec) {
  const f = g.cfg.favor[tier];
  const fine = Math.round(f.fine * g.cfg.fineMult);
  const publicSupports = target.publicLean === t.color; // the stance the courtier shows
  const secretSupports = target.loyalty === t.color; // what the courtier truly believes
  const canRefuse = target.coin >= fine || target.varrochiRefuse > 0;
  // accept if your public stance is this throne, or you cannot afford to refuse (coerced)
  const accept = publicSupports || !canRefuse;
  if (accept) {
    target.coin += f.reward;
    if (t.player.coin > 0) t.player.coin = Math.max(0, t.player.coin - f.reward); // throne foots the bribe
    target.favor[t.color] += f.brand;
    if (tier === "branding") {
      // the cup: heal (+1) if you truly back this throne, poison (-1) if you secretly
      // oppose it -- a feinter publicly kneeling here slips in the knife
      const v = secretSupports ? 1 : -1;
      const pool = v > 0 ? "plus" : "minus";
      if (target.chalice[pool] > 0) {
        target.chalice[pool] -= 1;
        const idx = g.rng.int(t.deck.length + 1);
        t.deck.splice(idx, 0, { chalice: v });
      }
    }
    if (rec) rec.push(`    ${label(target)} ACCEPTS ${t.name}'s ${tier} favor (+${f.brand} ${t.color})${tier === "branding" ? ` and slips a ${secretSupports ? "+1" : "-1"} into the cup` : ""}.`);
  } else {
    if (target.varrochiRefuse > 0 && target.coin < fine) target.varrochiRefuse -= 1; // free refusal
    else { target.coin -= fine; t.construction += fine; }
    target.favor[other(t.color)] += 1;
    if (rec) rec.push(`    ${label(target)} REFUSES ${t.name}'s ${tier} favor (+1 ${other(t.color)}, fine ${f.fine} to the monument).`);
  }
}

function chooseFavorTarget(g, t) {
  // brand a courtier currently leaning rival (pull them), preferring the poor (coercible)
  const pool = courtiers(g).filter((c) => c.alive);
  if (!pool.length) return null;
  return pool.reduce((a, b) => {
    const sa = a.favor[other(t.color)] - a.coin * 0.1;
    const sb = b.favor[other(t.color)] - b.coin * 0.1;
    return sb > sa ? b : a;
  });
}

function canDenounceBasics(g, t) {
  return t.vitality >= g.cfg.denounceMinVitality && t.player.coin >= g.cfg.denounceCost;
}
function ledgerEdge(g, t) {
  const total = totalFavor(g, "crown") + totalFavor(g, "mitre") || 1;
  return (totalFavor(g, t.color) - totalFavor(g, other(t.color))) / total;
}
// a player wants the reckoning NOW iff the side it is LOYAL to is the side it reads
// winning -- lock in the win. (Losing-side loyalists want to hold and pray.)
const wantsReckoningNow = (p) => p.predicted === p.loyalty;

// the throne's denounce pressure: its own ledger read, plus (if enabled) the weighted
// whispers of the court. A "denounce" whisper from a publicly-loyal adviser is trusted;
// from someone leaning the rival it is discounted (they may be baiting you to the block).
function denouncePressure(g, t) {
  let p = ledgerEdge(g, t);
  if (g.cfg.messagesEnabled) {
    let num = 0, den = 0;
    for (const c of courtiers(g)) {
      if (!c.alive) continue;
      // throne-directed advice: a courtier loyal to THIS throne says "denounce" only
      // when it reads this throne winning (honest); a courtier loyal to the RIVAL
      // says "denounce" when this throne is LOSING -- baiting it to fire and fall.
      const winningHere = c.predicted === t.color;
      const rec = c.loyalty === t.color ? (winningHere ? 1 : -1) : (winningHere ? -1 : 1);
      const trust = g.cfg.trustMode === "naive" ? 1 : Math.max(0, c.favor[t.color] - c.favor[other(t.color)]) + 0.1;
      num += rec * trust; den += trust;
    }
    const msg = den > 0 ? num / den : 0;
    p = p * 0.4 + msg * 0.6; // the whisper weighs heavily on this one decision
  }
  return p;
}
function canDenounce(g, t) {
  return canDenounceBasics(g, t) && denouncePressure(g, t) > g.cfg.denounceConfidence;
}

function resolveAction(g, t, action, rec) {
  if (action === "LEVY") {
    for (const c of courtiers(g)) if (c.alive) {
      const pay = Math.min(c.coin, g.cfg.levyPerCourtier);
      c.coin -= pay; t.construction += pay;
    }
    if (rec) rec.push(`  ${t.name} LEVIES the courtiers (monument ${t.construction}/${g.cfg.monumentCost}).`);
  } else if (action.startsWith("FAVOR_")) {
    const tier = action.split("_")[1];
    const target = chooseFavorTarget(g, t);
    if (target) { if (rec) rec.push(`  ${t.name} offers a ${tier} favor to ${label(target)}:`); favorResolve(g, t, tier, target, rec); }
  } else if (action === "INDULGENCE") {
    const target = chooseFavorTarget(g, t);
    if (target && t.player.coin >= g.cfg.indulgenceCost) {
      t.player.coin -= g.cfg.indulgenceCost; target.favor[t.color] += 1;
      if (rec) rec.push(`  ${t.name} buys an INDULGENCE -- brands ${label(target)} +1 ${t.color}.`);
    }
  } else if (action === "DENOUNCE") {
    t.player.coin -= g.cfg.denounceCost; g.trigger = "denounce"; g.denouncer = t.color;
    if (rec) rec.push(`  ${t.name} DENOUNCES the rival -- the reckoning is forced!`);
  } else if (action === "MEDDLE") {
    const rival = g.thrones[other(t.color)];
    // kill the rival if you read yourself legit; keep him alive if you're behind
    const wantDead = canDenounce(g, t) || totalFavor(g, t.color) >= totalFavor(g, other(t.color));
    const v = wantDead ? -1 : 1;
    rival.deck.splice(g.rng.int(rival.deck.length + 1), 0, { chalice: v });
    if (rec) rec.push(`  ${t.name} MEDDLES in the rival's cup (${v > 0 ? "+1" : "-1"}, hidden).`);
  }
  if (t.construction >= g.cfg.monumentCost && !g.trigger) { g.trigger = "monument"; g.completer = t.color; }
}

function courtTurn(g, t, rec) {
  if (g.trigger) return;
  const drawn = draw3(g, t);
  for (const c of drawn) if (c && c.chalice) t.vitality = Math.max(0, t.vitality + c.chalice);
  if (t.vitality <= 0) { g.trigger = "vitality"; return; }
  const actions = drawn.filter((c) => typeof c === "string");
  if (actions.length === 0) { if (rec) rec.push(`  ${t.name}'s court draws only poison -- no action this turn.`); return; }
  // choose action
  let action;
  if (actions.includes("DENOUNCE") && canDenounce(g, t)) action = "DENOUNCE";
  else {
    const fav = ["FAVOR_branding", "FAVOR_committing", "FAVOR_token"].find((a) => actions.includes(a));
    action = fav || (actions.includes("LEVY") ? "LEVY" : actions.includes("MEDDLE") ? "MEDDLE" : actions[0]);
  }
  for (const a of actions) t.discard.push(a);
  resolveAction(g, t, action, rec);
}

function convictionPhase(g, rec) {
  for (const p of g.players) {
    if (!p.alive) continue;
    let color;
    if (p.role !== "courtier") color = g.rng.chance(g.cfg.convSelfBiasThrone) ? p.loyalty : p.predicted;
    else color = g.rng.chance(g.cfg.convLoyalty) ? p.loyalty : p.predicted; // mostly your heart, sometimes hedge
    let amt = 1;
    if (p.senneSurge > 0 && g.round >= 3) { amt = 2; p.senneSurge -= 1; } // Senne's surge
    p.conv[color] += amt;
  }
}

function label(p) {
  if (p.role === "king") return "the King";
  if (p.role === "pope") return "the Pope";
  return `${p.house}`;
}

function reckoning(g, rec) {
  const aggC = g.players.reduce((s, p) => s + p.conv.crown, 0);
  const aggM = g.players.reduce((s, p) => s + p.conv.mitre, 0);
  let legit;
  if (aggC !== aggM) legit = aggC > aggM ? "crown" : "mitre";
  else legit = g.thrones.crown.vitality >= g.thrones.mitre.vitality ? "crown" : "mitre";
  const pretender = other(legit);

  if (rec) {
    rec.push(`\n=== THE RECKONING (${g.trigger}) ===`);
    rec.push(`  Secret conviction: Crown ${aggC} vs Mitre ${aggM} -> ${legit === "crown" ? "the KING" : "the POPE"} is legitimate; the ${pretender === "crown" ? "King" : "Pope"} a pretender.`);
  }
  // purge: public lean toward the pretender = death
  for (const p of g.players) {
    if (p.favor[pretender] > p.favor[legit]) {
      p.alive = false;
      if (rec) rec.push(`  PURGE: ${label(p)} knelt to the pretender -- executed.`);
    }
  }
  // winner: top secret backer of the legitimate throne, among survivors
  let winner = null, best = -Infinity;
  for (const p of g.players) {
    if (!p.alive) continue;
    const s = p.conv[legit] * 1000 + p.coin + p.favor[legit];
    if (p.conv[legit] > 0 && s > best) { best = s; winner = p; }
  }
  if (rec) rec.push(`  >> WINNER: ${winner ? label(winner) : "no one"} (most secret conviction in the legitimate throne).`);

  // public-ledger prediction (the "can the king read his fate" proxy)
  const ledger = totalFavor(g, "crown") >= totalFavor(g, "mitre") ? "crown" : "mitre";
  return {
    trigger: g.trigger, legit,
    winner, winnerRole: winner ? winner.role : "none",
    throneWon: winner ? winner.role !== "courtier" : false,
    legitThroneSurvived: g.thrones[legit].player.alive,
    paperVictory: g.trigger === "monument" && g.completer === pretender,
    ledgerMatch: ledger === legit, // did public favor predict the secret aggregate?
    purged: g.players.filter((p) => !p.alive).length,
    aggMargin: Math.abs(aggC - aggM),
    denounced: !!g.denouncer,
    // did the throne that pulled the DENOUNCE trigger die for it? (baited to the block)
    denouncerDied: g.denouncer ? !g.thrones[g.denouncer].player.alive : false,
  };
}

function playGame(cfg, seed, rec) {
  const g = makeGame(cfg, seed);
  if (rec) {
    rec.push(`### PAPER VICTORY -- King vs Pope ###`);
    rec.push(`  The King raises a Castle, the Pope a Cathedral. ${courtiers(g).length} courtiers watch and kneel.`);
  }
  for (g.round = 1; g.round <= cfg.roundCap; g.round++) {
    if (rec) rec.push(`\n-- Round ${g.round} --`);
    for (const p of g.players) if (p.alive) p.coin += cfg.income + (p.house === "Mildegaarde" ? 1 : 0);
    predictPhase(g);
    courtTurn(g, g.thrones.crown, rec);
    if (g.trigger) break;
    courtTurn(g, g.thrones.mitre, rec);
    if (g.trigger) break;
    convictionPhase(g, rec);
    if (g.thrones.crown.reshuffles >= cfg.reshuffleCap || g.thrones.mitre.reshuffles >= cfg.reshuffleCap) { g.trigger = "backstop"; break; }
  }
  if (!g.trigger) g.trigger = "backstop";
  return reckoning(g, rec);
}

module.exports = { playGame, HOUSES };
