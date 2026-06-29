// Paper Victory -- "whose call" with two finite treasuries and class scoring.
//
// King = LAND, Pope = JEWELS. Each round both thrones make one public offer; each
// House answers ONE. A throne GIFTS its currency from a finite hoard (courting -- and
// spending its own win-stock) while it can keep a reserve, then DEMANDS tribute when
// low. Houses crave by class: farmers want land, bankers want jewels, merchants both.
//
// Secret conviction -> legitimacy. Public allegiance -> the purge. At the reckoning the
// WINNING throne's currency keeps full value, the loser's is devalued. Each player
// scores by class: farmer=land, banker=jewels, merchant=both; King scores his retained
// land, Pope his retained jewels. The point of the build: see whether the classes
// pursue DIFFERENT thrones (the bandwagon-breaker) and whether the seats win ~equally.

const { Rng } = require("./rng");
const other = (c) => (c === "crown" ? "mitre" : "crown");

function makeGame(cfg, seed) {
  const rng = new Rng(seed);
  const classes = [];
  for (const [k, n] of Object.entries(cfg.classMix)) for (let i = 0; i < n; i++) classes.push(k);
  while (classes.length < cfg.players - 2) classes.push("merchant");
  classes.length = cfg.players - 2;
  rng.shuffle(classes);

  const players = [];
  for (let i = 0; i < cfg.players; i++) {
    const role = i === 0 ? "king" : i === 1 ? "pope" : "courtier";
    const klass = role === "king" ? "farmer" : role === "pope" ? "banker" : classes[i - 2];
    const loyalty = klass === "farmer" ? "crown" : klass === "banker" ? "mitre" : (rng.chance(0.5) ? "crown" : "mitre");
    players.push({
      id: i, role, klass, loyalty, predicted: "crown",
      coin: cfg.startCoin, land: 0, jewel: 0,
      favor: { crown: 0, mitre: 0 }, conv: { crown: 0, mitre: 0 },
      alive: true,
    });
  }
  const mk = (color, name, pid) => ({ color, name, stock: cfg.throneStock, power: 0, player: players[pid], call: "gift" });
  return {
    cfg, rng, players,
    thrones: { crown: mk("crown", "King", 0), mitre: mk("mitre", "Pope", 1) },
    round: 0, trigger: null, denouncer: null,
    answers: { farmer: { crown: 0, mitre: 0 }, banker: { crown: 0, mitre: 0 }, merchant: { crown: 0, mitre: 0 } },
  };
}

const courtiers = (g) => g.players.filter((p) => p.role === "courtier");
const totalFavor = (g, c) => g.players.reduce((s, p) => s + p.favor[c], 0);

function predict(g, p) {
  const a = totalFavor(g, "crown") + g.rng.noise(0.8 * 2);
  const b = totalFavor(g, "mitre") + g.rng.noise(0.8 * 2);
  return a >= b ? "crown" : "mitre";
}

// a throne courts (gift) while it can spare treasure above its reserve, else demands
function decideCall(g, t) {
  return t.stock > g.cfg.throneReserve ? "gift" : "demand";
}

// class scoring as bonuses on top of holdings: farmer +50% land, banker +50% money,
// merchant +2*min(land,money) (rewards balance, so he must court both courts evenly)
function rawScore(klass, L, J, mMult = 2, sBonus = 0.5) {
  if (klass === "farmer") return (1 + sBonus) * L + J;
  if (klass === "banker") return L + (1 + sBonus) * J;
  return L + J + mMult * Math.min(L, J); // merchant
}

// each House answers whichever call gives it the most SCORE this round (behavior falls
// out of the bonus -- farmers chase land, bankers money, merchants their short side),
// tilted toward the throne it must look loyal to (survival)
function chooseThrone(g, c) {
  const sc = (color) => {
    const t = g.thrones[color];
    let s;
    if (t.call === "gift") {
      const L2 = c.land + (color === "crown" ? g.cfg.giftValue : 0);
      const J2 = c.jewel + (color === "mitre" ? g.cfg.giftValue : 0);
      s = rawScore(c.klass, L2, J2, g.cfg.merchantMult, g.cfg.specialistBonus) - rawScore(c.klass, c.land, c.jewel, g.cfg.merchantMult, g.cfg.specialistBonus); // marginal gain
    } else {
      s = -Math.min(c.coin, g.cfg.tribute) * 0.4; // a demand is a cost, little draw
    }
    if (color === c.predicted) s += g.cfg.survivalBias;
    return s + g.rng.noise(g.cfg.answerNoise * 2);
  };
  return sc("crown") >= sc("mitre") ? "crown" : "mitre";
}

