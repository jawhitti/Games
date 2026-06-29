// Monte Carlo for Paper Victory (base / King vs Pope).
//   node batch.js
//   node batch.js -n 20000
//   node batch.js --sweep            # sweep the Fine -- the designer's #1 question
//   node batch.js --set monumentCost=20

const { playGame } = require("./src/engine");
const { makeConfig } = require("./src/config");

function coerce(v) { if (v === "true") return true; if (v === "false") return false; const n = Number(v); return Number.isNaN(n) ? v : n; }
function parseArgs(argv) {
  const out = { n: 5000, sweep: false, sets: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n") out.n = parseInt(argv[++i], 10);
    else if (a === "--sweep") out.sweep = true;
    else if (a === "--set") { const [k, v] = argv[++i].split("="); out.sets[k] = coerce(v); }
  }
  return out;
}
const pct = (x, d) => ((100 * x) / d).toFixed(1) + "%";

function run(cfg, n, base = 1) {
  const a = {
    n, triggers: { monument: 0, vitality: 0, denounce: 0, backstop: 0 },
    throneWon: 0, kingWon: 0, popeWon: 0, courtierWon: 0, noWinner: 0,
    paper: 0, ledgerMatch: 0, purged: 0, legitSurvived: 0,
    denounced: 0, denouncerDied: 0,
  };
  for (let i = 0; i < n; i++) {
    const r = playGame(cfg, base + i);
    a.triggers[r.trigger]++;
    if (r.throneWon) a.throneWon++;
    if (r.winnerRole === "king") a.kingWon++;
    else if (r.winnerRole === "pope") a.popeWon++;
    else if (r.winnerRole === "courtier") a.courtierWon++;
    else a.noWinner++;
    if (r.paperVictory) a.paper++;
    if (r.denounced) a.denounced++;
    if (r.denouncerDied) a.denouncerDied++;
    if (r.ledgerMatch) a.ledgerMatch++;
    a.purged += r.purged;
    if (r.legitThroneSurvived) a.legitSurvived++;
  }
  return a;
}

function report(label, cfg, a) {
  const L = console.log;
  L("=".repeat(64));
  L(`  ${label}   (${a.n} games)`);
  L(`  players=${cfg.players}  monument=${cfg.monumentCost}  vitality=${cfg.startVitality}  fineMult=${cfg.fineMult}`);
  L("=".repeat(64));
  L(`  ends by: monument ${pct(a.triggers.monument, a.n)} / vitality ${pct(a.triggers.vitality, a.n)} / denounce ${pct(a.triggers.denounce, a.n)} / backstop ${pct(a.triggers.backstop, a.n)}`);
  L(`  *** PAPER VICTORY (completed the monument, then executed)  ${pct(a.paper, a.n)}`);
  L("  --- who wins? ---");
  L(`  a THRONE wins ${pct(a.throneWon, a.n)}  (king ${pct(a.kingWon, a.n)}, pope ${pct(a.popeWon, a.n)})`);
  L(`  a COURTIER wins ${pct(a.courtierWon, a.n)}   (no winner ${pct(a.noWinner, a.n)})`);
  L(`  legit throne's player survives the purge ${pct(a.legitSurvived, a.n)}`);
  L("  --- secret messages: sword or noose? ---");
  L(`  a throne DENOUNCED ${pct(a.denounced, a.n)}  of which the denouncer DIED for it ${pct(a.denouncerDied, a.denounced || 1)}`);
  L(`  avg purged per game ${(a.purged / a.n).toFixed(2)} of ${cfg.players}`);
  L("  --- the designer's #1 question ---");
  L(`  public ledger predicts the secret legit throne ${pct(a.ledgerMatch, a.n)}`);
  L(`    (~50% = the ledger is noise, purge feels arbitrary; ~100% = the king can read`);
  L(`     his fate from the visible board, the game goes flat)`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.sweep) {
    console.log("\nFINE SWEEP -- does the public ledger leak the secret vote?\n");
    for (const fm of [0, 0.5, 1, 2, 4]) {
      const cfg = makeConfig({ ...args.sets, fineMult: fm });
      report(`fineMult = ${fm}`, cfg, run(cfg, args.n));
    }
    return;
  }
  const cfg = makeConfig(args.sets);
  report("Paper Victory -- King vs Pope", cfg, run(cfg, args.n));
}
main();
