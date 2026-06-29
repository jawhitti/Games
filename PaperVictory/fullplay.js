// Narrate one FULL game as a saga: Campaign -> Coronation -> Reign -> Muster.
//
//   node fullplay.js --seed 42
//   node fullplay.js --find runnerup   # the runner-up takes the whole game
//   node fullplay.js --find kingwins   # the king holds the throne AND the prize
//   node fullplay.js --find paper      # completes the Castle, the court rises, he falls
//   node fullplay.js --find firstout   # the first lord eliminated wins it all
//   node fullplay.js --set campSpendRate=0.7

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
  const out = { seed: null, find: null, scan: 30000, sets: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") out.seed = parseInt(argv[++i], 10);
    else if (a === "--find") out.find = argv[++i];
    else if (a === "--scan") out.scan = parseInt(argv[++i], 10);
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
      house: p.house, losing: p.losing, coin: p.coin, threats: p.threats,
      promises: p.promises, elimRank: p.elimRank, crownDesire: p.crownDesire, id: p.id,
    }));
  return { nobles, king: { elimRank: kingP.elimRank, crownDesire: kingP.crownDesire, id: kingP.id } };
}

function run(cfg, seed, rec) {
  const camp = runCampaign(cfg, seed, rec);
  return playGame(cfg, seed, rec, buildInject(camp));
}

function moments(cfg) {
  return {
    runnerup: (r) => r.victorElimRank === cfg.players - 1,
    firstout: (r) => r.victorElimRank === 1,
    kingwins: (r) => r.victorIsKing,
    paper: (r) => r.paperVictory,
  };
}

function tell(cfg, seed) {
  const rec = [];
  const r = run(cfg, seed, rec);
  console.log(`\n############ FULL GAME, SEED ${seed} ############`);
  console.log(rec.join("\n"));
  const who = r.victorIsKing
    ? "the KING"
    : r.victorHouse === "none"
    ? "no one"
    : `${r.victorHouse} (campaign rank ${r.victorElimRank} of ${cfg.players})`;
  console.log(`\n  OVERALL WINNER: ${who}.`);
}

function main() {
  const args = parseArgs(process.argv);
  const cfg = makeConfig(args.sets);
  if (args.seed != null) return tell(cfg, args.seed);

  const test = moments(cfg)[args.find];
  if (!test) {
    console.log("Usage: node fullplay.js --seed N | --find <" + Object.keys(moments(cfg)).join("|") + ">");
    return;
  }
  for (let seed = 1; seed <= args.scan; seed++) {
    if (test(run(cfg, seed))) {
      console.log(`(found "${args.find}" at seed ${seed})`);
      return tell(cfg, seed);
    }
  }
  console.log(`No "${args.find}" in ${args.scan} seeds.`);
}
main();
