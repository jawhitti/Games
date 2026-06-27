// Deep analysis over many games. node analysis.js [--n 400]
// Q1 How disruptive is Timequake?  Q2 How effective is fishing?  Q3 Is the game clumpy?

const { playGame } = require('./src/bot');

function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const N = parseInt(arg('--n', '400'), 10);

// ---- Q3 helper: classify each resolve turn as active/quiet from the log ------
const ACTIVE = /buddies up|drags home|sidekick #|TIMEQUAKE|SECOND SIGHT|loots|captures|comes home empty|convoy of/i;
function clumpiness(g) {
  // active turn = a resolve whose log produced a capture/sarah/global event
  const byTurn = {};
  for (const e of g.log) {
    if (e.turn < 1) continue;
    byTurn[e.turn] = byTurn[e.turn] || false;
    if (ACTIVE.test(e.msg)) byTurn[e.turn] = true;
  }
  const turns = Object.keys(byTurn).map(Number).sort((a, b) => a - b);
  const seq = turns.map((t) => byTurn[t]);
  const T = seq.length;
  const activeTurns = seq.filter(Boolean).length;
  // gaps = run lengths of consecutive quiet turns between active turns
  const gaps = []; let run = 0;
  for (const a of seq) { if (a) { gaps.push(run); run = 0; } else run++; }
  // thirds
  const third = Math.floor(T / 3) || 1;
  const a1 = seq.slice(0, third).filter(Boolean).length;
  const a3 = seq.slice(T - third).filter(Boolean).length;
  return { T, activeTurns, gaps, a1, a3 };
}

// ---- run ---------------------------------------------------------------------
const fs = { planted: 0, surfacedTop: 0, hitTarget: 0, hitOther: 0, empty: 0, absorbedByRival: 0, sarahAimed: 0, sarahGot: 0 };
let neverSurfaced = 0;
const tqFireTurns = [], tqFutureLen = [], tqPlanted = [];
let tqFiredGames = 0;
let winnerChanged = 0, scoreDiverged = 0, tqGames = 0;
const allGaps = []; let totT = 0, totActive = 0, totA1 = 0, totA3 = 0, maxGap = 0;

for (let i = 0; i < N; i++) {
  const seed = 9000 + i;
  const g = playGame({ seed, jitter: 3 });

  for (const k in fs) fs[k] += g.fishingStats[k];
  // planted terminators that never surfaced (still in deck at end)
  neverSurfaced += [...g.future, ...g.present].filter((c) => c.type === 'terminator' && c.plantTurn != null).length;

  if (g.timequakeInfo) { tqFiredGames++; tqFireTurns.push(g.timequakeInfo.turn); tqFutureLen.push(g.timequakeInfo.futureLen); tqPlanted.push(g.timequakeInfo.plantedInFuture); }

  // Q1 counterfactual: same seed, Timequake shuffle suppressed
  const g2 = playGame({ seed, jitter: 3, timequakeOff: true });
  if (g.timequakeInfo) { // only meaningful where TQ actually fired
    tqGames++;
    const w1 = g.standings()[0].id, w2 = g2.standings()[0].id;
    if (w1 !== w2) winnerChanged++;
    let div = 0; for (const p of g.players) div += Math.abs(g.finalScore(p) - g2.player(p.id).score - (g2.finalScore(g2.player(p.id)) - g2.player(p.id).score));
    // simpler divergence: sum abs diff of final scores by seat
    div = 0; for (const p of g.players) div += Math.abs(g.finalScore(p) - g2.finalScore(g2.player(p.id)));
    scoreDiverged += div;
  }

  const c = clumpiness(g);
  totT += c.T; totActive += c.activeTurns; totA1 += c.a1; totA3 += c.a3;
  for (const gp of c.gaps) { allGaps.push(gp); if (gp > maxGap) maxGap = gp; }
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pct = (x, y) => (x / y * 100).toFixed(0) + '%';

console.log(`\n=== ANALYSIS over ${N} games (jitter=3, all effects) ===`);

console.log('\n--- Q1: How disruptive is Timequake? ---');
console.log(`fired in ${tqFiredGames}/${N} games (${pct(tqFiredGames, N)}); ~18% of games end before it surfaces`);
console.log(`when it fires: avg ${mean(tqFutureLen).toFixed(0)} cards left in Future (of ~100), avg turn ${mean(tqFireTurns).toFixed(0)}`);
console.log(`planted terminators scrambled per fire: avg ${mean(tqPlanted).toFixed(1)}, max ${Math.max(...tqPlanted)}`);
console.log(`COUNTERFACTUAL (same seed, shuffle suppressed), among games where it fired:`);
console.log(`  winner changed: ${winnerChanged}/${tqGames} (${pct(winnerChanged, tqGames)})`);
console.log(`  avg total score swing across seats: ${(scoreDiverged / tqGames).toFixed(1)} pt`);

console.log('\n--- Q2: How effective is fishing? ---');
const surfacedNonEmptyTop = fs.hitTarget + fs.hitOther;
console.log(`terminators planted: ${fs.planted} total (${(fs.planted / N).toFixed(1)}/game)`);
console.log(`  surfaced as convoy leader: ${fs.surfacedTop} (${pct(fs.surfacedTop, fs.planted)} of plants)`);
console.log(`    - hauled their EXACT planted target: ${fs.hitTarget} (${pct(fs.hitTarget, fs.surfacedTop)} of those that led)`);
console.log(`    - hauled something else:           ${fs.hitOther} (${pct(fs.hitOther, fs.surfacedTop)})`);
console.log(`    - came home empty:                 ${fs.empty} (${pct(fs.empty, fs.surfacedTop)})`);
console.log(`  ABSORBED into a rival's convoy (backfired): ${fs.absorbedByRival} (${pct(fs.absorbedByRival, fs.planted)} of plants)`);
console.log(`  never surfaced (still in deck at end):       ${neverSurfaced} (${pct(neverSurfaced, fs.planted)} of plants)`);
console.log(`Sarah hunts: planted on a rival Sarah ${fs.sarahAimed} times -> actually hauled a Sarah ${fs.sarahGot} (${pct(fs.sarahGot, fs.sarahAimed)} success)`);

console.log('\n--- Q3: Is the game clumpy (slow stretches then bursts)? ---');
console.log(`active turns (a capture/Sarah/global happens): ${pct(totActive, totT)} of all turns`);
console.log(`quiet-gap between active turns: mean ${mean(allGaps).toFixed(2)}, sd ${sd(allGaps).toFixed(2)}, CV ${(sd(allGaps) / mean(allGaps)).toFixed(2)} (CV>1 = bursty), longest gap ${maxGap}`);
console.log(`activity ramp: first third avg ${(totA1 / N).toFixed(1)} active turns vs last third avg ${(totA3 / N).toFixed(1)} (end-loaded if last > first)`);
