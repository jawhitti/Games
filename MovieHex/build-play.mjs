// Generate a branchy board and emit a PLAYABLE hex-flower play.html.
import { readFileSync, writeFileSync } from 'node:fs';
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
const TARGETS = T.filter((t) => inDegFull(t) >= 4);

function genBoard() {
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
  const quals = [];
  for (const c of cands) { if (dist.get(c) < 4) break; const f = cone(c); if (f.has(TARGET) && f.size >= 12) quals.push([c, f]); }
  if (!quals.length) return null;
  const [START, keep] = quals[(Math.random() * quals.length) | 0];
  const kept = arr.filter((n) => keep.has(n));
  const adj = {}; for (const n of kept) adj[n] = [];
  for (const [a, b] of E) if (keep.has(a) && keep.has(b)) adj[a].push(b);
  const bfs = new Map([[START, 0]]); { let q = [START]; while (q.length) { const t = q.shift(); for (const b of adj[t]) if (!bfs.has(b)) { bfs.set(b, bfs.get(t) + 1); q.push(b); } } }
  const startOut = adj[START].length;
  let fp = 0, c = START; while (adj[c] && adj[c].length === 1 && c !== TARGET) { c = adj[c][0]; fp++; }
  const branch = kept.filter((n) => adj[n].length >= 2).length / kept.length;
  return { start: START, target: TARGET, adj, size: kept.length, par: bfs.get(TARGET), startOut, fp, branch };
}
let B = null, tries = 0;
for (; tries < 4000 && !B; tries++) { const g = genBoard(); if (g && g.size >= 14 && g.par >= 4 && g.startOut >= 2 && g.fp === 0 && g.branch >= 0.55) B = g; }
if (!B) B = genBoard();
console.error(`(branchy board after ${tries} tries)`);

