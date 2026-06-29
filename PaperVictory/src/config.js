// Config for Paper Victory: The Reign (second-half simulator).
// Rebellion is a DISCRETE MUSTER: someone declares "Rebellion!", every noble
// secretly commits to join or stand aside, all reveal at once, and a majority of
// nobles topples the king. The economy (house-to-house favors, valued lands, the
// generosity->brutality arc) is unchanged.

const DEFAULT_CONFIG = {
  // --- table shape ---
  // SIX players total: the Campaign elects one King, the other five become Nobles.
  nobles: 5, // reign nobles (= players - 1)
  kingStrategy: "adaptive", // gentle | savage | adaptive
  strategyMix: { honest: 3, loyalist: 1, opportunist: 1 },

  // --- Phase 1: the Campaign (emergent elimination tournament) ---
  players: 6, // 6 players, 5 elimination rounds, last standing is King
  campStartCoin: 10, // each player's starting war-chest
  campSpendRate: 0.55, // fraction of resources a fully-committed candidate spends/round
  campCourtShare: 0.5, // fraction of a candidate's spend that flows to others (courting)
  campNoise: 1.5, // noise on a round's support tally (the blind, fuzzy negotiation)

  // --- Phase 1/2 carry-over ---
  carriedCoinMean: 6,
  carriedCoinSpread: 4,
  carriedThreatsMean: 1.2,
  startingAssetMean: 1.5,

  // --- House edge magnitudes (tunable; fair share ~16.7% of 6) ---
  edgeRefuse: 1, // Varrochi: free demand-refusals per game
  edgeVarrochiLand: 2, // Varrochi: value of the ancestral estate she begins with
  edgeStartEstateValue: 2, // Hesse: value of the estate she begins holding
  edgeIouToCoin: 1, // Brandt: IOU->coin conversions per game
  edgeBrandtLand: 2, // Brandt: value of the factory he begins with
  edgeExtraThreat: 1, // Krael: extra starting threats
  edgeIncome: 2, // Mildegaarde: bonus income per round
  edgeExtraPromise: 1, // Ostlander: extra starting promises
  edgeOstlanderLand: 2, // Ostlander: value of the charter he begins with (the promise
  //                       alone is too weak -- it only pays on a crown win)

  // --- finite, valued grant deck ---
  grantDeck: { estate: 4, factory: 4, charter: 4 },
  landValueMin: 1,
  landValueMax: 8,

  // --- the Castle (king's win path) ---
  castleTarget: 120,
  castleVerdict: "trigger", // "outright" = completing just wins; "trigger" = it forces
  //                            a final muster (the paper victory can still topple him)
  income: 2, // low on purpose: cannot cover the Castle, so the king must seize late
  prisonUpkeep: 1,

  // --- the king's favors (demands), house to house; cost scales with progress ---
  favorMin: 1,
  favorMax: 8,
  favorJitter: 1.5,
  boughtOffFavor: 2, // favour above which a noble looks bought off (deck rationing)
  kingReserve: 3, // lands the king refuses to grant away -- his hoard for the personal
  //                 prize. Give to build vs keep to win: a bigger reserve = richer king
  //                 but a less-courted, more rebellious court.

  // --- seizure (the High Society squeeze) ---
  seizureEnabled: true,
  prisonEnabled: true,
  seizeMode: "threat", // "immediate" | "threat" (telegraphed, with a redeem window)
  seizeGrace: 2,
  seizeRedeemMult: 1, // redeem cost = the tax (pay it to keep the land)
  seizeGrievance: 3, // persistent depose-pressure while a seize-threat is live
  seizeExecGrievance: 4, // added once the land is actually taken
  landPaymentImprisons: true, // taking a land to settle a demand also jails (debtor's justice)

  // --- the rebellion MUSTER ---
  winColorProb: 0.5, // P(a noble shares the king's winning color). <0.5 => a bigger
  //                    burned bloc, more rebellion-prone (inherited from the Campaign)
  colorTilt: 1.5, // burned-color nobles lean toward joining; king's-color away
  coordination: 0.6, // 0..1 how much a noble's join is swayed by the room's mood
  iouTilt: 0.3, // how much carried threats push a noble toward joining
  musterK: 1.4, // weight on the bandwagon (read of overall discontent)
  musterNoise: 0.8, // per-noble noise on the secret commitment (the blind gamble)
  musterThreshold: 0.6, // a noble joins only if its join-score clears this bar
  declareThreshold: 0.6, // court discontent needed before a brutal push provokes a rising

  // --- scoring for the individual victor ---
  promiseVP: 2, // per promise (if the crown wins)
  threatVP: 3, // per threat (if the rebellion wins)
  rebelHeroVP: 4, // bonus for a noble who JOINED a winning rebellion
  assetVP: 1, // multiplier on own-House land value
  coinVP: 1,

  // --- backstop ---
  roundCap: 12, // if neither the Castle nor a rising ends it, a final muster is forced
};

function makeConfig(overrides = {}) {
  return Object.assign({}, DEFAULT_CONFIG, overrides);
}

module.exports = { DEFAULT_CONFIG, makeConfig };
