// Monte Carlo runner for Paper Victory: The Reign (muster model).
//
//   node batch.js                 # default config, 5000 games
//   node batch.js -n 20000
//   node batch.js --set winColorProb=0.3 --set kingStrategy=savage

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

function runBatch(cfg, n, baseSeed = 1) {
  const a = {
    n, kingSurvives: 0, rebelWon: 0, paperVictory: 0,
    triggers: { castle: 0, declared: 0, cap: 0 },
    rounds: 0, musters: 0, crushed: 0,
    landGrabs: 0, early: 0, late: 0, imprison: 0,
    houseWins: { farmer: 0, manufacturer: 0, banker: 0, king: 0, none: 0 },
    byName: {}, grantsGiven: 0, grantsDenied: 0,
    frontAlive: 0, frontWon: 0,
  };
  for (let i = 0; i < n; i++) {
    const r = playGame(cfg, baseSeed + i);
    if (r.kingSurvives) a.kingSurvives++; else a.rebelWon++;
    if (r.paperVictory) a.paperVictory++;
    a.triggers[r.trigger]++;
    a.rounds += r.round;
    a.musters += r.musters;
    a.crushed += r.crushed;
    a.landGrabs += r.seizes + r.seizesExecuted;
    a.early += r.earlySeizes;
    a.late += r.lateSeizes;
    a.imprison += r.imprisonments;
    a.houseWins[r.victorKind] = (a.houseWins[r.victorKind] || 0) + 1;
    a.byName[r.victorHouse] = (a.byName[r.victorHouse] || 0) + 1;
    a.grantsGiven += r.grantsGiven;
    a.grantsDenied += r.grantsDenied;
    if (r.frontrunnerAlive) a.frontAlive++;
    if (r.frontrunnerWon) a.frontWon++;
  }
  return a;
}

const pct = (x, d) => ((100 * x) / d).toFixed(1) + "%";

function report(cfg, a) {
  const L = console.log;
  L("=".repeat(64));
  L(`  Paper Victory: The Reign (muster)   (${a.n} games)`);
  L(`  king=${cfg.kingStrategy}  castle=${cfg.castleTarget}/${cfg.castleVerdict}  winColor=${cfg.winColorProb}`);
  L("=".repeat(64));
  L(`  king survives             ${pct(a.kingSurvives, a.n)}`);
  L(`  rebellion succeeds        ${pct(a.rebelWon, a.n)}`);
  L(`  *** PAPER VICTORY (castle done, king falls)  ${pct(a.paperVictory, a.n)}` +
    (a.triggers.castle ? `  = ${pct(a.paperVictory, a.triggers.castle)} of completed castles` : ""));
  L(`  avg rounds                ${(a.rounds / a.n).toFixed(1)} (cap ${cfg.roundCap})`);
  L(`  ending: castle / declared-rising / forced-at-cap   ${pct(a.triggers.castle, a.n)} / ${pct(a.triggers.declared, a.n)} / ${pct(a.triggers.cap, a.n)}`);
  L(`  risings declared ${(a.musters / a.n).toFixed(2)}/game, of which crushed ${(a.crushed / a.n).toFixed(2)}/game`);
  L("  --- the generosity->brutality arc ---");
  L(`  land-grabs ${(a.landGrabs / a.n).toFixed(2)}/game  (early ${(a.early / a.n).toFixed(2)} vs late ${(a.late / a.n).toFixed(2)})`);
  L(`  imprisonments ${(a.imprison / a.n).toFixed(2)}/game   grants ${(a.grantsGiven / a.n).toFixed(1)}/game (deck-dry denials ${pct(a.grantsDenied, a.grantsGiven + a.grantsDenied || 1)})`);
  L("  --- individual victor (the win distribution) ---");
  const h = a.houseWins;
  L(`  by kind: farmer ${pct(h.farmer, a.n)}  manufacturer ${pct(h.manufacturer, a.n)}  banker ${pct(h.banker, a.n)}  king ${pct(h.king, a.n)}`);
  const nobleWins = a.n - (h.king || 0) - (a.byName.none || 0);
  const names = ["Varrochi", "Hesse", "Brandt", "Krael", "Mildegaarde", "Ostlander"];
  L("  by House (noble victories only, fair=16.7%):");
  L("  " + names.map((nm) => `${nm} ${pct(a.byName[nm] || 0, nobleWins || 1)}`).join("  "));
  L("  --- wealth a target? ---");
  L(`  frontrunner survives ${pct(a.frontAlive, a.n)}   in winning side ${pct(a.frontWon, a.n)}`);
}

function main() {
  const args = parseArgs(process.argv);
  const cfg = makeConfig(args.sets);
  report(cfg, runBatch(cfg, args.n));
}
main();
