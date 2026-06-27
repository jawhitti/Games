// A/B: hoarder (banks points, never spends one-shots) vs spender (uses them).
// 2 of each per game; seat assignment rotates through all placements to cancel
// the first-player edge.  node ab.js [--n 600]
const { playGame } = require('./src/bot');

function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const N = parseInt(arg('--n', '600'), 10);

// the 6 ways to place 2 hoarders (H) and 2 spenders (S) across 4 seats
const PLACEMENTS = [
  ['hoarder', 'hoarder', 'spender', 'spender'],
  ['hoarder', 'spender', 'hoarder', 'spender'],
  ['hoarder', 'spender', 'spender', 'hoarder'],
  ['spender', 'hoarder', 'hoarder', 'spender'],
  ['spender', 'hoarder', 'spender', 'hoarder'],
  ['spender', 'spender', 'hoarder', 'hoarder'],
];

let games = 0;
const wins = { hoarder: 0, spender: 0 };
const scoreSum = { hoarder: 0, spender: 0 };
const seatWins = {}; // sanity: seat balance

for (let i = 0; i < N; i++) {
  const styles = PLACEMENTS[i % PLACEMENTS.length];
  const g = playGame({ seed: 40000 + i, jitter: 3, styles });
  if (!g.isOver()) continue;
  games++;
  const st = g.standings();
  const winner = st[0];
  const winIdx = g.players.findIndex((p) => p.id === winner.id);
  wins[styles[winIdx]]++;
  seatWins[winner.id] = (seatWins[winner.id] || 0) + 1;
  g.players.forEach((p, idx) => { scoreSum[styles[idx]] += g.finalScore(p); });
}

const pct = (x) => (x / games * 100).toFixed(1) + '%';
console.log(`A/B over ${games} games (2 hoarders + 2 spenders each, seats rotated)\n`);
console.log(`WINS:  hoarder ${wins.hoarder} (${pct(wins.hoarder)})   spender ${wins.spender} (${pct(wins.spender)})`);
console.log(`  (each style holds 2 of 4 seats, so 50% = no difference)`);
console.log(`avg final score:  hoarder ${(scoreSum.hoarder / (games * 2)).toFixed(2)}   spender ${(scoreSum.spender / (games * 2)).toFixed(2)}`);
console.log(`\nwins by seat (sanity, want ~even): ${JSON.stringify(seatWins)}`);
