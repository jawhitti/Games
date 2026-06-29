// Paper Victory -- "WHOSE CALL DO YOU ANSWER" variant.
//
// Each round the King and the Pope both CALL the court. Every courtier answers ONE:
//  - a GIFT call pays the courtier coin and brands them toward that throne (courtship);
//  - a DEMAND call taxes them into that throne's monument and brands them harder.
// Answering one means snubbing the other -- the public brand IS your visible allegiance.
// Two thrones compete for one scarce pool of answers, so neither funds easily, and each
// drifts from gifting to demanding as its monument lags. Conviction is still banked in
// secret; the reckoning is unchanged (the paper king).
//
// The sim checks the ECONOMY only -- the funding struggle, the gift->coerce arc, and
// whether paper kings still emerge. The whisper/poison intrigue is table-only.

const { Rng } = require("./rng");
const HOUSES = ["Mildegaarde", "Varrochi", "Ostlander", "Senne"];
const other = (c) => (c === "crown" ? "mitre" : "crown");

function makeGame(cfg, seed) {
  const rng = new Rng(seed);
  const players = [];
  const houses = rng.shuffle(HOUSES.slice());
  for (let i = 0; i < cfg.players; i++) {
    const role = i === 0 ? "king" : i === 1 ? "pope" : "courtier";
    players.push({
      id: i, role,
      house: role === "courtier" ? houses[(i - 2) % houses.length] : null,
      coin: cfg.startCoin,
      favor: { crown: 0, mitre: 0 }, // courtiers earn their public colors by answering calls
      conv: { crown: 0, mitre: 0 },
      loyalty: role === "king" ? "crown" : role === "pope" ? "mitre" : (rng.chance(0.5) ? "crown" : "mitre"),
      predicted: "crown",
      alive: true,
      answered: { crown: 0, mitre: 0 }, // how often it heeded each court (the public record)
    });
  }
  const mk = (color, name, pid) => ({ color, name, construction: 0, treasury: cfg.throneTreasury, player: players[pid], call: "gift" });
  return {
    cfg, rng, players,
    thrones: { crown: mk("crown", "King", 0), mitre: mk("mitre", "Pope", 1) },
    round: 0, trigger: null, completer: null,
    callLog: { early: { gift: 0, demand: 0 }, late: { gift: 0, demand: 0 } },
    tributePaid: 0, giftsGiven: 0,
  };
}

const courtiers = (g) => g.players.filter((p) => p.role === "courtier");
const totalFavor = (g, c) => g.players.reduce((s, p) => s + p.favor[c], 0);
const label = (p) => (p.role === "king" ? "the King" : p.role === "pope" ? "the Pope" : `House ${p.house}`);
const sideName = (c) => (c === "crown" ? "the King" : "the Pope");

function predict(g, p) {
  const sig = (c) => g.thrones[c].construction * 0.4 + totalFavor(g, c) * 0.6;
  return sig("crown") + g.rng.noise(0.8 * 2) >= sig("mitre") + g.rng.noise(0.8 * 2) ? "crown" : "mitre";
}

// a throne courts (gift) while on pace, and demands (coerces) when its monument lags
function decideCall(g, t) {
  if (t.treasury < g.cfg.giftValue) return "demand"; // chest empty -> must tax
  const pace = (g.round - 1) / g.cfg.callsExpectedRounds;
  return t.construction / g.cfg.monumentCost < pace ? "demand" : "gift";
}

// each courtier answers the more attractive call (self-interest), tilted by the throne
// it must look loyal to (survival) and the one it truly backs (allegiance)
function chooseThrone(g, c) {
  const score = (color) => {
    const t = g.thrones[color];
    let s = t.call === "gift" ? g.cfg.giftValue : -Math.min(c.coin, g.cfg.tribute);
    if (color === c.loyalty) s += g.cfg.allegianceBias;
    if (color === c.predicted) s += g.cfg.survivalBias;
    return s + g.rng.noise(g.cfg.answerNoise * 2);
  };
  return score("crown") >= score("mitre") ? "crown" : "mitre";
}