function denouncePressure(g, t) {
  let own = (totalFavor(g, t.color) - totalFavor(g, other(t.color))) / (totalFavor(g, "crown") + totalFavor(g, "mitre") || 1);
  let num = 0, den = 0;
  for (const c of courtiers(g)) {
    if (!c.alive) continue;
    const winningHere = c.predicted === t.color;
    const rec = c.loyalty === t.color ? (winningHere ? 1 : -1) : (winningHere ? -1 : 1);
    const trust = Math.max(0, c.favor[t.color] - c.favor[other(t.color)]) + 0.1;
    num += rec * trust; den += trust;
  }
  return own * 0.4 + (den > 0 ? num / den : 0) * 0.6;
}

function scoreOf(g, p, legit) {
  const lm = legit === "crown" ? 1 : g.cfg.loserDevalue;
  const jm = legit === "mitre" ? 1 : g.cfg.loserDevalue;
  if (p.role === "king") return rawScore("farmer", g.thrones.crown.stock * lm, 0, g.cfg.merchantMult, g.cfg.specialistBonus); // arch-farmer
  if (p.role === "pope") return rawScore("banker", 0, g.thrones.mitre.stock * jm, g.cfg.merchantMult, g.cfg.specialistBonus); // arch-banker
  return rawScore(p.klass, p.land * lm, p.jewel * jm, g.cfg.merchantMult, g.cfg.specialistBonus);
}

function reckoning(g) {
  const aggC = g.players.reduce((s, p) => s + p.conv.crown, 0);
  const aggM = g.players.reduce((s, p) => s + p.conv.mitre, 0);
  const legit = aggC !== aggM ? (aggC > aggM ? "crown" : "mitre") : (g.thrones.crown.stock >= g.thrones.mitre.stock ? "crown" : "mitre");
  const pretender = other(legit);
  for (const p of g.players) {
    const leansPretender = p.role !== "courtier" ? p.loyalty === pretender : p.favor[pretender] > p.favor[legit];
    if (leansPretender) p.alive = false;
  }
  let winner = null, best = -Infinity;
  for (const p of g.players) {
    if (!p.alive) continue;
    const s = scoreOf(g, p, legit);
    if (s > best) { best = s; winner = p; }
  }
  return {
    trigger: g.trigger, round: g.round, legit,
    winnerRole: winner ? winner.role : "none",
    winnerSeat: winner ? (winner.role !== "courtier" ? winner.role : winner.klass) : "none",
    answers: g.answers,
    kingLand: g.thrones.crown.stock, popeJewel: g.thrones.mitre.stock,
  };
}

function playGame(cfg, seed) {
  const g = makeGame(cfg, seed);
  for (g.round = 1; g.round <= cfg.roundCap; g.round++) {
    for (const p of g.players) if (p.alive) p.coin += cfg.income;
    for (const p of g.players) if (p.alive) p.predicted = predict(g, p);
    for (const col of ["crown", "mitre"]) g.thrones[col].call = decideCall(g, g.thrones[col]);

    for (const c of courtiers(g)) {
      if (!c.alive) continue;
      const ans = chooseThrone(g, c);
      const t = g.thrones[ans];
      c.favor[ans] += cfg.brandAnswer;
      g.answers[c.klass][ans] += 1;
      if (t.call === "gift") {
        const gv = Math.min(cfg.giftValue, t.stock);
        t.stock -= gv;
        if (ans === "crown") c.land += gv; else c.jewel += gv;
      } else {
        const pay = Math.min(c.coin, cfg.tribute);
        c.coin -= pay; t.power += pay; c.favor[ans] += cfg.brandTribute;
      }
    }
    for (const p of g.players) {
      if (!p.alive) continue;
      const color = p.role !== "courtier"
        ? (g.rng.chance(cfg.convSelfBiasThrone) ? p.loyalty : p.predicted)
        : (g.rng.chance(cfg.convLoyalty) ? p.loyalty : p.predicted);
      p.conv[color] += 1;
    }
    if (g.round >= cfg.denounceMinRound) {
      for (const col of ["crown", "mitre"]) {
        const t = g.thrones[col];
        if (t.player.coin >= cfg.denounceCost && denouncePressure(g, t) > cfg.denounceConfidence) {
          t.player.coin -= cfg.denounceCost; g.trigger = "denounce"; g.denouncer = col; break;
        }
      }
    }
    if (g.trigger) break;
  }
  if (!g.trigger) g.trigger = "backstop";
  return reckoning(g);
}

module.exports = { playGame };
