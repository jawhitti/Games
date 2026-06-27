// Style matchups + hand-cap effect. node test-smart.js [--n 1800]
const { playGame } = require('./src/bot');
function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const N = parseInt(arg('--n', '1800'), 10);

function ab(a, b, { handCap = null } = {}) {
  const PLACE = [[a, a, b, b], [a, b, a, b], [a, b, b, a], [b, a, a, b], [b, a, b, a], [b, b, a, a]];
  let aw = 0, games = 0, aScore = 0, bScore = 0;
  for (let i = 0; i < N; i++) {
    const styles = PLACE[i % 6];
    const g = playGame({ seed: 70000 + i, jitter: 3, styles, handCap });
    if (!g.isOver()) continue; games++;
    const w = g.standings()[0];
    const wi = g.players.findIndex((p) => p.id === w.id);
    if (styles[wi] === a) aw++;
    g.players.forEach((p, idx) => { if (styles[idx] === a) aScore += g.finalScore(p); else bScore += g.finalScore(p); });
  }
  return { games, aWin: (aw / games * 100).toFixed(1), bWin: ((games - aw) / games * 100).toFixed(1), aScore: (aScore / (games * 2)).toFixed(1), bScore: (bScore / (games * 2)).toFixed(1) };
}

console.log(`=== style matchups (2v2, seats rotated, no cap), ${N} games each ===`);
for (const [a, b] of [['smart', 'hoarder'], ['smart', 'spender'], ['spender', 'hoarder']]) {
  const r = ab(a, b);
  console.log(`${a} vs ${b}:  ${a} ${r.aWin}%  /  ${b} ${r.bWin}%   (avg score ${a} ${r.aScore}, ${b} ${r.bScore})`);
}

console.log('\n=== hand-cap effect (smart vs hoarder) ===');
for (const cap of [null, 10, 8, 6]) {
  const r = ab('smart', 'hoarder', { handCap: cap });
  console.log(`cap ${cap === null ? 'none' : cap}:  smart ${r.aWin}%  /  hoarder ${r.bWin}%`);
}
