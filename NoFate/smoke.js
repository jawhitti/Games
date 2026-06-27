// Smoke test for NO FATE. Two parts:
//  A) a full automated game via the shared bot (proves the loop terminates),
//  B) a focused buddy-chain capture + Sarah order-scoring check.
// Run: node smoke.js

const { Game } = require('./src/engine');
const { playGame, convoyStats } = require('./src/bot');

console.log('=== A) full automated game (bot) ===');
const g = playGame({ seed: 99, jitter: 3 });
const cs = convoyStats(g);
console.log(`over=${g.isOver()} resolves=${g.turn} sarahsLeft=${g.sarahsLeft}/${g.players.length} convoys=${cs.convoys} maxConvoy=${cs.maxConvoy}`);
for (const p of g.standings()) console.log(`  ${p.name}: ${g.finalScore(p)} pt`);
if (!g.isOver()) { console.error('FAIL: game did not terminate'); process.exit(1); }

console.log('\n=== B) buddy-chain capture + Sarah order scoring ===');
const t = new Game({ seed: 1 });
const redT = { id: 'P1-Tx', type: 'terminator', label: 'red terminator', owner: 'P1', color: 'red', value: 0 };
const blueT = { id: 'P2-Tx', type: 'terminator', label: 'blue terminator', owner: 'P2', color: 'blue', value: 0 };
const p3Sarah = { id: 'P3-S', type: 'sarah', label: "P3's Sarah", owner: 'P3', color: 'green', value: 0 };
const prize5 = { id: 'PRZ', type: 'prize', label: 'Prize 5', value: 5 };
t.present = [redT, blueT, p3Sarah, prize5];
t.future = [];
t.phase = 'resolve';
t.current = 0; // P1 acts
t.resolveTop().forEach((l) => console.log('  ' + l));
console.log(`  => P1 score: ${t.player('P1').score} (expect 4: Sarah #1 = 2^0 x2 capture = 2, + convoy bounty 2 for the 1 absorbed machine)`);
console.log(`  => Present now: [${t.present.map((c) => c.label).join(', ')}] (expect just Prize 5)`);
const passB = t.player('P1').score === 4 && t.present.length === 1 && t.sarahsLeft === 1;
console.log(passB ? '  PASS' : '  FAIL');
process.exit(passB ? 0 : 1);
