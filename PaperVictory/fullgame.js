// End-to-end: Campaign (Phase 1/2) -> Reign (Phase 3/4), all six players.
//
//   node fullgame.js                 # 5000 full games
//   node fullgame.js -n 20000
//   node fullgame.js --set campSpendRate=0.7
//
// The headline measurement is the doc's most important Phase-1 question:
// is being eliminated as good as taking the crown? We run the whole game and tally
// who wins overall by their CAMPAIGN elimination rank (1 = first out / best-armed
// loser ... players = the King) and by their crownDesire.

const { runCampaign } = require("./src/campaign");
const { playGame } = require("./src/engine");
const { makeConfig } = require("./src/config");

function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}
function parseArgs(argv) {
  const out = { n: 5000, sets: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n") out.n = parseInt(argv[++i], 10);
    else if (a === "--set") {
      const [k, v] = argv[++i].split("=");
      out.sets[k] = coerce(v);
    }
  }
  return out;
}

function buildInject(camp) {
  const kingP = camp.players.find((p) => p.isKing);
  const nobles = camp.players
    .filter((p) => !p.isKing)
    .map((p) => ({
      house: p.house,
      losing: p.losing,
      coin: p.coin,
      threats: p.threats,
      promises: p.promises,
      elimRank: p.elimRank,
      crownDesire: p.crownDesire,
      id: p.id,
    }));
  return { nobles, king: { elimRank: kingP.elimRank, crownDesire: kingP.crownDesire, id: kingP.id } };
}

const pct = (x, d) => ((100 * x) / d).toFixed(1) + "%";

function main() {
  const args = parseArgs(process.argv);
  const cfg = makeConfig(args.sets);
  const P = cfg.players;

  const byRank = new Array(P + 1).fill(0); // index 1..P (P = King)
  let kingSurvives = 0, rebel = 0, kingPrize = 0, noWinner = 0;
  let desireWinSum = 0, desireWinCount = 0;
  // carry-over snapshot: average coin a noble holds by elim rank, to show the gradient
  const coinByRank = new Array(P + 1).fill(0);
  const coinByRankN = new Array(P + 1).fill(0);
  const threatByRank = new Array(P + 1).fill(0);

  for (let i = 0; i < args.n; i++) {
    const seed = 1 + i;
    const camp = runCampaign(cfg, seed);
    for (const p of camp.players) {
      coinByRank[p.elimRank] += p.coin;
      coinByRankN[p.elimRank] += 1;
      threatByRank[p.elimRank] += p.threats;
    }
    const r = playGame(cfg, seed, null, buildInject(camp));
    if (r.kingSurvives) kingSurvives++; else rebel++;
    if (r.victorIsKing) kingPrize++;
    if (r.victorElimRank == null) noWinner++;
    else byRank[r.victorElimRank]++;
    if (r.victorCrownDesire != null) { desireWinSum += r.victorCrownDesire; desireWinCount++; }
  }

  const L = console.log;
  L("=".repeat(66));
  L(`  Paper Victory -- FULL GAME (Campaign -> Reign)   (${args.n} games)`);
  L(`  ${P} players, ${P - 1} campaign rounds; reign castle=${cfg.castleTarget}`);
  L("=".repeat(66));
  L(`  reign: king survives ${pct(kingSurvives, args.n)} / rebellion ${pct(rebel, args.n)}`);
  L("");
  L("  OVERALL WINNER by campaign elimination rank (fair share = " + pct(1, P) + "):");
  L("    rank 1 = first eliminated (most banked leverage) ... rank " + P + " = the King");
  for (let r = 1; r <= P; r++) {
    const tag = r === P ? "KING " : r === 1 ? "1st-out" : `${r}     `;
    const bar = "#".repeat(Math.round((100 * byRank[r]) / args.n));
    L(`    rank ${tag}  ${pct(byRank[r], args.n).padStart(6)}  ${bar}`);
  }
  if (noWinner) L(`    (no surviving winner: ${pct(noWinner, args.n)})`);
  L("");
  L(`  the King takes the overall prize ${pct(kingPrize, args.n)} of games`);
  L(`  avg crownDesire of the overall winner ${(desireWinSum / (desireWinCount || 1)).toFixed(2)}  (vs 0.50 baseline)`);
  L("    < 0.50 => banking beats chasing the crown (race-to-lose); ~0.50 => neutral");
  L("");
  L("  carry-over gradient from the campaign (avg per rank):");
  for (let r = 1; r <= P; r++) {
    const tag = r === P ? "KING " : `${r}    `;
    L(`    rank ${tag}  coin ${(coinByRank[r] / (coinByRankN[r] || 1)).toFixed(1).padStart(5)}   threats ${(threatByRank[r] / (coinByRankN[r] || 1)).toFixed(1)}`);
  }
}
main();