// The Houses press a throne to DENOUNCE -- to call the question -- when they read it
// winning. A House loyal to the throne urges it on when it looks ahead (lock the win);
// a House loyal to the rival baits it to call when it is behind (whisper it to its
// doom). The throne weighs the whispers by the whisperers' public loyalty to it.
function denouncePressure(g, t) {
  const total = totalFavor(g, "crown") + totalFavor(g, "mitre") || 1;
  let own = (totalFavor(g, t.color) - totalFavor(g, other(t.color))) / total; // its own read
  let num = 0, den = 0;
  for (const c of courtiers(g)) {
    if (!c.alive) continue;
    const readsWinning = c.predicted === t.color;
    const rec = c.loyalty === t.color ? (readsWinning ? 1 : -1) : (readsWinning ? -1 : 1);
    const trust = Math.max(0, c.favor[t.color] - c.favor[other(t.color)]) + 0.1;
    num += rec * trust; den += trust;
  }
  const whisper = den > 0 ? num / den : 0;
  return own * 0.4 + whisper * 0.6;
}

function reckoning(g, rec) {
  const aggC = g.players.reduce((s, p) => s + p.conv.crown, 0);
  const aggM = g.players.reduce((s, p) => s + p.conv.mitre, 0);
  const legit = aggC !== aggM ? (aggC > aggM ? "crown" : "mitre") : (g.thrones.crown.construction >= g.thrones.mitre.construction ? "crown" : "mitre");
  const pretender = other(legit);

  if (rec) {
    rec.push(`\n=== THE RECKONING ===`);
    if (g.trigger === "monument")
      rec.push(`${sideName(g.completer)} lays the last stone of his monument, certain he has won. The question is called.`);
    else if (g.trigger === "denounce")
      rec.push(`${sideName(g.denouncer)} -- urged on by whispering Houses -- DENOUNCES, certain the room is his.`);
    else rec.push(`The reckoning is forced (${g.trigger}).`);
    rec.push(`The hidden convictions turn face-up: ${aggC} for the Crown, ${aggM} for the Mitre.`);
    rec.push(`The room was ${sideName(legit)}'s all along. ${sideName(pretender)} is a pretender.`);
  }
  for (const p of g.players) {
    // a throne is definitionally its own color's man; a courtier is judged on its public favor
    const leansPretender = p.role !== "courtier" ? p.loyalty === pretender : p.favor[pretender] > p.favor[legit];
    if (leansPretender) {
      p.alive = false;
      if (rec) rec.push(`  PURGED: ${label(p)} -- ${p.role !== "courtier" ? "the pretender throne, cast down" : "knelt to the pretender, and dies for it"}${p.role === "courtier" && p.loyalty === legit ? " (secretly loyal the whole time -- a wasted heart)" : ""}.`);
    }
  }
  let winner = null, best = -Infinity;
  for (const p of g.players) {
    if (!p.alive || p.conv[legit] <= 0) continue;
    const s = p.conv[legit] * 1000 + p.coin + p.favor[legit];
    if (s > best) { best = s; winner = p; }
  }
  const ledger = totalFavor(g, "crown") >= totalFavor(g, "mitre") ? "crown" : "mitre";

  if (rec) {
    if (g.trigger === "monument" && g.completer === pretender)
      rec.push(`  ${sideName(pretender)} is denounced upon his own finished monument. A paper king.`);
    if (g.trigger === "denounce" && g.denouncer === pretender)
      rec.push(`  The whispers were poison: ${sideName(pretender)} called a count he could not win, and falls on his own command. A paper king.`);
    if (winner) {
      const took = winner.answered ? `${winner.answered[pretender]}/${winner.answered.crown + winner.answered.mitre} of his bows went to the loser` : "";
      const judas = winner.role === "courtier" && winner.answered[pretender] > winner.answered[legit];
      rec.push(`  >> ${label(winner)} takes the new order` +
        (judas ? ` -- having taken the pretender's gold the whole game (${took}) and never once meant it.` : `.`));
    } else rec.push(`  >> No one is left to claim it.`);
  }
  return {
    trigger: g.trigger, round: g.round, legit, winner, winnerRole: winner ? winner.role : "none",
    throneWon: winner ? winner.role !== "courtier" : false,
    paperVictory: (g.trigger === "monument" && g.completer === pretender) || (g.trigger === "denounce" && g.denouncer === pretender),
    denounced: g.trigger === "denounce",
    denouncerDied: g.denouncer ? !g.thrones[g.denouncer].player.alive : false,
    ledgerMatch: ledger === legit,
    kingConstruction: g.thrones.crown.construction,
    popeConstruction: g.thrones.mitre.construction,
    tributePaid: g.tributePaid, giftsGiven: g.giftsGiven,
    earlyGiftFrac: g.callLog.early.gift / (g.callLog.early.gift + g.callLog.early.demand || 1),
    lateGiftFrac: g.callLog.late.gift / (g.callLog.late.gift + g.callLog.late.demand || 1),
  };
}

