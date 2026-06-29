// Paper Victory (the BASE game): King vs Pope two-throne schism.
// Faithful to rulebook v0.1. Every number is a playtest default (PD).

const DEFAULT_CONFIG = {
  players: 6, // 1 King + 1 Pope + 4 Courtiers (Houses)
  startCoin: 5,
  income: 2,
  startVitality: 5,
  monumentCost: 15,

  // favors: tier -> { reward, brand (public favor), fine (refusal cost) }
  favor: {
    token: { reward: 1, brand: 1, fine: 1 },
    committing: { reward: 3, brand: 2, fine: 2 },
    branding: { reward: 5, brand: 3, fine: 3 }, // accept => insert a Chalice into the deck
  },

  // each throne's starting deck (action cards only; courtiers poison it with Chalice)
  deck: { LEVY: 3, FAVOR_token: 3, FAVOR_committing: 2, FAVOR_branding: 2, INDULGENCE: 1, DENOUNCE: 1, MEDDLE: 2 },

  chaliceHand: { plus: 3, minus: 3 }, // each courtier's private +1/-1 hand
  ostlanderExtraChalice: 1, // Ostlander holds 4/4

  fineMult: 1, // global multiplier on refusal Fines (sweep this to test the key knob)
  denounceCost: 4,
  denounceMinVitality: 3,

  levyPerCourtier: 1,
  indulgenceCost: 2, // coin to place a public-favor brand on a target

  // --- bot read / behavior ---
  predictNoise: 0.8, // per-player noise reading which throne will be legitimate
  convSelfBiasThrone: 0.8, // a throne mostly banks conviction toward itself
  denounceConfidence: 0.4, // pressure a throne needs before it dares DENOUNCE
  denounceMinRound: 3, // no calling the question in the opening rounds -- the whispers
  //                      must be earned across a few rounds of public positioning first

  // --- secret messages: courtiers privately urge a throne to DENOUNCE (or hold) ---
  // A courtier who is WINNING wants the reckoning now, so it whispers "denounce" to
  // both thrones -- honest help to the leader, a lethal bait to the throne that is
  // behind. The throne must decide whom to believe:
  //   trustMode "public" = trust an adviser in proportion to their PUBLIC loyalty to
  //                        you (a baiter must first kneel to you -- and then dies with
  //                        you in the purge). trustMode "naive" = believe every whisper
  //                        equally (the baiters, who are the winning majority, win).
  messagesEnabled: true,
  trustMode: "public", // "public" | "naive"
  convLoyalty: 0.75, // a courtier banks toward its TRUE loyalty this often, else hedges
  //                    toward the side it reads winning
  feintTendency: 0.4, // a courtier loyal to the side it reads LOSING will publicly lean
  //                    the winner this often (a survival feint) -- the gap between the
  //                    public ledger and the secret vote, and what messages exploit

  // backstop
  reshuffleCap: 2, // reckoning forced after a deck is reshuffled this many times
  roundCap: 14,

  // --- "whose call do you answer" variant (engine_calls.js) ---
  // Each round both thrones CALL; a courtier answers ONE. A gift call pays the
  // courtier (and brands them); a demand call taxes them into the monument (and
  // brands them harder). Two thrones競 for one scarce pool of answers, so both
  // struggle to fund -- and each drifts from gifting (courtship) to demanding
  // (coercion) as its monument falls behind.
  throneTreasury: 14, // a throne's chest for gifting
  giftValue: 3, // coin a gift call hands the courtier
  tribute: 3, // coin a demand call takes for the monument
  brandAnswer: 1, // public favor for answering a throne's call at all
  brandTribute: 1, // extra favor for paying tribute (you served, visibly)
  callsExpectedRounds: 9, // pace a throne expects to finish by (sets gift-vs-demand)
  allegianceBias: 0.8, // pull to answer the throne you are truly loyal to
  survivalBias: 1.6, // pull to answer the throne you must look loyal to (the winner)
  answerNoise: 1.2,

  // --- estates variant (engine_estates.js): two finite treasuries + class scoring ---
  classMix: { farmer: 1, banker: 1, merchant: 2 }, // the 4 courtiers' classes
  throneStock: 30, // each throne's hoard of its own currency (land / jewels)
  throneReserve: 10, // it keeps this much to score; gifts the rest to court
  appetiteWeight: 3, // how strongly a class is pulled to the throne whose currency it craves
  loserDevalue: 0.34, // the losing throne's currency is worth this fraction at the end
  merchantMult: 2, // merchant bonus = this * min(land, jewels) -- rewards balance
  specialistBonus: 0.5, // farmer/banker bonus on their own currency (+50%)

  // --- crises (the shit sandwiches): a shared threat the table must fund, or bleed ---
  // type land|money|both; cost = coin to avert; bite = fraction of the threatened
  // holdings lost if fully unfunded (loss is proportional to what you hold, so it
  // guts the threatened class and scratches the others -- pure rival-targeting).
  crisisChance: 0.6, // chance a crisis surfaces each round
  crisisContribScale: 0.8, // how hard the threatened pay (vs free-ride)
  crisisDeck: [
    { name: "the Mongols invade", type: "land", cost: 12, bite: 0.5 },
    { name: "a run on the papal bank", type: "money", cost: 12, bite: 0.5 },
    { name: "a failed harvest", type: "land", cost: 6, bite: 0.3 },
    { name: "a simony scandal", type: "money", cost: 6, bite: 0.3 },
    { name: "the plague", type: "both", cost: 8, bite: 0.3 },
    { name: "a trip on the sidewalk", type: "land", cost: 1, bite: 0.05 },
  ],
};

function makeConfig(overrides = {}) {
  return Object.assign({}, DEFAULT_CONFIG, overrides);
}
module.exports = { DEFAULT_CONFIG, makeConfig };
