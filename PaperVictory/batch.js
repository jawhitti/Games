// Monte Carlo runner for Paper Victory: The Reign (second half).
//
//   node batch.js                  # default config, 5000 games
//   node batch.js -n 20000         # more games
//   node batch.js --set castleVerdict=outright --set kingStrategy=savage
//   node batch.js --sweep          # run the built-in degeneracy sweep
//
// Output is a balance report aimed at the five design worries in the critique.

const { playGame } = require("./src/engine");
const { makeConfig, DEFAULT_CONFIG } = require("./src/config");

function parseArgs(argv) {
  const out = { n: 5000, sweep: false, sets: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n") out.n = parseInt(argv[++i], 10);
    else if (a === "--sweep") out.sweep = true;
    else if (a === "--set") {
      const [k, v] = argv[++i].split("=");
      out.sets[k] = coerce(v);
    }
  }
  return out;
}

function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  const num = Number(v);
  return Number.isNaN(num) ? v : num;
}

function runBatch(cfg, n, baseSeed = 1) {
  const agg = {
    n,
    kingSurvives: 0,
    kingOutright: 0,
    rebellionWins: 0,
    ties: 0,
    triggers: { castle: 0, rebellion: 0, attack: 0, stall: 0 },
    rounds: 0,
    attacks: 0,
    attackWins: 0, // king attacked AND won
    attackLoss: 0, // king attacked AND lost (walked into the hidden knife)
    misaligned: 0,
    misalignSurv: 0,
    paperVictory: 0, // castle COMPLETED but king loses the vote (the moment)
    houseWins: { farmer: 0, manufacturer: 0, banker: 0, king: 0, none: 0 },
    houseByName: {},
    grantsGiven: 0,
    grantsDenied: 0,
    anySeize: 0,
    anyPrison: 0,
    seizeTotal: 0,
    prisonTotal: 0,
    threatTotal: 0,
    execTotal: 0,
    paidTotal: 0,
    earlySeizeTotal: 0,
    lateSeizeTotal: 0,
    // lever usage among kings who SURVIVE (do winners ever pull them?)
    survSeize: 0,
    survPrison: 0,
    survCount: 0,
    // Q3 degeneracy: did safe-flag-betrayers land in the winning faction?
    betrayerSeats: 0,
    betrayerWins: 0,
    frontrunnerWon: 0,
    frontrunnerAlive: 0,
  };
  for (let i = 0; i < n; i++) {
    const r = playGame(cfg, baseSeed + i);
    if (r.kingSurvives) agg.kingSurvives++;
    else agg.rebellionWins++;
    if (r.kingOutright) agg.kingOutright++;
    if (r.tie) agg.ties++;
    agg.triggers[r.trigger]++;
    agg.rounds += r.round;
    if (r.kingAttacked) {
      agg.attacks++;
      if (r.kingSurvives) agg.attackWins++;
      else agg.attackLoss++;
    }
    if (r.kingMisaligned) {
      agg.misaligned++;
      if (r.kingSurvives) agg.misalignSurv++;
    }
    if (r.trigger === "castle" && !r.kingSurvives) agg.paperVictory++;
    agg.houseWins[r.victorKind] = (agg.houseWins[r.victorKind] || 0) + 1;
    agg.houseByName[r.victorHouse] = (agg.houseByName[r.victorHouse] || 0) + 1;
    agg.grantsGiven += r.grantsGiven;
    agg.grantsDenied += r.grantsDenied;
    if (r.seizes > 0 || r.seizesExecuted > 0) agg.anySeize++;
    if (r.imprisonments > 0) agg.anyPrison++;
    agg.seizeTotal += r.seizes;
    agg.prisonTotal += r.imprisonments;
    agg.threatTotal += r.seizeThreats;
    agg.execTotal += r.seizesExecuted;
    agg.paidTotal += r.seizesPaidDown;
    agg.earlySeizeTotal += r.earlySeizes;
    agg.lateSeizeTotal += r.lateSeizes;
    if (r.kingSurvives) {
      agg.survCount++;
      if (r.seizes > 0) agg.survSeize++;
      if (r.imprisonments > 0) agg.survPrison++;
    }
    for (const b of r.betrayers) {
      agg.betrayerSeats++;
      if (b.won) agg.betrayerWins++;
    }
    if (r.frontrunnerWon) agg.frontrunnerWon++;
    if (r.frontrunnerAlive) agg.frontrunnerAlive++;
  }
  return agg;
}

function pct(x, d) {
  return ((100 * x) / d).toFixed(1) + "%";
}

