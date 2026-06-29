// Runner for the "whose call do you answer" variant.
//   node calls.js               # 5000 games
//   node calls.js -n 20000
//   node calls.js --set tribute=4

const { playGame } = require("./src/engine_calls");
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
  const a = {
    n: args.n, triggers: { monument: 0, denounce: 0, backstop: 0 }, throneWon: 0, courtierWon: 0, noWinner: 0,
    paper: 0, ledgerMatch: 0, kCon: 0, pCon: 0, tribute: 0, gifts: 0, earlyGift: 0, lateGift: 0, bothShort: 0,
    denounced: 0, denouncerDied: 0,
  };
  for (let i = 0; i < args.n; i++) {
    const r = playGame(cfg, 1 + i);
    a.triggers[r.trigger] = (a.triggers[r.trigger] || 0) + 1;
    if (r.throneWon) a.throneWon++;
    else if (r.winnerRole === "courtier") a.courtierWon++;
    else a.noWinner++;
    if (r.paperVictory) a.paper++;
    if (r.denounced) a.denounced++;
    if (r.denouncerDied) a.denouncerDied++;
    if (r.ledgerMatch) a.ledgerMatch++;
    a.kCon += r.kingConstruction; a.pCon += r.popeConstruction;
    a.tribute += r.tributePaid; a.gifts += r.giftsGiven;
    a.earlyGift += r.earlyGiftFrac; a.lateGift += r.lateGiftFrac;
    if (r.kingConstruction < cfg.monumentCost && r.popeConstruction < cfg.monumentCost) a.bothShort++;
  }
  const L = console.log;
  L("=".repeat(64));
  L(`  Paper Victory -- WHOSE CALL DO YOU ANSWER   (${a.n} games)`);
  L(`  players=${cfg.players}  monument=${cfg.monumentCost}  gift=${cfg.giftValue} tribute=${cfg.tribute}`);
  L("=".repeat(64));
  L(`  ends by: HOUSES call a denounce ${pct(a.triggers.denounce, a.n)} / monument ${pct(a.triggers.monument, a.n)} / backstop ${pct(a.triggers.backstop, a.n)}`);
  L(`  *** PAPER VICTORY (called the count / built the monument -- then executed)  ${pct(a.paper, a.n)}`);
  L(`  of denounces, the caller was baited to his own death ${pct(a.denouncerDied, a.denounced || 1)}`);
  L("  --- do the thrones struggle to fund? ---");
  L(`  neither monument finished (both fell short)  ${pct(a.bothShort, a.n)}`);
  L(`  avg final construction: King ${(a.kCon / a.n).toFixed(1)} / Pope ${(a.pCon / a.n).toFixed(1)}  (of ${cfg.monumentCost})`);
  L(`  total tribute raised ${(a.tribute / a.n).toFixed(1)}/game vs gifts spent ${(a.gifts / a.n).toFixed(1)}/game`);
  L("  --- the generosity -> brutality arc ---");
  L(`  share of calls that are GIFTS:  early ${pct(a.earlyGift / a.n, 1)}  ->  late ${pct(a.lateGift / a.n, 1)}`);
  L("    (want high early, low late -- court first, coerce when behind)");
  L("  --- who wins? (the paper-king check) ---");
  L(`  a THRONE wins ${pct(a.throneWon, a.n)}   a COURTIER wins ${pct(a.courtierWon, a.n)}   (no winner ${pct(a.noWinner, a.n)})`);
  L(`  public ledger predicts the secret legit throne ${pct(a.ledgerMatch, a.n)}`);
}
main();
