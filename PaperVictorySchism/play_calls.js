// Tell one whole saga of the court (the "whose call" variant).
//   node play_calls.js --seed 7
//   node play_calls.js --find judas    # a courtier wins on the gold of the side he betrayed
//   node play_calls.js --find paper    # a throne finishes its monument and is denounced on it
//   node play_calls.js --find kingwins # a throne actually holds and wins
//   node play_calls.js --set monumentCost=22

const { playGame } = require("./src/engine_calls");
const { makeConfig } = require("./src/config");

function coerce(v) { if (v === "true") return true; if (v === "false") return false; const n = Number(v); return Number.isNaN(n) ? v : n; }
function parseArgs(argv) {
  const out = { seed: null, find: null, scan: 30000, sets: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") out.seed = parseInt(argv[++i], 10);
    else if (a === "--find") out.find = argv[++i];
    else if (a === "--scan") out.scan = parseInt(argv[++i], 10);
    else if (a === "--set") { const [k, v] = argv[++i].split("="); out.sets[k] = coerce(v); }
  }
  return out;
}

const MOMENTS = {
  paper: (r) => r.paperVictory,
  kingwins: (r) => r.throneWon,
  judas: (r) => r.winnerRole === "courtier" && r.winner && r.winner.answered &&
    r.winner.answered[r.legit === "crown" ? "mitre" : "crown"] > r.winner.answered[r.legit],
};

function tell(cfg, seed) {
  const rec = [];
  playGame(cfg, seed, rec);
  console.log(`\n############ SEED ${seed} ############`);
  console.log(rec.join("\n"));
}

function main() {
  const args = parseArgs(process.argv);
  const cfg = makeConfig(args.sets);
  if (args.seed != null) return tell(cfg, args.seed);
  const test = MOMENTS[args.find];
  if (!test) { console.log("Usage: node play_calls.js --seed N | --find <" + Object.keys(MOMENTS).join("|") + ">"); return; }
  for (let seed = 1; seed <= args.scan; seed++) {
    if (test(playGame(cfg, seed))) { console.log(`(found "${args.find}" at seed ${seed})`); return tell(cfg, seed); }
  }
  console.log(`No "${args.find}" in ${args.scan} seeds.`);
}
main();