const HEX = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
const html = `<!doctype html><meta charset=utf-8><title>Movie Hop</title>
<style>
 *{box-sizing:border-box}html,body{margin:0;min-height:100%}
 body{background:#141019;color:#e9e2d3;font:15px system-ui;display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 12px 50px;user-select:none;overflow-x:hidden}
 h1{font:800 13px system-ui;letter-spacing:.22em;color:#8f84c9;margin:0}
 #goal{font:600 13px system-ui;color:#b7ad97}#goal b{color:#f5c542}
 #hud{display:flex;gap:20px;font:600 13px system-ui;color:#a99}#hud b{color:#f5c542}
 #phrase{max-width:820px;text-align:center;font:600 14px system-ui;color:#e9e2d3;line-height:1.45;min-height:20px}
 #stage{position:relative;width:520px;max-width:98vw;height:500px;margin:0 auto}
 .hex{position:absolute;left:50%;top:50%;width:168px;height:188px;transform:translate(-50%,-50%);clip-path:${HEX};transition:transform .24s ease,opacity .24s}
 .hex .in{position:absolute;inset:3px;clip-path:${HEX};display:flex;align-items:center;justify-content:center;text-align:center;padding:34px 16px;font:600 12.5px system-ui;line-height:1.25;overflow:hidden}
 .hex.center{background:#6a5aa0;z-index:2}.hex.center .in{background:linear-gradient(160deg,#3a2f57,#26213a);color:#fff;font-weight:800;font-size:13.5px}
 .hex.petal{background:#3d3550;cursor:pointer}.hex.petal .in{background:#211d2c;color:#e9e2d3}
 .hex.petal:hover{background:#8f84c9}.hex.petal:active{opacity:.7}
 .hex.petal.win{background:#3fae5a}.hex.petal.win .in{background:#173026;color:#cfeeda}
 .hex.empty{background:#241f30}.hex.empty .in{background:#171322}
 .lw{color:#f5c542}
 .bloom{animation:bl .3s ease}@keyframes bl{from{opacity:0}to{opacity:1}}
 #note{font:600 13px system-ui;color:#c0563f;min-height:18px}
 button.tool{cursor:pointer;background:transparent;border:2px solid #4a4258;color:#b7ad97;border-radius:11px;padding:8px 15px;font:600 13px system-ui}
 button.tool:disabled{opacity:.35;cursor:default}
 #win{position:fixed;inset:0;background:rgba(10,8,14,.9);display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:5;padding:24px;text-align:center}
 #win.show{display:flex}#win .big{font:800 28px system-ui;color:#f5c542}#win .ph{max-width:840px;color:#cfc8b8;line-height:1.6;font-weight:600}
</style>
<h1>M O V I E   H O P</h1>
<div id=goal>reach <b id=goalt></b> — longer route scores higher · each backtrack −2</div>
<div id=hud><span>hops <b id=hops>0</b></span><span>backtracks <b id=backs>0</b></span><span>score <b id=score>0</b></span><span>par <b id=par></b></span></div>
<div id=phrase></div>
<div id=stage></div>
<div id=note></div>
<div><button class=tool id=back>↶ backtrack (−2)</button> <button class=tool id=reset>reset</button></div>
<div id=win><div class=big>🎬 reached it!</div><div class=ph id=winph></div><div id=winsc class=big></div><button class=tool onclick="location.reload()">new board</button></div>
<script>
const B=${JSON.stringify({ start: B.start, target: B.target, adj: B.adj, par: B.par })};
const wds=t=>t.split(/\\s+/), lastw=t=>wds(t).at(-1);
const merged=p=>{let w=[];p.forEach((t,i)=>{const a=wds(t);w=w.concat(i?a.slice(1):a);});return w.join(' ');};
const elm=(t,c)=>{const e=document.createElement(t);if(c)e.className=c;return e;};
let path,cur,vis,backs;
function start(){path=[B.start];cur=B.start;vis=new Set([B.start]);backs=0;document.getElementById('win').classList.remove('show');document.getElementById('goalt').textContent=B.target;document.getElementById('par').textContent=B.par;render();}
const score=()=>path.length-1-2*backs;
function hexEl(title,cls,onclick,x,y){
 const h=elm('div','hex '+cls+' bloom');
 h.style.transform='translate(calc(-50% + '+x+'px),calc(-50% + '+y+'px))';
 const inn=elm('div','in');
 if(title){if(title.length<=44){const lw=lastw(title);inn.innerHTML=title.slice(0,title.length-lw.length)+'<span class=lw>'+lw+'</span>';}
  else inn.textContent=title.slice(0,42)+'…';}
 h.appendChild(inn); if(onclick)h.onclick=onclick; return h;
}
function render(){
 document.getElementById('hops').textContent=path.length-1;
 document.getElementById('backs').textContent=backs;
 document.getElementById('score').textContent=score();
 document.getElementById('phrase').textContent=merged(path);
 document.getElementById('note').textContent='';
 document.getElementById('back').disabled=path.length<2;
 const st=document.getElementById('stage');st.innerHTML='';
 st.appendChild(hexEl(cur,'center',null,0,0));
 if(cur===B.target){win();return;}
 const opts=(B.adj[cur]||[]).filter(e=>!vis.has(e)).slice(0,6);
 if(!opts.length)document.getElementById('note').textContent='dead end — backtrack to try another door';
 // fixed six-slot honeycomb; scatter the successors into random free slots
 const POS=[[-84,-141],[84,-141],[168,0],[84,141],[-84,141],[-168,0]];
 const slots=[0,1,2,3,4,5];for(let k=5;k>0;k--){const j=(Math.random()*(k+1))|0;[slots[k],slots[j]]=[slots[j],slots[k]];}
 const assign=new Array(6).fill(null);opts.forEach((e,i)=>assign[slots[i]]=e);
 POS.forEach((p,i)=>{const e=assign[i];
  if(e)st.appendChild(hexEl(e,'petal'+(e===B.target?' win':''),()=>hop(e),p[0],p[1]));
  else st.appendChild(hexEl('','empty',null,p[0],p[1]));});
}
function hop(e){path.push(e);vis.add(e);cur=e;chime(520+(path.length%4)*60);render();}
function back(){if(path.length<2)return;const p=path.pop();vis.delete(p);cur=path[path.length-1];backs++;chime(240);render();}
function win(){const w=document.getElementById('win');
 document.getElementById('winph').textContent=merged(path);
 document.getElementById('winsc').textContent='score '+score()+'   ('+(path.length-1)+' hops · '+backs+' backtracks · par '+B.par+')';
 w.classList.add('show');chime(784);setTimeout(()=>chime(988),120);setTimeout(()=>chime(1175),240);}
document.getElementById('back').onclick=back;document.getElementById('reset').onclick=start;
let actx;function chime(f){try{actx=actx||new(window.AudioContext||window.webkitAudioContext)();const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.14,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.2);o.connect(g).connect(actx.destination);o.start(t);o.stop(t+.24);}catch{}}
start();
</script>`;
writeFileSync(new URL('./play.html', import.meta.url), html);
console.log(`play.html — ${B.start}  →  ${B.target}  (${B.size} titles, par ${B.par})`);
