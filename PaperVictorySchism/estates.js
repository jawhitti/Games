// Runner for the estates variant. Tests two things:
//  1) do the classes DIVERGE (farmers court the King, bankers the Pope)?  -- bandwagon dead?
//  2) do the five seats win about EQUALLY?
//   node estates.js            node estates.js -n 20000 --set loserDevalue=0.5

const { playGame } = require("./src/engine_estates");
const { makeConfig } = require("./src/config");

function coerce(v) { if (v === "true") return true; if (v === "false") return false; const n = Number(v); return Number.isNaN(n) ? v : n; }
function parseArgs(argv) {
  const out = { n: 5000, sets: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n") out.n = parseInt(argv[++i], 10);
    else if (a === "--set") { const [k, v] = argv[++i].split("="); out.sets[k] = coerce(v); }
  }
  return out;
}
const pct = (x, d) => ((100 * x) / d).toFixed(1) + "%";

function main() {
  const args = parseArgs(process.argv);
  const cfg = makeConfig(args.sets);
  const wins = { king: 0, pope: 0, farmer: 0, banker: 0, merchant: 0, none: 0 };
  const ans = { farmer: { crown: 0, mitre: 0 }, banker: { crown: 0, mitre: 0 }, merchant: { crown: 0, mitre: 0 } };
  for (let i = 0; i < args.n; i++) {
    const r = playGame(cfg, 1 + i);
    wins[r.winnerSeat] = (wins[r.winnerSeat] || 0) + 1;
    for (const k of ["farmer", "banker", "merchant"]) { ans[k].crown += r.answers[k].crown; ans[k].mitre += r.answers[k].mitre; }
  }
  const L = console.log;
  L("=".repeat(64));
  L(`  Paper Victory -- ESTATES (land/jewels, class scoring)   (${args.n} games)`);
  L(`  classMix=${JSON.stringify(cfg.classMix)}  stock=${cfg.throneStock} reserve=${cfg.throneReserve} loserDevalue=${cfg.loserDevalue}`);
  L("=".repeat(64));
  L("  1) Do the classes DIVERGE? (share of each class's calls answered to the KING)");
  for (const k of ["farmer", "banker", "merchant"]) {
    const tot = ans[k].crown + ans[k].mitre || 1;
    L(`     ${k.padEnd(9)} -> King ${pct(ans[k].crown, tot)} / Pope ${pct(ans[k].mitre, tot)}`);
  }
  L("     (want farmers high-King, bankers high-Pope, merchants ~even -- not all the same)");
  L("  2) Do the seats win about EQUALLY? (fair = 16.7% each)");
  for (const s of ["king", "pope", "farmer", "banker", "merchant"]) L(`     ${s.padEnd(9)} ${pct(wins[s] || 0, args.n)}`);
  if (wins.none) L(`     (no winner ${pct(wins.none, args.n)})`);
}
main();
