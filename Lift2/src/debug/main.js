// SimCity-style isometric readout. Still crude-on-purpose: flat-shaded
// boxes on a diamond grid — but positional. The mouse highlights a tile;
// build keys place the building on the highlighted tile.

import { createSim } from '../sim/sim.js';

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed')) || 1;
let sim = createSim({ seed });

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let paused = false;
let timeScale = 1;
let mouse = { x: -1, y: -1 };
let hoverTile = null; // {x, y} tile under the mouse, if any
let toast = null; // {text, until} transient feedback line
let hitRects = []; // rebuilt every frame: {x,y,w,h,kind,id}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---- iso projection (recomputed each frame so resize just works) ----

let iso = { tw: 64, th: 32, ox: 0, oy: 0 };

function computeIso() {
  const { gridW, gridH } = sim.config.board;
  const W = canvas.width, H = canvas.height;
  const tw = Math.min(76, ((W - 260) * 2) / (gridW + gridH), ((H - 220) * 4) / (gridW + gridH));
  const th = tw / 2;
  // tile (0,0) top corner sits at the map's top; center the whole diamond
  const ox = W / 2 - ((gridW - gridH) * tw) / 4 - 110;
  const oy = (H - ((gridW + gridH) * th) / 2) / 2 + 40;
  iso = { tw, th, ox, oy };
}

const tileX = (gx, gy) => iso.ox + ((gx - gy) * iso.tw) / 2;
const tileY = (gx, gy) => iso.oy + ((gx + gy) * iso.th) / 2;

function screenToTile(mx, my) {
  const dx = mx - iso.ox, dy = my - iso.oy;
  const gx = Math.floor(dx / iso.tw + dy / iso.th);
  const gy = Math.floor(dy / iso.th - dx / iso.tw);
  const { gridW, gridH } = sim.config.board;
  if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) return null;
  return { x: gx, y: gy };
}

function diamond(cx, cy, tw, th) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - th / 2);
  ctx.lineTo(cx + tw / 2, cy);
  ctx.lineTo(cx, cy + th / 2);
  ctx.lineTo(cx - tw / 2, cy);
  ctx.closePath();
}

// flat-shaded iso box: base diamond footprint (w tiles wide) extruded h px
function box(gx, gy, w, h, top, left, right) {
  const cx = tileX(gx, gy), cy = tileY(gx, gy) + iso.th / 2;
  const hw = (iso.tw / 2) * w, hh = (iso.th / 2) * w;
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh - h);
  ctx.lineTo(cx - hw, cy - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh - h);
  ctx.lineTo(cx + hw, cy - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = top;
  diamond(cx, cy - h, hw * 2, hh * 2);
  ctx.fill();
  return { cx, cy, topY: cy - h - hh };
}

// ---- input ----

canvas.addEventListener('mousemove', (e) => {
  mouse = { x: e.offsetX, y: e.offsetY };
});

function hitTest(mx, my) {
  for (let i = hitRects.length - 1; i >= 0; i--) {
    const r = hitRects[i];
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return r;
  }
  return null;
}

function say(text) {
  toast = { text, until: performance.now() + 2500 };
}

canvas.addEventListener('click', (e) => {
  const hit = hitTest(e.offsetX, e.offsetY);
  if (!hit) return;
  if (hit.kind === 'pool') {
    if (e.shiftKey) {
      const f = sim.state.firemen.find((x) => x.poolId === hit.id);
      if (f) { sim.actions.assignFireman(f.id, null); say('fireman recalled'); }
    } else {
      const idle = sim.state.firemen.find((x) => x.poolId === null);
      if (idle) { sim.actions.assignFireman(idle.id, hit.id); say('fireman deployed'); }
      else say('no idle firemen — shift+click a blob to recall one');
    }
  } else if (hit.kind === 'asset' && e.altKey) {
    const got = sim.actions.sell(hit.id);
    say(got === false ? 'cannot sell' : `sold for ${got.toFixed(1)} water`);
  } else if (hit.kind === 'asset') {
    const inst = sim.state.instruments.find((i) => i.id === hit.id);
    if (inst && inst.income && inst.income.kind === 'selffeed') {
      const v = inst.income.valve === 'reinvest' ? 'consume' : 'reinvest';
      sim.actions.setValve(hit.id, v);
      say(`investment valve: ${v}`);
    }
  }
});

