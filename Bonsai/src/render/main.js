// Bonsai — playable readout. Select a branch, make ONE change, advance the
// day, watch it grow. The timelapse replays the whole action log at speed;
// "record" captures that replay to a .webm you could post.
//
// The real game gates "next day" on the wall clock (one change per calendar
// day). Here it's a button so you can actually see months pass.

import { createGame } from '../sim/game.js';
import { seasonOf } from '../sim/config.js';
import { drawTree, pickSegment } from './draw.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function resize() {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
}
window.addEventListener('resize', () => { resize(); redraw(); });
resize();

const seed = (Math.random() * 1e9) | 0;
let game = createGame({ seed });
let day = 0;
let tree = game.simulateTo(day);
let selected = null;
let proj = null;
let playing = false;

const el = (id) => document.getElementById(id);
const status = (t) => (el('status').textContent = t);

function redraw() {
  proj = drawTree(ctx, tree, { w: W, h: H, day, selected });
  const s = seasonOf(day).name;
  el('clock').textContent = `day ${day} · ${s}`;
  el('mode').textContent = selected != null
    ? `selected branch #${selected}`
    : 'click a branch tip to select';
}

canvas.addEventListener('click', (e) => {
  if (playing) return;
  selected = pickSegment(tree, e.offsetX, e.offsetY, proj);
  redraw();
});

// --- actions: applied on the current day and shown instantly. No per-day
// limit — act as many times as you like (the real game will gate on time). ---
function actToday(action, label) {
  if (selected == null) return status('select a branch first');
  if (day === 0) return status('let it grow a day first');
  game.act(day, { type: action.type, segId: selected, delta: action.bend });
  tree = game.simulateTo(day); // re-simulate: the change shows now
  if (selected != null && !tree.state.byId.has(selected)) selected = null;
  redraw();
  status(`${label} done`);
}

el('prune').onclick = () => actToday({ type: 'prune' }, 'prune');
el('pinch').onclick = () => actToday({ type: 'pinch' }, 'pinch');
el('wireL').onclick = () => actToday({ type: 'wire', bend: -0.8 }, 'wire left');
el('wireR').onclick = () => actToday({ type: 'wire', bend: 0.8 }, 'wire right');

function advance(n) {
  day += n;
  tree = game.simulateTo(day);
  if (selected != null && !tree.state.byId.has(selected)) selected = null;
  redraw();
  status('');
}
el('next').onclick = () => advance(1);
el('skip').onclick = () => advance(30);

// --- timelapse: replay every day so far, fast ---
async function runTimelapse(onFrame) {
  playing = true;
  const frames = game.frames(day);
  for (const f of frames) {
    drawTree(ctx, f.tree, { w: W, h: H, day: f.day });
    el('clock').textContent = `day ${f.day} · ${seasonOf(f.day).name}`;
    if (onFrame) onFrame();
    await new Promise((r) => setTimeout(r, 1000 / 30));
  }
  playing = false;
  redraw();
}

el('timelapse').onclick = () => { if (!playing) runTimelapse(); };

// --- record the timelapse to a .webm (the shareable clip) ---
el('record').onclick = async () => {
  if (playing) return;
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
    return status('recording unsupported in this browser');
  }
  const stream = canvas.captureStream(30);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bonsai-${seed}-day${day}.webm`;
    a.click();
    status('saved .webm');
  };
  rec.start();
  await runTimelapse();
  rec.stop();
};

redraw();
status('a seedling. shape it over the seasons.');