function playGame(cfg, seed, rec) {
  const g = makeGame(cfg, seed);
  if (rec) {
    rec.push(`### PAPER VICTORY -- whispers in the hallway ###`);
    rec.push(`The King raises a Castle, the Pope a Cathedral. The court (true hearts, known only to us):`);
    for (const c of courtiers(g)) rec.push(`  House ${c.house} -- secretly ${sideName(c.loyalty)}'s.`);
  }
  for (g.round = 1; g.round <= cfg.roundCap; g.round++) {
    if (rec) rec.push(`\n-- Round ${g.round} --`);
    for (const p of g.players) if (p.alive) p.coin += cfg.income + (p.house === "Mildegaarde" ? 1 : 0);
    for (const c of ["crown", "mitre"]) g.thrones[c].treasury += cfg.income;
    for (const p of g.players) if (p.alive) p.predicted = predict(g, p);

    // both thrones declare their call
    for (const c of ["crown", "mitre"]) {
      const t = g.thrones[c];
      t.call = decideCall(g, t);
      const bucket = g.round <= 3 ? "early" : g.round > cfg.roundCap - 3 ? "late" : null;
      if (bucket) g.callLog[bucket][t.call]++;
      if (rec) rec.push(`  ${t.name} ${t.call === "gift" ? "GIFTS (courts the room)" : "DEMANDS tribute"}  [monument ${t.construction}/${cfg.monumentCost}, chest ${Math.round(t.treasury)}]`);
    }
    // each courtier answers one call
    for (const c of courtiers(g)) {
      if (!c.alive) continue;
      const ans = chooseThrone(g, c);
      const t = g.thrones[ans];
      c.answered[ans] += 1;
      c.favor[ans] += cfg.brandAnswer;
      const heart = ans !== c.loyalty ? " (his heart elsewhere)" : "";
      if (t.call === "gift") {
        const gv = Math.min(cfg.giftValue, t.treasury);
        c.coin += gv; t.treasury -= gv; g.giftsGiven += gv;
        if (rec) rec.push(`    House ${c.house} heeds ${t.name} -- pockets a gift of ${gv}${heart}.`);
      } else {
        const pay = Math.min(c.coin, cfg.tribute);
        c.coin -= pay; t.construction += pay; g.tributePaid += pay;
        c.favor[ans] += cfg.brandTribute;
        if (rec) rec.push(`    House ${c.house} heeds ${t.name} -- pays tribute ${pay}${heart} [monument ${t.construction}/${cfg.monumentCost}].`);
      }
      if (t.construction >= cfg.monumentCost && !g.trigger) { g.trigger = "monument"; g.completer = t.color; }
    }
    if (g.trigger) break;
    // conviction (secret)
    for (const p of g.players) {
      if (!p.alive) continue;
      const color = p.role !== "courtier"
        ? (g.rng.chance(cfg.convSelfBiasThrone) ? p.loyalty : p.predicted)
        : (g.rng.chance(cfg.convLoyalty) ? p.loyalty : p.predicted);
      p.conv[color] += 1;
    }
    // THE HOUSES PRESS FOR THE COUNT: a throne denounces when its trusted Houses
    // whisper that the room is its (or an enemy baits it into calling while behind)
    for (const col of ["crown", "mitre"]) {
      if (g.round < cfg.denounceMinRound) break; // the whispers must be earned first
      const t = g.thrones[col];
      if (t.player.coin >= cfg.denounceCost && denouncePressure(g, t) > cfg.denounceConfidence) {
        t.player.coin -= cfg.denounceCost;
        g.trigger = "denounce"; g.denouncer = col;
        if (rec) rec.push(`  Its Houses whisper that the room is his -- ${sideName(col)} DENOUNCES the rival and calls the question.`);
        break;
      }
    }
    if (g.trigger) break;
  }
  if (!g.trigger) g.trigger = "backstop";
  return reckoning(g, rec);
}

module.exports = { playGame, HOUSES };
