// Viability probe: can we mint ~1000 distinct, quality boards?
import { readFileSync } from 'node:fs';
const T = readFileSync(new URL('./movies.txt', import.meta.url), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const words = (t) => t.split(/\s+/).map((w) => w.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '')).filter(Boolean);
const head = (t) => words(t)[0], tail = (t) => words(t).at(-1);
const startsWith = new Map(), endsWith = new Map();
for (const t of T) {
  (startsWith.get(head(t)) ?? startsWith.set(head(t), []).get(head(t))).push(t);
  (endsWith.get(tail(t)) ?? endsWith.set(tail(t), []).get(tail(t))).push(t);
}
const preds = (t) => (endsWith.get(head(t)) || []).filter((p) => p !== t);
const inDegFull = (t) => (endsWith.get(head(t)) || []).length;
const rnd = (a) => a[(Math.random() * a.length) | 0];

// how many titles are even eligible as targets, by ways-in threshold?
for (const th of [3, 4, 5, 8]) console.log(`titles with >=${th} ways in: ${T.filter((t) => inDegFull(t) >= th).length}`);
const TARGETS = T.filter((t) => inDegFull(t) >= 4);
console.log('');

function gen() {
  const TARGET = rnd(TARGETS);
  const S = new Set([TARGET]); let fr = [TARGET];
  while (fr.length && S.size < 90) {
    const nx = [];
    for (const t of fr) { const ps = preds(t).filter((p) => !S.has(p)).sort((a, b) => inDegFull(b) - inDegFull(a)); let n = 0; for (const p of ps) { if (n >= 3 || S.size >= 90) break; S.add(p); nx.push(p); n++; } }
    fr = nx;
  }
  const arr = [...S];
  const byHead = new Map(); for (const t of arr) (byHead.get(head(t)) ?? byHead.set(head(t), []).get(head(t))).push(t);
  const E = []; for (const a of arr) for (const b of (byHead.get(tail(a)) || [])) if (b !== a) E.push([a, b]);
  const fwd = new Map(), rev = new Map(); for (const [a, b] of E) { (fwd.get(a) ?? fwd.set(a, []).get(a)).push(b); (rev.get(b) ?? rev.set(b, []).get(b)).push(a); }
  const dist = new Map([[TARGET, 0]]); { let q = [TARGET]; while (q.length) { const n = []; for (const t of q) for (const p of (rev.get(t) || [])) if (!dist.has(p)) { dist.set(p, dist.get(t) + 1); n.push(p); } q = n; } }
  for (const n of arr) if (!dist.has(n)) dist.set(n, 999);
  const cone = (s) => { const R = new Set([s]); const q = [s]; while (q.length) { const t = q.shift(); for (const b of (fwd.get(t) || [])) if (!R.has(b)) { R.add(b); q.push(b); } } return R; };
  const cands = arr.filter((n) => n !== TARGET && dist.get(n) < 999).sort((a, b) => dist.get(b) - dist.get(a));
  // collect ALL qualifying deep starts (cone reaches target, sizeable), then pick RANDOM for variety
  const quals = [];
  for (const c of cands) { if (dist.get(c) < 4) break; const f = cone(c); if (f.has(TARGET) && f.size >= 10) quals.push([c, f]); }
  if (!quals.length) for (const c of cands) { const f = cone(c); if (f.has(TARGET) && f.size >= 8) quals.push([c, f]); }
  if (!quals.length) return null;
  const [START, keep] = quals[(Math.random() * quals.length) | 0];
  const kept = arr.filter((n) => keep.has(n)); const KE = E.filter(([a, b]) => keep.has(a) && keep.has(b));
  const indeg = new Map(kept.map((n) => [n, 0])); for (const [, b] of KE) indeg.set(b, (indeg.get(b) || 0) + 1);
  return { START, TARGET, size: kept.length, depth: dist.get(START), tin: indeg.get(TARGET) || 0 };
}

const N = 8000;
const t0 = Date.now();
let ok = 0; const pairs = new Set(), starts = new Set(), targets = new Set();
const sizes = [], depths = [];
for (let i = 0; i < N; i++) {
  const g = gen(); if (!g) continue;
  const quality = g.size >= 10 && g.depth >= 4 && g.tin >= 2;   // a "good" daily
  if (!quality) continue;
  ok++; pairs.add(g.START + ' :: ' + g.TARGET); starts.add(g.START); targets.add(g.TARGET);
  sizes.push(g.size); depths.push(g.depth);
}
const ms = Date.now() - t0;
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`${N} attempts in ${ms}ms`);
console.log(`quality boards: ${ok}/${N}`);
console.log(`distinct start→target pairs: ${pairs.size}`);
console.log(`distinct starts: ${starts.size}   distinct targets: ${targets.size}`);
console.log(`avg size ${avg(sizes)}  avg depth ${avg(depths)}  max depth ${Math.max(...depths)}`);
