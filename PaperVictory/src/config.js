// Provisional rulings for every Open Question, exposed as knobs.
// Defaults are playtest-defaults (PD); none of these are settled design.
// The point of the simulator is to vary them and watch what breaks.

const DEFAULT_CONFIG = {
  // --- table shape ---
  nobles: 6, // nobles besides the king (so 7 seats total)
  kingStrategy: "adaptive", // gentle | savage | adaptive

  // --- noble strategy mix (counts; padded/truncated to `nobles`) ---
  // honest      : lean follows favor-minus-resentment, flag follows fear
  // loyalist    : strongly favor-weighted, tends Crown
  // opportunist : leans toward whoever looks like winning
  // safeFlagBetrayer : ALWAYS keeps a grant (flies Crown) but ALWAYS depose.
  //                    This bot exists to detect the Q3 safe-flag degeneracy.
  strategyMix: { honest: 3, loyalist: 1, opportunist: 1, safeFlagBetrayer: 1 },

  // --- Q6: strength of leverage carried in from Phase 1/2 ---
  carriedCoinMean: 6,
  carriedCoinSpread: 4,
  carriedThreatsMean: 1.2, // avg carried threats per noble (rebellion anchors)
  startingAssetMean: 1.5, // avg granted/owned assets at reign start

  // --- the Castle (king victory) ---
  castleTarget: 28, // total value the king must bank to finish
  castleVerdict: "trigger", // Q4: "outright" = finishing just wins;
  //                               "trigger"  = finishing only forces the count
  taxBase: 2, // base coin demanded per demand
  income: 2, // coin each non-imprisoned noble earns per round
  prisonUpkeep: 1, // coin/turn the king pays per prisoner (PD)

  // --- royal levers (A/B switches to test whether they matter) ---
  seizureEnabled: true,
  prisonEnabled: true,
  // seizeMode: "immediate" = take the asset the turn a debtor cannot pay (old rule).
  //            "threat"    = issue a THREAT to seize now; actually seize a later turn
  //                          unless the noble pays it down in the grace window.
  // The threat-to-seize is a live grievance that does NOT decay and arms the noble
  // (it is itself a threat token -> VP if the king falls). This is the experimental
  // rule and the candidate non-decaying lean driver.
  seizeMode: "threat",
  seizeGrace: 2, // turns from threat to earliest execution (the pay-down window)
  seizeRedeemMult: 1, // coin to pay down a seize-threat, as a multiple of the demand.
  //                     1 = cheap (redeem ~ the missed tax); higher = the land is
  //                     dear, few can redeem, most seizures execute. This number
  //                     flips whether the telegraphed rule helps king or rebellion.
  seizeGrievance: 3, // persistent depose-pressure while a seize-threat is live
  seizeExecGrievance: 4, // additional permanent grievance once actually seized

  // --- Q2: how Leans move ---
  // leanModel: "strategic" = a noble flips toward the side it BELIEVES will win
  //              (losing faction is purged -> back the winner), reading the count
  //              from public signals it can see. This is the corrected model.
  //            "grudge"    = the old thermostat (flip when resentment > favor).
  //              Kept only to show it manufactures the ~50% tie artifact.
  leanModel: "strategic",
  leanChangeCost: 0, // coin a noble pays to flip its secret lean (0 = free)
  leanInertia: 0.25, // resistance to flipping; higher = stickier leans
  leanNoise: 0.15, // random wobble in the (grudge-model) read

  // strategic-model signal weights: how a noble GUESSES who is winning.
  leanSignalCastle: 2.0, // weight on castle progress (king looks strong as it rises)
  leanSignalFlags: 1.5, // weight on the visible crown/rebellion flag split
  leanReadK: 2.0, // logistic steepness of the win-probability read
  leanReadNoise: 0.8, // per-noble noise on the read (leans are secret -> guessing)
  iouTilt: 0.3, // how much a noble's own promises/threats tilt its choice

  // --- public COLOR bloc (the rebellion's coordination nucleus) ---
  // After the Coronation colors are face-up. Losing-color nobles (those who
  // backed the wrong color) are a VISIBLE bloc and the natural opposition.
  winColorProb: 0.5, // P(a noble shares the king's winning color). <0.5 => the
  //                     burned losing bloc tends to be a majority (rebellion-prone).
  colorTilt: 1.5, // baseline lean tilt from color (losing->depose, winning->survive)
  coordination: 0.6, // 0..1 how well the losing bloc reads/acts as one (table-talk
  //                     proxy). 0 = atomized (no rebellion ever); 1 = perfect bloc.
  urgencyWeight: 2.5, // "now or never": how hard imminent Castle completion rallies
  //                      the losing bloc to commit and call before it is too late.
  boughtOffFavor: 2, // favour above which a losing-color noble looks bought off
  //                     (visibly defected from the bloc, shrinking it)

  // --- a REASON to throw up the rebel flag ---
  // Flying rebel must pay, or no one commits and the bloc never becomes visible.
  taxReliefTilt: 1.2, // standing pull to rebel: a rebel-flagger REFUSES the king's
  //                     demands -> keeps coin, denies the Castle. The concrete now-payoff.
  rebelHeroVP: 4, // bonus at the reckoning for a rebel-flag SURVIVOR if the king falls
  //                 (the resistance-hero reward for public defiance).
  purgeFearRebel: 1.2, // standing pull back to crown: fear of the purge if the flag
  //                      you fly turns out to be the king's lethal color.
  flagInertia: 0.6, // hysteresis so public flags do not jitter round to round

  // --- the AMBUSH (a reason to NOT throw up the flag) ---
  // A noble who secretly leans depose may stay crown-flagged: lie in wait, keep
  // paying tax (funding the Castle that will doom him), never provoke the king's
  // attack, and cast the deposing vote only at the reckoning. High ambushTilt
  // produces the "king completes his Castle and loses the vote" paper victory.
  ambushTilt: 1.6,

  // --- Q3 / Q7: is "safe flag" a blind guess? ---
  mandateMisalignProb: 0.5, // ACTUAL chance the king's lethal color != his public
  //                            face (crown). 1.0 = he always kills crown-flaggers;
  //                            0.0 = he always kills rebels (crown truly safe).
  perceivedMisalign: 0.5, // what nobles BELIEVE that chance is. At 0.5 neither flag
  //                          is safe (the blind guess). Low = naive "crown is safe"
  //                          play (which a misaligned king then slaughters).

  // --- Q4 reckoning resolution ---
  tieRule: "crown", // crown = incumbent holds on a tie

  // --- rebellion call ---
  callerConfidence: 0.15, // how favorable a rebel's (noisy) read must look
  //                          before they call the reckoning. Lower = trigger-happy.
  callNoise: 1.2, // noise on a caller's estimate of rebellion strength

  // --- king attacks the rebellion (the forced-gamble trigger) ---
  // The king may strike a rebel flag at any time to put it down -- but the attack
  // TRIGGERS the reckoning, which he might lose. He decides from VISIBLE flags; the
  // count is on SECRET leans, so an overconfident king walks into the hidden knife.
  kingAttackEnabled: true,
  kingAttackConfidence: 0.18, // visible edge the king needs before he dares attack
  attackReadNoise: 0.5, // noise on the king's read of the room
  attackThreshold: 0.25, // visible rebel fraction below which the king ignores it and
  //                        just builds (a calm court invites the paper victory)
  buildCommit: 0.7, // once the Castle is this far along, the king lays the last stones
  //                   rather than attack -- he believes completion is his win. The trap.

  // --- Q5: stall backstop ---
  roundCap: 12, // forced reckoning if neither trigger fires by here
  stallDefault: "count", // on cap: "count" (resolve as-is) | "crown" | "rebellion"

  // --- scoring weights for the individual victor ---
  promiseVP: 2, // VP per promise collected (if Crown won)
  threatVP: 3, // VP per carried threat flipped (if Rebellion won)
  assetVP: 2, // VP per unit of own-House asset
  coinVP: 1, // VP per coin
};

function makeConfig(overrides = {}) {
  return Object.assign({}, DEFAULT_CONFIG, overrides);
}

module.exports = { DEFAULT_CONFIG, makeConfig };