function report(label, cfg, a) {
  const L = (s) => console.log(s);
  L("");
  L("=".repeat(64));
  L(`  ${label}   (${a.n} games)`);
  L(`  king=${cfg.kingStrategy}  castle=${cfg.castleVerdict}  tie=${cfg.tieRule}  misalign=${cfg.mandateMisalignProb}  leanCost=${cfg.leanChangeCost}`);
  L("=".repeat(64));
  L(`  king survives            ${pct(a.kingSurvives, a.n)}`);
  L(`    of which outright win   ${pct(a.kingOutright, a.n)}`);
  L(`  rebellion succeeds        ${pct(a.rebellionWins, a.n)}`);
  L(`  reckoning was a tie       ${pct(a.ties, a.n)}`);
  L(`  avg rounds to reckoning   ${(a.rounds / a.n).toFixed(1)} (cap ${cfg.roundCap})`);
  L(`  trigger: castle/rebel/attack/stall  ${pct(a.triggers.castle, a.n)} / ${pct(a.triggers.rebellion, a.n)} / ${pct(a.triggers.attack, a.n)} / ${pct(a.triggers.stall, a.n)}`);
  L(`  *** PAPER VICTORY (castle done, king deposed)  ${pct(a.paperVictory, a.n)}` +
    (a.triggers.castle ? `   = ${pct(a.paperVictory, a.triggers.castle)} of all completed castles` : ""));
  L("  --- the king's attack gamble ---");
  if (a.attacks > 0) {
    L(`  king attacked             ${pct(a.attacks, a.n)}   (won ${pct(a.attackWins, a.attacks)}, LOST ${pct(a.attackLoss, a.attacks)})`);
  } else {
    L("  king never attacked");
  }
  if (a.misaligned > 0) {
    L(`  king was misaligned       ${pct(a.misaligned, a.n)}   (survived ${pct(a.misalignSurv, a.misaligned)})`);
  }
  L("  --- individual victor by House kind (the win distribution) ---");
  const h = a.houseWins;
  L(`  farmer ${pct(h.farmer, a.n)}  manufacturer ${pct(h.manufacturer, a.n)}  banker ${pct(h.banker, a.n)}  king ${pct(h.king, a.n)}`);
  L("  by named House (among NOBLE victories only -- isolates the edges):");
  const nobleWins = a.n - (h.king || 0) - (a.houseByName.none || 0);
  const names = ["Varrochi", "Hesse", "Brandt", "Krael", "Mildegaarde", "Ostlander"];
  L("  " + names.map((nm) => `${nm} ${pct(a.houseByName[nm] || 0, nobleWins || 1)}`).join("  "));
  L(`  grant deck: ${(a.grantsGiven / a.n).toFixed(1)} given/game, denied (deck dry) ${pct(a.grantsDenied, a.grantsGiven + a.grantsDenied || 1)} of attempts`);
  L("  --- do the royal levers matter? ---");
  L(`  games with any seizure    ${pct(a.anySeize, a.n)}   (avg ${(a.seizeTotal / a.n).toFixed(2)}/game)`);
  const totalImprison = a.prisonTotal;
  const totalSeize = a.seizeTotal + a.execTotal;
  L(`  land-grabs (overpays)     ${(totalSeize / a.n).toFixed(2)}/game  (early ${(a.earlySeizeTotal / a.n).toFixed(2)} vs late ${(a.lateSeizeTotal / a.n).toFixed(2)} -- want the arc late-heavy)`);
  L(`  imprisonments             ${(totalImprison / a.n).toFixed(2)}/game (destitute only, unless landPaymentImprisons)`);
  if (cfg.seizeMode === "threat") {
    const t = a.threatTotal || 1;
    L(`  seize-threats issued      ${(a.threatTotal / a.n).toFixed(2)}/game  -> executed ${pct(a.execTotal, t)}, paid down ${pct(a.paidTotal, t)}`);
  }
  if (a.survCount > 0) {
    L(`  surviving kings who seized ${pct(a.survSeize, a.survCount)}   jailed ${pct(a.survPrison, a.survCount)}`);
  }
  L("  --- Q3 safe-flag-betray degeneracy ---");
  if (a.betrayerSeats > 0) {
    L(`  betrayer lands in winning faction  ${pct(a.betrayerWins, a.betrayerSeats)}`);
    L(`    (>> baseline noble seat ~ ${pct(1, cfg.nobles)} of a faction; high = degenerate)`);
  } else {
    L("  (no safeFlagBetrayer bots in mix)");
  }
  L("  --- wealth paints a target? ---");
  L(`  frontrunner survives purge   ${pct(a.frontrunnerAlive, a.n)}`);
  L(`  frontrunner in winning side  ${pct(a.frontrunnerWon, a.n)}`);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.sweep) {
    console.log("\nDEGENERACY SWEEP -- one axis at a time off the default config\n");
    const variants = [
      ["baseline (default)", {}],
      ["castle = outright win", { castleVerdict: "outright" }],
      ["mandate never misaligned (safe flag is real)", { mandateMisalignProb: 0.0 }],
      ["mandate always misaligned (flag is a trap)", { mandateMisalignProb: 1.0 }],
      ["king savage", { kingStrategy: "savage" }],
      ["king gentle", { kingStrategy: "gentle" }],
      ["levers OFF (no seize/prison)", { seizureEnabled: false, prisonEnabled: false }],
      ["lean flip costs 3 coin", { leanChangeCost: 3 }],
      ["tie favors rebellion", { tieRule: "rebellion" }],
      ["trigger-happy callers", { callerConfidence: 0.0 }],
    ];
    for (const [label, ov] of variants) {
      const cfg = makeConfig(ov);
      report(label, cfg, runBatch(cfg, args.n));
    }
    return;
  }

  const cfg = makeConfig(args.sets);
  report("Paper Victory: The Reign", cfg, runBatch(cfg, args.n));
}

main();
