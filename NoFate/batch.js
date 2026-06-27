// Batch experiment: does fuzzing the cut kill mega-convoys?
// Runs N games each at jitter=0 (exact) and jitter=J, aggregates convoy stats,
// winner-by-seat, and average scores.   node batch.js [--n 100] [--jitter 3]

const { playGame, convoyStats } = require('./src/bot');

function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const N = parseInt(arg('--n', '100'), 10);
const J = parseInt(arg('--jitter', '3'), 10);

function run(jitter) {
  const convoyAll = [];
  let megaGames = 0, totalConvoys = 0, biggest = 0;
  const winBySeat = {};
  let nonTerm = 0;
  for (let i = 0; i < N; i++) {
    const g = playGame({ seed: 1000 + i, jitter });
    const cs = convoyStats(g);
    convoyAll.push(...cs.sizes);
    totalConvoys += cs.convoys;
    if (cs.mega > 0) megaGames++;
    biggest = Math.max(biggest, cs.maxConvoy);
    if (!g.isOver()) nonTerm++;
    const win = g.standings()[0];
    winBySeat[win.id] = (winBySeat[win.id] || 0) + 1;
  }
  const hist = {};
  for (const s of convoyAll) hist[s] = (hist[s] || 0) + 1;
  return {
    jitter,
    games: N,
    nonTerminating: nonTerm,
    totalConvoys,
    convoysPerGame: (totalConvoys / N).toFixed(2),
    megaGamePct: ((megaGames / N) * 100).toFixed(0) + '%',
    biggestConvoy: biggest,
    sizeHist: hist,
    winBySeat,
  };
}

function show(r) {
  console.log(`\n--- jitter=${r.jitter} (${r.games} games) ---`);
  console.log(`convoys/game: ${r.convoysPerGame} | games with a mega-convoy (4+): ${r.megaGamePct} | biggest convoy: ${r.biggestConvoy}`);
  console.log(`convoy size histogram (size:count): ${Object.entries(r.sizeHist).map(([k, v]) => `${k}:${v}`).join('  ')}`);
  console.log(`wins by seat: ${JSON.stringify(r.winBySeat)}${r.nonTerminating ? ` | NON-TERMINATING: ${r.nonTerminating}` : ''}`);
}

console.log(`Batch: ${N} games per condition.`);
show(run(0)); // exact cuts (the old behavior)
show(run(J)); // fuzzy cuts
