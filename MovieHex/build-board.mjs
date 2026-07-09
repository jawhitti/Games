// Daily board generator.
//   1) grow ancestors of a well-fed TARGET, backward, biased toward hub words
//   2) induce every valid link among them (many paths)
//   3) pick a deep START, take its forward cone, and CULL anything the start
//      can't reach — so every surviving node is on a real start->target path.
import { readFileSync, writeFileSync } from 'node:fs';

const T = readFileSync(new URL('./movies.txt', import.meta.url), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
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

// 1) well-fed target (one of the more-fed titles, with variety) + hub-biased backward growth
const sample = []; for (let i = 0; i < 1400; i++) sample.push(rnd(T));
sample.sort((a, b) => inDegFull(b) - inDegFull(a));
const TARGET = sample[(Math.random() * 22) | 0];
const CAP = 90, FANIN = 3;   // narrower fan-out => growth reaches deeper before the cap
const S = new Set([TARGET]);
let frontier = [TARGET];
while (frontier.length && S.size < CAP) {
  const next = [];
  for (const t of frontier) {
    const ps = preds(t).filter((p) => !S.has(p)).sort((a, b) => inDegFull(b) - inDegFull(a));
    let n = 0; for (const p of ps) { if (n >= FANIN || S.size >= CAP) break; S.add(p); next.push(p); n++; }
  }
  frontier = next;
}

// 2) induced subgraph — every valid link among the chosen titles
const arr = [...S];
const byHead = new Map(); for (const t of arr) (byHead.get(head(t)) ?? byHead.set(head(t), []).get(head(t))).push(t);
const E = [];
for (const a of arr) for (const b of (byHead.get(tail(a)) || [])) if (b !== a) E.push([a, b]);
const fwd = new Map(), rev = new Map();
for (const [a, b] of E) { (fwd.get(a) ?? fwd.set(a, []).get(a)).push(b); (rev.get(b) ?? rev.set(b, []).get(b)).push(a); }

// distance TO target (reverse BFS)
const dist = new Map([[TARGET, 0]]); { let q = [TARGET]; while (q.length) { const n = []; for (const t of q) for (const p of (rev.get(t) || [])) if (!dist.has(p)) { dist.set(p, dist.get(t) + 1); n.push(p); } q = n; } }
for (const n of arr) if (!dist.has(n)) dist.set(n, 999);

// 3) START = a deep node whose forward cone actually contains the target, biggest cone wins
const coneFrom = (s) => { const R = new Set([s]); const q = [s]; while (q.length) { const t = q.shift(); for (const b of (fwd.get(t) || [])) if (!R.has(b)) { R.add(b); q.push(b); } } return R; };
const cands = arr.filter((n) => n !== TARGET && dist.get(n) < 999).sort((a, b) => dist.get(b) - dist.get(a));
// prefer deep starts (long journey), then pick the one whose forward cone is biggest
const deep = cands.filter((n) => dist.get(n) >= 5);
const pool = (deep.length ? deep : cands).slice(0, 40);
let START = null, keep = null, best = -1;
for (const c of pool) { const f = coneFrom(c); if (f.has(TARGET) && f.size > best) { best = f.size; START = c; keep = f; } }
if (!keep) { START = cands[0] || TARGET; keep = coneFrom(START); }

// CULL to the cone: everything left is reachable from start AND reaches target
const kept = arr.filter((n) => keep.has(n));
const KE = E.filter(([a, b]) => keep.has(a) && keep.has(b));
const maxD = Math.max(...kept.map((n) => dist.get(n)), 1);
const indeg = new Map(kept.map((n) => [n, 0])); for (const [, b] of KE) indeg.set(b, (indeg.get(b) || 0) + 1);

// layout: x by distance-to-target (target on right), stack in a column
const byCol = new Map(); for (const n of kept) (byCol.get(dist.get(n)) ?? byCol.set(dist.get(n), []).get(dist.get(n))).push(n);
const DX = 235, DY = 50, pos = new Map();
for (const [d, list] of byCol) list.forEach((n, i) => pos.set(n, { x: (maxD - d) * DX, y: (i - (list.length - 1) / 2) * DY }));

const roleOf = (n) => n === START ? 'start' : n === TARGET ? 'target' : 'live';
const BOARD = {
  nodes: kept.map((n) => ({ t: n, x: pos.get(n).x, y: pos.get(n).y, r: roleOf(n) })),
  edges: KE.map(([a, b]) => ({ a, b })),
};
const avgIn = (KE.length / kept.length).toFixed(2);

const html = `<!doctype html><meta charset=utf-8><title>Board</title>
<style>
 html,body{margin:0;height:100%;background:#14131a;color:#cfc8b8;font:13px system-ui;overflow:hidden}
 #hud{position:fixed;top:10px;left:14px;z-index:2;line-height:1.5}#hud b{color:#f5c542}
 .legend{position:fixed;top:10px;right:14px;z-index:2;text-align:right}
 .sw{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-left:8px}
 svg{width:100vw;height:100vh;cursor:grab;touch-action:none}svg.drag{cursor:grabbing}
 text{pointer-events:none;font:11px system-ui}
</style>
<div id=hud><b>${START}</b> ⟶ <b>${TARGET}</b><br>${kept.length} titles · ${KE.length} links · avg ways-in ${avgIn} · target has ${indeg.get(TARGET) || 0} ways in · depth ${maxD}<br>drag to pan · wheel to zoom</div>
<div class=legend>
 <span class=sw style="background:#8b5cf6"></span> start
 <span class=sw style="background:#2bb3a3"></span> on a start→target path
 <span class=sw style="background:#e0c04a"></span> target
</div>
<svg id=svg><g id=cam></g></svg>
<script>
const B=${JSON.stringify(BOARD)};
const FILL={start:'#8b5cf6',live:'#1f6f66',target:'#e0c04a'},STROKE={start:'#b79cf0',live:'#2bb3a3',target:'#fff0b0'};
const NS='http://www.w3.org/2000/svg',cam=document.getElementById('cam');
const P=new Map(B.nodes.map(n=>[n.t,n]));
const el=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;};
for(const e of B.edges){const a=P.get(e.a),b=P.get(e.b);if(!a||!b)continue;
 cam.appendChild(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#4a4436','stroke-width':1,opacity:0.55}));}
for(const n of B.nodes){const g=el('g',{transform:'translate('+n.x+','+n.y+')'});
 const w=176,label=n.t.length>27?n.t.slice(0,25)+'…':n.t;
 g.appendChild(el('rect',{x:-w/2,y:-14,width:w,height:28,rx:8,fill:FILL[n.r],stroke:STROKE[n.r],'stroke-width':n.r==='live'?1.2:2.6}));
 const tx=el('text',{x:0,y:4,'text-anchor':'middle',fill:'#eee','font-weight':n.r==='live'?500:700});tx.textContent=label;g.appendChild(tx);
 if(n.r!=='live'){const l=el('text',{x:0,y:-20,'text-anchor':'middle',fill:'#fff','font-weight':800});l.textContent=n.r.toUpperCase();g.appendChild(l);}
 cam.appendChild(g);}
let tx=innerWidth*0.1,ty=innerHeight*0.5,s=0.85;
const apply=()=>cam.setAttribute('transform','translate('+tx+','+ty+') scale('+s+')');apply();
const svg=document.getElementById('svg');let drag=null;
svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,tx,ty};svg.classList.add('drag');svg.setPointerCapture(e.pointerId);});
svg.addEventListener('pointermove',e=>{if(!drag)return;tx=drag.tx+(e.clientX-drag.x);ty=drag.ty+(e.clientY-drag.y);apply();});
svg.addEventListener('pointerup',()=>{drag=null;svg.classList.remove('drag');});
svg.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY<0?1.1:1/1.1;tx=e.clientX-(e.clientX-tx)*f;ty=e.clientY-(e.clientY-ty)*f;s*=f;apply();},{passive:false});
</script>`;
writeFileSync(new URL('./board.html', import.meta.url), html);
console.log(`board.html — ${kept.length} nodes, ${KE.length} edges, avg ways-in ${avgIn}`);
console.log(`START ${START}  →  TARGET ${TARGET}   (target ways-in ${indeg.get(TARGET) || 0}, depth ${maxD})`);
