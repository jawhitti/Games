// Single autoplay game -> transcript.txt.  node autoplay.js [--seed N] [--jitter J] [--seeding blind|burial]
const fs = require('fs');
const path = require('path');
const { playGame, convoyStats } = require('./src/bot');

function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const seed = parseInt(arg('--seed', '2029'), 10);
const jitter = parseInt(arg('--jitter', '3'), 10);
const seeding = arg('--seeding', 'blind');

const g = playGame({ seed, jitter, seeding });
const cs = convoyStats(g);

const lines = [];
lines.push('NO FATE -- autoplay transcript');
lines.push(`seed=${seed}, jitter=${jitter}, seeding=${seeding}, players=${g.players.length}, resolves=${g.turn}, over=${g.isOver()}`);
lines.push(`convoys=${cs.convoys}, max convoy=${cs.maxConvoy}, mega (4+)=${cs.mega}`);
lines.push('NOTE: all effects implemented. Bot actively uses: capture, plant/sandwich, take/send,');
lines.push('      EMP (snipe leaked plants), potato re-bury. Bot holds (rarely uses): Deep Recon,');
lines.push('      Jury-Rig, Temporal Insertion, Field Promotion, Quartermaster, Sabotage.');
lines.push('      Long Reach uses a DEFAULT ruling (skips exactly one card below); flag for review.');
lines.push('');
lines.push('FINAL STANDINGS:');
for (const p of g.standings()) lines.push(`  ${p.name} (${p.color}): ${g.finalScore(p)} pt  [banked ${p.score}, upgrades: ${p.holdings.map((h) => h.catId).join(',') || 'none'}]`);
lines.push('');
lines.push('FULL LOG:');
for (const e of g.log) lines.push(`T${String(e.turn).padStart(3)} [${e.by}] ${e.msg}`);
lines.push('');
lines.push('=== HIGHLIGHTS ===');
const hot = /buddies up|drags home|sidekick #|TIMEQUAKE|SECOND SIGHT|comes home empty|convoy of [3-9]/i;
for (const e of g.log) if (hot.test(e.msg)) lines.push(`T${String(e.turn).padStart(3)} [${e.by}] ${e.msg.trim()}`);

fs.writeFileSync(path.join(__dirname, 'transcript.txt'), lines.join('\n'));
console.log(`Done. seed=${seed} jitter=${jitter} resolves=${g.turn}. convoys=${cs.convoys} max=${cs.maxConvoy} mega(4+)=${cs.mega}`);
for (const p of g.standings()) console.log(`  ${p.name}: ${g.finalScore(p)} pt`);
