// Roster construction. Strategy *behaviour* lives in engine.js; this file only
// builds the noble objects from the configured strategy mix and carry-over.

const { Rng } = require("./rng");

const HOUSE_KINDS = ["farmer", "manufacturer", "banker"];

function expandMix(cfg) {
  const strats = [];
  for (const [name, count] of Object.entries(cfg.strategyMix)) {
    for (let i = 0; i < count; i++) strats.push(name);
  }
  // pad with honest / truncate to exactly cfg.nobles
  while (strats.length < cfg.nobles) strats.push("honest");
  strats.length = cfg.nobles;
  return strats;
}

function buildRoster(cfg, rng) {
  const strats = expandMix(cfg);
  return strats.map((strat, i) => {
    const coin = Math.max(
      0,
      Math.round(cfg.carriedCoinMean + rng.noise(cfg.carriedCoinSpread))
    );
    const threats = Math.max(0, Math.round(cfg.carriedThreatsMean + rng.noise(1)));
    const startAssets = Math.max(0, Math.round(cfg.startingAssetMean + rng.noise(1)));
    // public COLOR (set at the Coronation): "win" = shares the king's winning color,
    // "lose" = backed the wrong color, ate threats -> the natural opposition bloc.
    const losing = !rng.chance(cfg.winColorProb);
    // initial lean tracks color (the burned want him gone); strategies override.
    let lean = losing ? "depose" : "survive";
    if (strat === "safeFlagBetrayer") lean = "depose";
    else if (strat === "loyalist") lean = "survive";
    else if (strat === "opportunist") lean = rng.chance(0.5) ? "survive" : "depose";
    return {
      id: i,
      kind: HOUSE_KINDS[i % HOUSE_KINDS.length],
      strat,
      color: losing ? "lose" : "win",
      losing,
      flag: "crown", // everyone plays safe at the Coronation; rebel flags go up later
      coin,
      brand: startAssets > 0 ? 1 : 0, // holds a starting grant (favour/score source)
      score: startAssets, // own-House scoring assets
      threats,
      promises: rng.chance(0.5) ? 1 : 0,
      lean,
      imprisoned: false,
      alive: true,
      resentment: 0,
      favor: startAssets, // starting grants count as initial favour
      pendingSeize: 0, // >0 = a seize-threat is live, counting down to execution
      pendingAmt: 0, // value owed on the pending seize-threat
      grievance: 0, // PERSISTENT, non-decaying depose-pressure from seize-threats
    };
  });
}

module.exports = { buildRoster, expandMix, HOUSE_KINDS };