function tryBuild(fn, label) {
  const ok = fn(hoverTile ? { cell: hoverTile } : {});
  say(ok ? `${label} built${hoverTile ? ` at ${hoverTile.x},${hoverTile.y}` : ''}` : `can't build ${label} there`);
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { paused = !paused; e.preventDefault(); }
  else if (k === '[') timeScale = Math.max(0.25, timeScale / 2);
  else if (k === ']') timeScale = Math.min(16, timeScale * 2);
  else if (k === 'r') tryBuild((o) => sim.actions.buy('rental', o), 'rental');
  else if (k === 'h') tryBuild((o) => sim.actions.buy('house', o), 'house');
  else if (k === 'c') tryBuild((o) => sim.actions.buy('car', o), 'car');
  else if (k === 'i') tryBuild((o) => sim.actions.invest(5, o), 'investment (5)');
  else if (k === 'p') tryBuild((o) => sim.actions.buildPump(o), 'defense pump');
  else if (k === 'v') {
    const inv = sim.state.instruments.find((i) => i.type === 'investment' && !i.destroyed);
    if (inv) {
      const v = inv.income.valve === 'reinvest' ? 'consume' : 'reinvest';
      sim.actions.setValve(inv.id, v);
      say(`investment valve: ${v}`);
    }
  } else if (k === 'l') { sim.actions.takeLoan(10); say('bank loan: +10 water, goo erupts'); }
  else if (k === 'd') { sim.actions.drawCredit(5); say('credit drawn: +5 water, fast goo grows'); }
  else if (k === 'x') {
    const p = sim.state.pumps.find((x) => x.cuttable && x.enabled);
    if (p) { sim.actions.cutExpense(p.id); say(`cut ${p.label}`); }
  } else if (k === 'n') { seed = (Math.random() * 1e9) | 0; sim = createSim({ seed }); }
  else if (k === '0') sim = createSim({ seed });
});

// ---- drawing ----

