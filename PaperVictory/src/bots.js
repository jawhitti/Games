// Roster construction. Strategy *behaviour* lives in engine.js; this file builds
// the noble objects: their House (with its edge), typed holdings, color, and the
// Phase 1/2 carry-over. House and strategy are assigned INDEPENDENTLY so neither
// contaminates the other's win statistics.

const HOUSE_KINDS = ["farmer", "manufacturer", "banker"];

// each kind scores a different asset type at the reckoning
const SCORING_TYPE = { farmer: "estate", manufacturer: "factory", banker: "charter" };

// the six Houses (two per kind), each with one mechanical edge
const HOUSES = [
  { name: "Varrochi", kind: "farmer", edge: "refuse" }, // once: refuse a demand free
  { name: "Hesse", kind: "farmer", edge: "startEstate" }, // begins holding an estate
  { name: "Brandt", kind: "manufacturer", edge: "iouToCoin" }, // once: IOU -> coin
  { name: "Krael", kind: "manufacturer", edge: "extraThreat" }, // carries an extra threat
  { name: "Mildegaarde", kind: "banker", edge: "income" }, // +1 income each round
  { name: "Ostlander", kind: "banker", edge: "extraIou" }, // an extra IOU in hand
];

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function expandMix(cfg) {
  const strats = [];
  for (const [name, count] of Object.entries(cfg.strategyMix)) {
    for (let i = 0; i < count; i++) strats.push(name);
  }
  while (strats.length < cfg.nobles) strats.push("honest");
  strats.length = cfg.nobles;
  return strats;
}

function buildRoster(cfg, rng) {
  // independent shuffles: House is not correlated with strategy
  const houses = shuffle(HOUSES.slice(), rng);
  const strats = shuffle(expandMix(cfg), rng);

  return Array.from({ length: cfg.nobles }, (_, i) => {
    const house = houses[i % houses.length];
    const kind = house.kind;
    const scoringType = SCORING_TYPE[kind];
    const strat = strats[i];

    const coin = Math.max(
      0,
      Math.round(cfg.carriedCoinMean + rng.noise(cfg.carriedCoinSpread))
    );
    let threats = Math.max(0, Math.round(cfg.carriedThreatsMean + rng.noise(1)));
    let promises = rng.chance(0.5) ? 1 : 0;
    const startAssets = Math.max(0, Math.round(cfg.startingAssetMean + rng.noise(1)));

    const landValue = () =>
      cfg.landValueMin + rng.int(cfg.landValueMax - cfg.landValueMin + 1);

    // a noble's pre-existing holdings are its own type, each with its own value
    const lands = [];
    for (let k = 0; k < startAssets; k++) lands.push({ type: scoringType, value: landValue() });

    // House edges that fire at setup (magnitudes from config, for balance tuning)
    if (house.edge === "startEstate" && cfg.edgeStartEstateValue > 0)
      lands.push({ type: "estate", value: cfg.edgeStartEstateValue });
    if (house.edge === "extraThreat") threats += cfg.edgeExtraThreat;
    if (house.edge === "extraIou") promises += cfg.edgeExtraPromise;
    // the one-shot Houses also hold a small SCORING land (ancient land / mills)
    if (house.edge === "refuse" && cfg.edgeVarrochiLand > 0)
      lands.push({ type: "estate", value: cfg.edgeVarrochiLand });
    if (house.edge === "iouToCoin" && cfg.edgeBrandtLand > 0)
      lands.push({ type: "factory", value: cfg.edgeBrandtLand });

    const startWorth = lands.reduce((s, l) => s + l.value, 0);

    // public COLOR (set at the Coronation): losing-color = burned bloc
    const losing = !rng.chance(cfg.winColorProb);
    let lean = losing ? "depose" : "survive";
    if (strat === "safeFlagBetrayer") lean = "depose";
    else if (strat === "loyalist") lean = "survive";
    else if (strat === "opportunist") lean = rng.chance(0.5) ? "survive" : "depose";

    return {
      id: i,
      house: house.name,
      kind,
      scoringType,
      edge: house.edge,
      strat,
      color: losing ? "lose" : "win",
      losing,
      flag: "crown",
      coin,
      lands, // [{type, value}] -- typed, individually valued holdings
      threats,
      promises,
      lean,
      imprisoned: false,
      alive: true,
      resentment: 0,
      favor: startWorth,
      pendingSeize: 0,
      pendingAmt: 0,
      grievance: 0,
      // one-shot / passive edge state
      refuseLeft: house.edge === "refuse" ? cfg.edgeRefuse : 0,
      iouToCoinLeft: house.edge === "iouToCoin" ? cfg.edgeIouToCoin : 0,
      incomeBonus: house.edge === "income" ? cfg.edgeIncome : 0,
    };
  });
}

module.exports = { buildRoster, expandMix, shuffle, HOUSE_KINDS, SCORING_TYPE, HOUSES };
