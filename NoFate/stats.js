// Aggregate stats over many full games (all effects on). node stats.js [--n 500] [--jitter 3]
const { playGame, convoyStats } = require('./src/bot');

function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const N = parseInt(arg('--n', '500'), 10);
const J = parseInt(arg('--jitter', '3'), 10);

const winBySeat = {};
let nonTerm = 0, totMargin = 0, totResolves = 0;
let megaGames = 0, biggest = 0, totConvoys = 0;
const eff = { emp: 0, downgrade: 0, longReach: 0, veteranBlock: 0, glitched: 0, timequake: 0, secondSight: 0, rebury: 0 };
let sarahCaptured = 0, sarahWalked = 0;
const allScores = [];

const count = (log, re) => log.reduce((s, e) => s + (re.test(e.msg) ? 1 : 0), 0);

for (let i = 0; i < N; i++) {
  const g = playGame({ seed: 7000 + i, jitter: J });
  if (!g.isOver()) { nonTerm++; continue; }
  totResolves += g.turn;
  const st = g.standings();
  winBySeat[st[0].id] = (winBySeat[st[0].id] || 0) + 1;
  totMargin += g.finalScore(st[0]) - g.finalScore(st[1]);
  for (const p of g.players) allScores.push(g.finalScore(p));

  const cs = convoyStats(g);
  totConvoys += cs.convoys; if (cs.mega) megaGames++; biggest = Math.max(biggest, cs.maxConvoy);

  eff.emp += count(g.log, /EMPs .* destroyed/);
  eff.downgrade += count(g.log, /afflicted:/);
  eff.longReach += count(g.log, /Long Reach:/);
  eff.veteranBlock += count(g.log, /Veteran chassis -- cannot be taken/);
  eff.glitched += count(g.log, /surfaces GLITCHED/);
  eff.timequake += count(g.log, /TIMEQUAKE/);
  eff.secondSight += count(g.log, /SECOND SIGHT/);
  eff.rebury += count(g.log, /re-buries/);
  sarahCaptured += count(g.log, /drags home .*Sarah/);
  sarahWalked += count(g.log, /sidekick #\d+ to leave/) - count(g.log, /drags home .*Sarah/);
}

const games = N - nonTerm;
const avg = (x) => (x / games).toFixed(2);
allScores.sort((a, b) => a - b);
console.log(`\n=== ${N} games, jitter=${J} (all effects on) ===`);
console.log(`terminated: ${games}/${N}${nonTerm ? `  (NON-TERMINATING: ${nonTerm})` : ''}`);
console.log(`avg resolves/game: ${avg(totResolves)} | avg winning margin: ${avg(totMargin)} pt`);
console.log(`final-score range: ${allScores[0]}..${allScores[allScores.length - 1]}, median ${allScores[Math.floor(allScores.length / 2)]}`);
console.log(`wins by seat: ${JSON.stringify(winBySeat)}`);
console.log(`convoys/game: ${avg(totConvoys)} | games w/ 4+ convoy: ${(megaGames / games * 100).toFixed(0)}% | biggest convoy: ${biggest}`);
console.log(`Sarahs: captured ${sarahCaptured} vs walked ${sarahWalked} (${(sarahCaptured / (sarahCaptured + sarahWalked) * 100).toFixed(0)}% captured)`);
console.log('effect firings/game:');
for (const [k, v] of Object.entries(eff)) console.log(`   ${k.padEnd(12)} ${avg(v)}`);
