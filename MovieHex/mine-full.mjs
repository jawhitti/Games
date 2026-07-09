// Bridge-miner over the real ITA "Sling Blade Runner" corpus (movies.txt).
// Canonical matching: exact last word -> exact first word (articles kept).
import { readFileSync } from 'node:fs';

const TITLES = readFileSync(new URL('./movies.txt', import.meta.url), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);

function words(t) {
  return t.split(/\s+/).map((w) => w.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '')).filter(Boolean);
}
const head = (t) => words(t)[0];
const tail = (t) => words(t).at(-1);

const startsWith = new Map();          // first word -> titles starting with it
for (const t of TITLES) {
  const h = head(t);
  if (!h) continue;
  (startsWith.get(h) || startsWith.set(h, []).get(h)).push(t);
}
const fert = (w) => (startsWith.get(w) || []).length;
const escapes = (t) => (startsWith.get(tail(t)) || []).filter((b) => b !== t);

console.log(`\n${TITLES.length} titles.  ${startsWith.size} distinct first words.\n`);

// HUBS
const hubs = [...startsWith].sort((a, b) => b[1].length - a[1].length).slice(0, 18);
console.log('── biggest HUB words (safest landings) ──');
console.log(hubs.map(([w, a]) => `${w}(${a.length})`).join('  ') + '\n');

// DEAD ENDS
const dead = TITLES.filter((t) => fert(tail(t)) === 0);
console.log(`── DEAD ENDS: ${dead.length} of ${TITLES.length} (${(100 * dead.length / TITLES.length).toFixed(0)}%) end on a word nothing starts with ──\n`);

// BRIDGES: tail word has exactly ONE escape
const bridges = TITLES.filter((t) => fert(tail(t)) === 1).map((t) => [t, escapes(t)[0]]).filter((b) => b[1]);
console.log(`── SURPRISING BRIDGES: ${bridges.length} titles have exactly ONE escape ──`);
for (const [a, b] of bridges.slice(0, 20)) console.log(`  ${a}  ─▶  ${b}`);

// longest chain we can find greedily (prefer keeping options open), from many starts
function walk(start) {
  const path = [start], used = new Set([start]);
  let cur = start;
  for (;;) {
    const opts = escapes(cur).filter((b) => !used.has(b));
    if (!opts.length) break;
    opts.sort((a, b) => fert(tail(b)) - fert(tail(a)));
    cur = opts[0]; path.push(cur); used.add(cur);
  }
  return path;
}
let best = [];
for (const t of TITLES) { const p = walk(t); if (p.length > best.length) best = p; }
console.log(`\n── LONGEST GREEDY CHAIN FOUND: ${best.length} titles ──`);
console.log('start:  ' + best.slice(0, 14).join('  →  ') + '  → …');
const merged = best.slice(0, 12)
  .reduce((acc, t, i) => i === 0 ? words(t) : acc.concat(words(t).slice(1)), [])
  .join(' ');
console.log('\nfirst stretch reads as:\n  ' + merged + ' …\n');
