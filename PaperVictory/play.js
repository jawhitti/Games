// Narrate a single reign as a story.
//
//   node play.js --seed 42                 # tell the story of seed 42
//   node play.js --find paper              # find + tell the first PAPER VICTORY
//   node play.js --find attackloss         # king attacks and loses (the hidden knife)
//   node play.js --find selfpurge          # misaligned king culls his own backers and falls
//   node play.js --find upset              # rebellion wins on the tiebreak
//   node play.js --find paper --scan 50000 # widen the search
//
// Add --set key=value (same as batch.js) to narrate under altered rules.

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

const MOMENTS = {
  paper: (r) => r.trigger === "castle" && !r.kingSurvives,
  attackloss: (r) => r.kingAttacked && !r.kingSurvives,
  selfpurge: (r) => r.kingMisaligned && !r.kingSurvives && r.trigger !== "stall",
  upset: (r) => !r.kingSurvives && r.tie,
  outright: (r) => r.trigger === "castle" && r.kingSurvives,
};

function tell(cfg, seed) {
  const rec = [];
  const r = playGame(cfg, seed, rec);
  console.log(`\n############ SEED ${seed} ############`);
  console.log(rec.join("\n"));
  console.log(
    `\nOutcome: ${r.kingSurvives ? "King survives" : "KING DEPOSED"} ` +
      `(trigger: ${r.trigger}${r.tie ? ", on the tiebreak" : ""}). ` +
      `Mandate was ${r.kingMisaligned ? "MISALIGNED" : "aligned"}.`
  );
}

function main() {
  const args = parseArgs(process.argv);
  const cfg = makeConfig(args.sets);

  if (args.seed != null) {
    tell(cfg, args.seed);
    return;
  }

  const test = MOMENTS[args.find];
  if (!test) {
    console.log(
      "Usage: node play.js --seed N  |  --find <" + Object.keys(MOMENTS).join("|") + ">"
    );
    return;
  }
  for (let seed = 1; seed <= args.scan; seed++) {
    const r = playGame(cfg, seed); // cheap pass, no recorder
    if (test(r)) {
      console.log(`(found "${args.find}" at seed ${seed} after scanning ${seed})`);
      tell(cfg, seed);
      return;
    }
  }
  console.log(`No "${args.find}" found in ${args.scan} seeds.`);
}

main();