function text(str, x, y, size = 13, color = '#bbb', align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${size}px monospace`;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

// a pipe: dashes march from (x1,y1) toward (x2,y2) at a speed set by the
// rate, driven by SIM time — pause the sim and every flow freezes.
let flowClock = 0;
function pipe(x1, y1, x2, y2, rate, color, arcLift = 30) {
  if (rate <= 1e-6) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.min(6, 1 + 2.2 * Math.sqrt(rate));
  ctx.setLineDash([7, 6]);
  ctx.lineDashOffset = -flowClock * 30 * Math.min(4, 0.5 + rate);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - arcLift, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

const GRASS_A = '#3f7a38';
const GRASS_B = '#468442';
const GOO_SLOW = [112, 130, 56];
const GOO_FAST = [192, 38, 211];
const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const shade = (c, f) => rgb(c.map((v) => Math.round(v * f)));

const PALETTE = {
  tower: [120, 160, 210],
  rental: [214, 158, 66],
  house: [200, 90, 80],
  car: [150, 150, 160],
  investment: [96, 190, 110],
};

function draw(snap) {
  const W = canvas.width, H = canvas.height;
  computeIso();
  flowClock = snap.month;
  hitRects = [];
  hoverTile = screenToTile(mouse.x, mouse.y);
  ctx.fillStyle = '#16211a';
  ctx.fillRect(0, 0, W, H);
  const { gridW, gridH } = sim.config.board;

  // --- ground tiles ---
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const cx = tileX(gx, gy), cy = tileY(gx, gy) + iso.th / 2;
      diamond(cx, cy, iso.tw, iso.th);
      ctx.fillStyle = (gx + gy) % 2 ? GRASS_A : GRASS_B;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.stroke();
    }
  }

  // --- depth-sorted scene: goo blobs + buildings, painter's order ---
  const drawables = [];

  for (const p of snap.gooPools) {
    if (p.closed || p.volume <= 0) continue;
    drawables.push({
      depth: p.x + p.y,
      draw() {
        const cx = tileX(p.x, p.y), cy = tileY(p.x, p.y) + iso.th / 2;
        const heat = Math.min(1, p.spreadRate / 0.05);
        const rx = Math.max(6, p.radius * (iso.tw / 2));
        const ry = Math.max(3, p.radius * (iso.th / 2));
        ctx.fillStyle = rgb(mixc(GOO_SLOW, GOO_FAST, heat));
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.fill();
        // static lobes, seeded per pool — texture without pulsation
        for (let i = 0; i < 3; i++) {
          const a = p.id * 2.4 + i * 2.1;
          ctx.beginPath();
          ctx.ellipse(
            cx + Math.cos(a) * rx * 0.45, cy + Math.sin(a) * ry * 0.45,
            rx * 0.3, ry * 0.3, 0, 0, 2 * Math.PI
          );
          ctx.fill();
        }
        text(`${p.label} ${p.volume.toFixed(1)}`, cx, cy - ry - 18, 11, '#e8c', 'center');
        text(`+${(p.spreadRate * 100).toFixed(1)}%/mo`, cx, cy - ry - 6, 10,
          heat > 0.5 ? '#f6a' : '#ab8', 'center');
        if (p.persistent) text('(forever)', cx, cy - ry + 6, 9, '#caa', 'center');
        hitRects.push({ x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry, kind: 'pool', id: p.id });

        // firemen ring the blob on the tower side
        for (let i = 0; i < p.firemen; i++) {
          const fx = cx - rx - 10 - i * 12, fy = cy + 4;
          pipe(fx, fy - 8, cx - rx * 0.3, cy - ry * 0.3,
            snap.derived.dry ? 0.05 : sim.config.firemen.sprayWaterPerMonth,
            snap.derived.dry ? 'rgba(120,120,130,0.7)' : 'rgba(87,167,232,0.85)', 22);
          ctx.fillStyle = '#d64545';
          ctx.beginPath();
          ctx.moveTo(fx - 4, fy);
          ctx.lineTo(fx + 4, fy);
          ctx.lineTo(fx, fy - 11);
          ctx.closePath();
          ctx.fill();
        }
      },
    });
  }

  // the pond: your water as a body on the map — area IS your level
  drawables.push({
    depth: snap.main.x + snap.main.y - 0.5, // water lies under things
    draw() {
      const cx = tileX(snap.main.x, snap.main.y), cy = tileY(snap.main.x, snap.main.y) + iso.th / 2;
      const rx = Math.max(10, snap.main.radius * (iso.tw / 2));
      const ry = Math.max(5, snap.main.radius * (iso.th / 2));
      ctx.fillStyle = '#2a5f9e';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.06, ry * 1.06, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#3d8bd6';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#5aa7e8';
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.2, cy - ry * 0.2, rx * 0.45, ry * 0.4, 0, 0, 2 * Math.PI);
      ctx.fill();
      text(snap.main.level.toFixed(1), cx, cy - ry - 8, 12, '#cfe4ff', 'center');
      text('pond', cx, cy + ry + 12, 10, '#9ab', 'center');
      const idle = snap.firemen.filter((f) => f.poolId === null).length;
      if (idle) text(`${idle} firemen idle`, cx, cy + ry + 24, 10, '#c88', 'center');

      // seam foam: static white froth where goo overlaps the pond
      for (const p of snap.gooPools) {
        if (p.closed || p.volume <= 0) continue;
        const d = snap.main.radius + p.radius - Math.hypot(p.x - snap.main.x, p.y - snap.main.y);
        if (d <= 0) continue;
        const t = snap.main.radius / Math.max(1e-6, snap.main.radius + p.radius);
        const fx = cx + (tileX(p.x, p.y) - cx) * t;
        const fy = cy + (tileY(p.x, p.y) + iso.th / 2 - cy) * t;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 5; i++) {
          const a = p.id * 3.1 + i * 1.7;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(a) * 7, fy + (Math.sin(a) * 7) / 2, 2.2, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    },
  });

  for (const inst of snap.instruments) {
    if (inst.sold) continue;
    drawables.push({
      depth: inst.x + inst.y,
      draw() {
        if (inst.destroyed) {
          const cx = tileX(inst.x, inst.y), cy = tileY(inst.x, inst.y) + iso.th / 2;
          ctx.fillStyle = 'rgba(30,20,20,0.75)';
          diamond(cx, cy, iso.tw * 0.9, iso.th * 0.9);
          ctx.fill();
          text('✕', cx, cy + 5, 16, '#a55', 'center');
          text(inst.label, cx, cy + 18, 9, '#866', 'center');
          return;
        }
        if (inst.type === 'pump') {
          const c = [92, 142, 200];
          const b = box(inst.x, inst.y, 0.4, 16, shade(c, 1), shade(c, 0.72), shade(c, 0.5));
          const target = snap.gooPools.find((g) => g.id === inst.targetPoolId && !g.closed);
          if (target) {
            pipe(b.cx, b.topY,
              tileX(target.x, target.y), tileY(target.x, target.y) + iso.th / 2,
              snap.derived.dry ? 0.05 : sim.config.defensePump.flowPerMonth,
              snap.derived.dry ? 'rgba(120,120,130,0.7)' : 'rgba(87,167,232,0.85)', 34);
          }
          text(inst.overrun ? 'pump (swallowed!)' : target ? 'pump' : 'pump (idle)',
            b.cx, b.topY - 4, 10, inst.overrun ? '#f88' : '#9cf', 'center');
          hitRects.push({
            x: b.cx - iso.tw * 0.3, y: b.topY - 8, w: iso.tw * 0.6, h: b.cy - b.topY + 16,
            kind: 'asset', id: inst.id,
          });
          return;
        }
        const c = PALETTE[inst.type] ?? [150, 150, 150];
        const base = inst.type === 'car' ? 14 : 22;
        const h = base + 46 * inst.fill;
        const shake = inst.overrun ? Math.sin(snap.month * 90) * 3 : 0;
        ctx.save();
        ctx.translate(shake, 0);
        const b = box(inst.x, inst.y, inst.type === 'car' ? 0.5 : 0.68, h,
          shade(c, 1), shade(c, 0.72), shade(c, 0.5));
        if (inst.overrun) {
          ctx.strokeStyle = '#f55';
          diamond(b.cx, b.cy, iso.tw, iso.th);
          ctx.stroke();
        }
        text(`${inst.label} ${inst.value.toFixed(1)}`, b.cx, b.topY - 4, 11, '#eee', 'center');
        if (inst.gooOwed > 0) {
          text(`owes ${inst.gooOwed.toFixed(1)}`, b.cx, b.topY - 16, 10,
            inst.value < inst.gooOwed ? '#f88' : '#cb8', 'center');
        }
        if (inst.income) {
          const tag = inst.income.kind === 'fixed'
            ? `+${inst.income.rate}/mo`
            : inst.income.valve === 'reinvest' ? '⟳ reinvest' : '→ consume';
          text(tag, b.cx, b.topY - 28, 10, inst.income.kind === 'fixed' || inst.income.valve === 'consume' ? '#8cf' : '#8e8', 'center');
        }
        ctx.restore();
        hitRects.push({
          x: b.cx - iso.tw / 2, y: b.topY - 10, w: iso.tw, h: b.cy - b.topY + 20,
          kind: 'asset', id: inst.id,
        });
      },
    });
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) d.draw();

  // --- flow layer: EVERY rate is a marching pipe. Water flows blue into
  // and out of the pond; buildings emit their goo obligation visibly. ---
  {
    const WATERP = 'rgba(87,167,232,0.85)';
    const OUTP = 'rgba(190,140,80,0.85)';
    const pcx = tileX(snap.main.x, snap.main.y);
    const pcy = tileY(snap.main.x, snap.main.y) + iso.th / 2;

    // outside-world pipes: job pours in from the west edge; expenses drain
    // out toward it
    let edgeY = pcy - 70;
    for (const p of snap.pumps) {
      if (!p.enabled || p.kind !== 'income') continue;
      pipe(20, edgeY, pcx - 8, pcy - 6, p.rate, WATERP, 36);
      text(`${p.label} +${p.rate.toFixed(1)}`, 22, edgeY - 8, 10, '#7ab');
      edgeY -= 30;
    }
    let exY = pcy + 46;
    for (const p of snap.pumps) {
      if (!p.enabled || p.kind !== 'expense') continue;
      pipe(pcx - 8, pcy + 8, 20, exY, p.rate, OUTP, -18);
      text(`${p.label} −${p.rate.toFixed(1)}`, 22, exY + 12, 10, '#b96');
      exY += 30;
    }

    for (const inst of snap.instruments) {
      if (inst.destroyed || inst.sold) continue;
      const bx = tileX(inst.x, inst.y);
      const by = tileY(inst.x, inst.y) + iso.th / 2 - 28;
      if (inst.income && inst.income.kind === 'fixed' && !inst.overrun) {
        pipe(bx, by, pcx, pcy - 6, inst.income.rate, WATERP, 46); // rent home
      }
      if (inst.income && inst.income.kind === 'selffeed') {
        const stream = inst.income.feedRate * inst.value;
        if (inst.income.valve === 'consume') {
          pipe(bx, by, pcx, pcy - 6, stream, WATERP, 46); // drawn off to live on
        } else if (stream > 1e-6) {
          // reinvest: the compounding loop, visibly spinning on itself
          ctx.strokeStyle = WATERP;
          ctx.lineWidth = Math.min(5, 1 + 2 * Math.sqrt(stream));
          ctx.setLineDash([6, 5]);
          ctx.lineDashOffset = -flowClock * 40;
          ctx.beginPath();
          ctx.arc(bx, by - 14, 11, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
        }
      }
    }

    // goo emission: each financed building visibly feeds its own pool at
    // the pool's growth rate (compounding + any permanent trickle)
    for (const p of snap.gooPools) {
      if (p.closed || !p.sourceId) continue;
      const src = snap.instruments.find(
        (i) => i.id === p.sourceId && !i.destroyed && !i.sold
      );
      if (!src) continue;
      const rate = p.spreadRate * p.volume + p.inflow;
      const heat = Math.min(1, p.spreadRate / 0.05);
      pipe(
        tileX(src.x, src.y), tileY(src.x, src.y) + iso.th / 2 - 12,
        tileX(p.x, p.y), tileY(p.x, p.y) + iso.th / 2 - 4,
        rate, `rgba(${mixc(GOO_SLOW, GOO_FAST, heat).join(',')},0.8)`, 26
      );
    }
  }

  // --- hover tile highlight (on top so it never disappears) ---
  if (hoverTile) {
    const cx = tileX(hoverTile.x, hoverTile.y), cy = tileY(hoverTile.x, hoverTile.y) + iso.th / 2;
    const blocked =
      (hoverTile.x === snap.main.x && hoverTile.y === snap.main.y) ||
      snap.instruments.some((i) => !i.destroyed && !i.sold && i.x === hoverTile.x && i.y === hoverTile.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = blocked ? '#e05555' : '#ffe066';
    diamond(cx, cy, iso.tw, iso.th);
    ctx.stroke();
    ctx.fillStyle = blocked ? 'rgba(224,85,85,0.15)' : 'rgba(255,224,102,0.15)';
    ctx.fill();
    ctx.lineWidth = 1;
    text(`${hoverTile.x},${hoverTile.y}`, cx, cy - iso.th, 10, '#ffe066', 'center');
  }

  // --- HUD ---
  {
    const d = snap.derived;
    const up = d.netFlow > 1e-9, down = d.netFlow < -1e-9;
    ctx.fillStyle = 'rgba(10,14,12,0.85)';
    ctx.fillRect(0, 0, 360, 132);
    text(`month ${snap.month.toFixed(1)}   seed ${seed}   ${paused ? 'PAUSED' : `x${timeScale}`}`, 12, 20, 12, '#889');
    const flowCol = up ? '#5c5' : down ? '#d55' : '#aaa';
    text(`NET FLOW ${d.netFlow >= 0 ? '+' : ''}${d.netFlow.toFixed(2)}/mo ${up ? '▲' : down ? '▼' : '—'}`, 12, 48, 22, flowCol);
    text(`in ${d.income.toFixed(2)}  out ${d.expenses.toFixed(2)}  spray ${d.sprayRate.toFixed(2)}  pump ${d.pumpRate.toFixed(2)}  seam ${d.seamRate.toFixed(2)}${d.dry ? '  DRY!' : ''}`, 12, 70, 11, '#999');
    if (d.runwayMonths !== Infinity) text(`runway ${d.runwayMonths.toFixed(0)} months`, 12, 92, 14, '#d90');
    else text('getting ahead', 12, 92, 14, '#5a5');
    text(`wealth flow ${d.wealthFlow >= 0 ? '+' : ''}${d.wealthFlow.toFixed(2)}/mo   total goo ${d.totalGoo.toFixed(1)}`, 12, 112, 12, '#889');
  }

  // --- pumps summary (income/expense arrows are abstract now) ---
  {
    let py = 150;
    text('pumps', 12, py, 12, '#789');
    py += 16;
    for (const p of snap.pumps) {
      if (!p.enabled) continue;
      const sign = p.kind === 'income' ? '+' : '−';
      text(`${sign}${p.rate.toFixed(1)} ${p.label}`, 12, py, 11, p.kind === 'income' ? '#7ab' : '#b96');
      py += 14;
    }
  }

  // --- events ---
  text('events', W - 200, 20, 12, '#888');
  snap.events.slice(-14).forEach((e, i) => {
    text(`${e.month.toFixed(0)} ${e.type}${e.label ? ' ' + e.label : ''}`, W - 200, 38 + i * 15, 10, '#777');
  });

  // --- side menu: legible, grouped controls ---
  {
    const sections = [
      ['BUILD on highlighted tile', [
        ['R', 'rental — 30 cash, +1.2/mo'],
        ['H', 'house — mortgaged (goo!)'],
        ['C', 'car — financed (goo!)'],
        ['I', 'invest 5 into the ⟳ tower'],
        ['P', 'defense pump 5 — auto-sprays'],
      ]],
      ['FIGHT GOO (always 1:1)', [
        ['click', 'goo blob: deploy fireman'],
        ['shift+clk', 'goo blob: recall one'],
        ['—', 'goo on pond eats itself 1:1'],
      ]],
      ['MONEY', [
        ['L', 'bank loan +10 (slow goo)'],
        ['D', 'draw credit +5 (FAST goo)'],
        ['X', 'cut lifestyle expense'],
      ]],
      ['MANAGE', [
        ['click', 'investment: flip valve'],
        ['alt+clk', 'asset: sell at value'],
        ['space', 'pause'],
        ['[ ]', 'time speed'],
        ['0 / N', 'restart / new seed'],
      ]],
    ];
    const px = 12;
    let py = 250;
    const pw = 250;
    const ph = sections.reduce((s, [, items]) => s + 26 + items.length * 19, 0) + 14;
    ctx.fillStyle = 'rgba(10,14,12,0.85)';
    ctx.fillRect(0, py - 18, pw + px, ph);
    for (const [title, items] of sections) {
      text(title, px, py, 12, '#8aa');
      py += 21;
      for (const [k, desc] of items) {
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        const kw = Math.max(26, k.length * 8 + 10);
        ctx.fillRect(px, py - 12, kw, 16);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.strokeRect(px, py - 12, kw, 16);
        text(k, px + kw / 2, py, 11, '#ffe066', 'center');
        text(desc, px + kw + 8, py, 12, '#bcc');
        py += 19;
      }
      py += 5;
    }
  }

  // --- toast ---
  if (toast && performance.now() < toast.until) {
    text(toast.text, W / 2, H - 24, 14, '#ffe066', 'center');
  }
}

// ---- main loop ----
let last = performance.now();
function frame(now) {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    if (!paused) sim.advance(realDt * timeScale);
    draw(sim.snapshot());
  } catch (err) {
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    text(`readout error: ${err.message}`, 10, 30, 14, '#f66');
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
