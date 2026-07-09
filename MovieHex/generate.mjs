// Daily-board generator (semi-stochastic) over the real corpus.
//  1) random-walk a guaranteed spine START -> TARGET (length >= 5)
//  2) compute reverse-reachability: who can still reach TARGET
//  3) label every branch as a real route, a cul-de-sac, or a dead end
import { readFileSync } from 'node:fs';

const T = readFileSync(new URL('./movies.txt', import.meta.url), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const words = (t) => t.split(/\s+/).map((w) => w.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '')).filter(Boolean);
const head = (t) => words(t)[0], tail = (t) => words(t).at(-1);

const startsWith = new Map(), endsWith = new Map();
for (const t of T) {
  (startsWith.get(head(t)) ?? startsWith.set(head(t), []).get(head(t))).push(t);
  (endsWith.get(tail(t)) ?? endsWith.set(tail(t), []).get(tail(t))).push(t);
}
const outs = (t) => (startsWith.get(tail(t)) || []).filter((b) => b !== t);
const outdeg = (t) => outs(t).length;
const rnd = (a) => a[(Math.random() * a.length) | 0];

// 1) spine
function makeSpine(min = 6, max = 10) {
  for (let k = 0; k < 500; k++) {
    const start = rnd(T);
    if (outdeg(start) < 2) continue;
    const path = [start], used = new Set([start]);
    const want = min + ((Math.random() * (max - min + 1)) | 0);
    let cur = start, ok = true;
    while (path.length < want) {
      const opt = outs(cur).filter((b) => !used.has(b));
      if (!opt.length) { ok = false; break; }
      cur = rnd(opt); path.push(cur); used.add(cur);
    }
    if (ok) return path;
  }
  return null;
}
const spine = makeSpine();
const START = spine[0], TARGET = spine.at(-1);

// 2) reverse-reachability from TARGET
function reachSet(target) {
  const R = new Set([target]); let frontier = [target];
  while (frontier.length) {
    const next = [];
    for (const t of frontier)
      for (const p of (endsWith.get(head(t)) || [])) if (!R.has(p)) { R.add(p); next.push(p); }
    frontier = next;
  }
  return R;
}
const R = reachSet(TARGET);

console.log(`\nSTART:  ${START}\nTARGET: ${TARGET}\n`);
console.log(`guaranteed spine (${spine.length} titles — the safe floor):`);
console.log('  ' + spine.join('  →  ') + '\n');
console.log(`${R.size} of ${T.length} titles can still reach the target.\n`);

// 3) at a couple of spine nodes, show the real branches with labels
function show(t, nxt) {
  const b = outs(t);
  console.log(`— at "${t}"  (word: ${tail(t)}) — ${b.length} exits, sample:`);
  for (const x of b.sort((a, c) => outdeg(c) - outdeg(a)).slice(0, 6)) {
    const live = R.has(x), spine = x === nxt;
    console.log(`    ${x.slice(0, 34).padEnd(34)} out=${String(outdeg(x)).padStart(3)}  ` +
      (spine ? '★ SPINE→target' : live ? '✓ reaches target' : '✗ cul-de-sac / dead end'));
  }
  console.log('');
}
show(spine[1], spine[2]);
show(spine[Math.floor(spine.length / 2)], spine[Math.floor(spine.length / 2) + 1]);

// 4) surface a trap of each kind sitting one step off the spine
const near = new Set();
for (const s of spine) for (const x of outs(s)) near.add(x);
const lush = [...near].filter((x) => !R.has(x)).sort((a, c) => outdeg(c) - outdeg(a))[0];
const key = [...near].filter((x) => R.has(x) && outdeg(x) === 1)[0];
console.log('traps present on this board:');
if (lush) console.log(`  LUSH CUL-DE-SAC:  "${lush}"  out=${outdeg(lush)}, but ✗ never reaches target`);
if (key) console.log(`  BARREN KEY:       "${key}"  out=1 (looks dead), but ✓ reaches target`);
console.log('');
