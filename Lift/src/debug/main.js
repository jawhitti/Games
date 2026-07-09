// Crude debug readout: gray circles + numbers. This is NOT the real UI —
// it exists to watch a session unfold and verify the loop and the scale math.

import { createSim } from '../sim/sim.js';

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed')) || 1;
let sim = createSim({ seed });

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let paused = false;
let timeScale = 1;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---- layout ----
const mapPane = () => {
  const s = Math.min(canvas.width * 0.34, canvas.height * 0.5) - 20;
  return { x: canvas.width - s - 14, y: 14, s };
};

// ---- input ----
canvas.addEventListener('click', (e) => {
  const m = mapPane();
  const { mapSize } = sim.config.rain;
  if (e.offsetX >= m.x && e.offsetX <= m.x + m.s && e.offsetY >= m.y && e.offsetY <= m.y + m.s) {
    sim.actions.moveTo(((e.offsetX - m.x) / m.s) * mapSize, ((e.offsetY - m.y) / m.s) * mapSize);
  }
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { paused = !paused; e.preventDefault(); }
  else if (k === '[') timeScale = Math.max(0.25, timeScale / 2);
  else if (k === ']') timeScale = Math.min(16, timeScale * 2);
  else if (k === 'b') sim.actions.acquireBalloon();
  else if (k === 'p') sim.actions.addPassenger();
  else if (k === 'f') sim.actions.addPassenger({ financed: true });
  else if (k === 'd') sim.actions.addPassenger({ financed: true, depreciating: true });
  else if (k === 'c') {
    // Crew for the worst active entropy kind.
    const snap = sim.snapshot();
    const worst = Object.entries(snap.entropy)
      .filter(([, v]) => v.active)
      .sort((a, b) => b[1].level - a[1].level)[0];
    if (worst) sim.actions.addCrew(worst[0]);
  } else if (k === 'x') {
    // Shed the heaviest creature (the triage action).
    const heaviest = [...sim.snapshot().creatures].sort(
      (a, b) => b.effectiveWeight - a.effectiveWeight
    )[0];
    if (heaviest) sim.actions.shedCreature(heaviest.id);
  } else if (k >= '1' && k <= '5') {
    const b = sim.state.balloons[Number(k) - 1];
    if (b) sim.actions.swapBalloon(b.id);
  } else if (k === 'r') sim = createSim({ seed });
  else if (k === 'n') { seed = (Math.random() * 1e9) | 0; sim = createSim({ seed }); }
});

// ---- drawing helpers ----
function text(str, x, y, size = 13, color = '#bbb') {
  ctx.fillStyle = color;
  ctx.font = `${size}px monospace`;
  ctx.fillText(str, x, y);
}

function sci(logV) {
  // scientific notation straight from log-volume; safe at any magnitude
  if (logV === -Infinity) return '0';
  const e10 = logV / Math.LN10;
  const exp = Math.floor(e10);
  const mant = Math.pow(10, e10 - exp);
  return `${mant.toFixed(2)}e${exp >= 0 ? '+' : ''}${exp}`;
}

function fmt(x, d = 3) {
  return Number.isFinite(x) ? x.toFixed(d) : '—';
}

// ---- render ----
function draw(snap) {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  // sky: blue, thinning toward space as you climb into the tens of miles
  const viewW = W * 0.62;
  const ALT_PER_MILE = 100;
  const hMiles = Math.max(0.03, snap.altitude / ALT_PER_MILE);
  const spaceT = Math.min(1, hMiles / 60);
  const mixc = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * t);
  const rgbc = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const skyTop = mixc([88, 150, 214], [10, 12, 26], spaceT);
  const skyHorizon = mixc([170, 208, 236], [24, 28, 46], spaceT);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, rgbc(skyTop));
  skyGrad.addColorStop(1, rgbc(skyHorizon));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, viewW, H);

  // --- sky view (left): camera follows the rig and zooms to fit it ---
  const centerY = H * 0.45;
  // World units are altitude units. A balloon's TRUE radius grows as
  // volume^(1/3) = exp(logVolume/3); the camera zooms out just enough to
  // keep the whole rig in frame. So the balloon visibly expands early, and
  // once it fills its budget the gondola, creatures, and altitude grid —
  // all fixed world size — shrink past it instead. Vastness by contrast.
  const R0 = 12; // world radius of a volume-1 balloon
  const GONDOLA_GAP = 15; // world gap between gondola and balloon bottoms
  const radii = snap.balloons.map((b) => R0 * Math.exp(b.logVolume / 3));
  const maxR = Math.max(R0, ...radii);
  const baseZoom = H / 260; // px per world unit, fully zoomed in
  const zoom = Math.min(baseZoom, (0.43 * H) / (GONDOLA_GAP + 2 * maxR));
  // Rig locks to screen center, except near the ground, where the camera
  // clamps so the ground sits at the bottom of the frame.
  const camAlt = Math.max(snap.altitude, (H - 40 - centerY) / zoom);
  const altY = (a) => centerY + (camAlt - a) * zoom;
  const rigX = W * 0.31;
  const rigY = altY(snap.altitude);

  // --- earth: perspective checkerboard of 1-mile squares ---
  // 1 map unit = 1 mile; ALT_PER_MILE altitude units = 1 mile of height.
  // Eye level is the rig. A scanline dy pixels below it sees ground at
  // distance d = h*f/dy, so climbing shrinks every square and descending
  // swells them; flying across the map scrolls the board underfoot.
  {
    const f = H * 0.9; // focal length in px
    const h = hMiles; // miles up
    const horizonY = Math.round(rigY) + 6;
    const camX = snap.rig.x;
    const camZ = snap.rig.y;
    // fog color = the sky's horizon color, so board and sky meet seamlessly
    const A = [58, 148, 52], B = [116, 200, 80], FOG = skyHorizon;
    const vis = 25 + 15 * h; // visibility (miles); haze range grows with height
    const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    const mix = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * t);
    ctx.fillStyle = rgb(FOG); // horizon haze line
    ctx.fillRect(0, horizonY, viewW, 1);
    for (let y = horizonY + 1; y < H; y += 2) {
      const d = (h * f) / (y - horizonY); // miles out at this scanline
      const milesPerPx = d / f;
      const sqPx = 1 / milesPerPx; // px per mile-square at this row
      const fog = 1 - Math.exp(-d / vis);
      if (sqPx < 5) {
        // squares near-subpixel: flat haze row
        ctx.fillStyle = rgb(mix(mix(A, B, 0.5), FOG, fog));
        ctx.fillRect(0, y, viewW, 2);
        continue;
      }
      const zOdd = Math.floor(camZ + d) & 1;
      const ca = rgb(mix(A, FOG, fog));
      const cb = rgb(mix(B, FOG, fog));
      let wx = camX + (0 - rigX) * milesPerPx; // world-mile at screen x=0
      let x = 0;
      while (x < viewW) {
        const cell = Math.floor(wx);
        const nx = Math.min(viewW, x + (cell + 1 - wx) / milesPerPx);
        ctx.fillStyle = (cell + zOdd) & 1 ? ca : cb;
        ctx.fillRect(x, y, nx - x, 2);
        wx = cell + 1;
        x = nx;
      }
    }
  }

  // altitude ruler: gridlines at a nice step, scrolling with the camera
  {
    const maxA = camAlt + centerY / zoom;
    const minA = Math.max(0, camAlt - (H - centerY) / zoom);
    const raw = 90 / zoom; // aim for ~90px between lines
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    for (let a = Math.ceil(minA / step) * step; a <= maxA; a += step) {
      const y = altY(a);
      if (y >= rigY) continue; // the earth checkerboard owns the space below
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
      ctx.stroke();
      text(String(Math.round(a)), 4, y - 3, 10, 'rgba(0,0,30,0.5)');
    }
  }

  // rig: balloons laid out side by side at true relative scale
  const gap = 6; // world units between balloons
  const rowW =
    radii.reduce((s, r) => s + 2 * r, 0) + gap * Math.max(0, radii.length - 1);
  let cursor = -rowW / 2;
  snap.balloons.forEach((b, i) => {
    const r = radii[i];
    const bx = rigX + (cursor + r) * zoom;
    const by = rigY - (GONDOLA_GAP + r) * zoom;
    cursor += 2 * r + gap;
    const rpx = Math.max(2, r * zoom);
    ctx.fillStyle = '#d0342c';
    ctx.beginPath();
    ctx.arc(bx, by, rpx, 0, 2 * Math.PI);
    ctx.fill();
    // tether
    ctx.strokeStyle = 'rgba(40,20,10,0.5)';
    ctx.beginPath();
    ctx.moveTo(bx, by + rpx);
    ctx.lineTo(rigX, rigY);
    ctx.stroke();
    if (rpx > 8) text(`${i + 1}`, bx - 3, by + 4, 11, '#fff');
    text(sci(b.logVolume), bx - 24, by - rpx - 6, 10, 'rgba(0,0,30,0.55)');
  });

  // gondola + creatures at fixed WORLD size — they shrink as the camera
  // pulls back to hold the balloon. That shrinking IS the size cue.
  ctx.fillStyle = '#8a5a32';
  ctx.fillRect(rigX - 5 * zoom, rigY, 10 * zoom, 4 * zoom);
  snap.creatures.forEach((c, i) => {
    const cx = rigX + (-5 + (i % 6) * 3.5) * zoom;
    const cy = rigY + (6 + Math.floor(i / 6) * 3.5) * zoom;
    ctx.fillStyle = c.kind === 'crew' ? '#6a6' : '#a86';
    ctx.fillRect(cx, cy, 3 * zoom, 3 * zoom);
  });

  // vertical-speed chevrons beside the rig: stacked up-arrows climbing,
  // stacked down-arrows sinking; more chevrons = faster
  {
    const vr = snap.derived.verticalRate;
    if (Math.abs(vr) > 0.5) {
      const up = vr > 0;
      const count = Math.min(4, 1 + Math.floor(Math.abs(vr) / 25));
      const ix = rigX + Math.max(36, 7 * zoom);
      for (let i = 0; i < count; i++) {
        const iy = rigY + (up ? -6 - i * 13 : 10 + i * 13);
        ctx.fillStyle = up ? 'rgba(255,255,255,0.95)' : 'rgba(165,20,10,0.95)';
        ctx.beginPath();
        ctx.moveTo(ix, up ? iy - 9 : iy + 9);
        ctx.lineTo(ix - 8, iy);
        ctx.lineTo(ix + 8, iy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // rain streaks above the rig
  if (snap.derived.rainInflow > 0) {
    const topY = rigY - (GONDOLA_GAP + 2 * maxR) * zoom - 30;
    ctx.strokeStyle = 'rgba(30,60,140,0.55)';
    for (let i = 0; i < 12; i++) {
      const rx = rigX - 60 + i * 11;
      ctx.beginPath();
      ctx.moveTo(rx, topY);
      ctx.lineTo(rx - 4, topY + 20);
      ctx.stroke();
    }
  }

  // --- stats (top left, on a backing panel over the sky) ---
  ctx.fillStyle = 'rgba(17,17,17,0.65)';
  ctx.fillRect(0, 0, 480, 122);
  const lines = [
    `month ${snap.month.toFixed(1)}   seed ${seed}   ${paused ? 'PAUSED' : `x${timeScale}`}`,
    `altitude ${snap.altitude.toFixed(1)}  ` +
      `${snap.derived.verticalRate > 0.5 ? '^' : snap.derived.verticalRate < -0.5 ? 'v' : '-'} ` +
      `${snap.derived.verticalRate >= 0 ? '+' : ''}${snap.derived.verticalRate.toFixed(1)}/mo` +
      `${snap.grounded ? '  GROUNDED' : ''}`,
    `fleet volume ${sci(snap.derived.logTotalVolume)}  (log ${fmt(snap.derived.logTotalVolume, 2)})`,
    `lift ${fmt(snap.derived.totalLift)}   load ${fmt(snap.derived.totalLoad)}   surplus ${fmt(snap.derived.surplus)}`,
    `rain ${fmt(snap.derived.rainInflow, 2)}   speed ${fmt(snap.derived.speed, 2)}`,
    `creatures ${snap.creatures.length}  (crew ${snap.creatures.filter((c) => c.kind === 'crew').length})`,
  ];
  lines.forEach((l, i) => text(l, 10, 22 + i * 17));

  // --- entropy bars (bottom left, on a backing panel over the earth) ---
  ctx.fillStyle = 'rgba(17,17,17,0.75)';
  ctx.fillRect(0, H - 142, 560, 142);
  let ey = H - 120;
  text('entropy', 10, ey - 8, 12, '#888');
  for (const [id, e] of Object.entries(snap.entropy)) {
    if (!e.active) {
      text(`${id} (locked)`, 10, ey + 11, 11, '#444');
    } else {
      const w = Math.min(200, e.level * 20);
      ctx.fillStyle = e.accrual > e.cleaning ? '#a55' : '#575';
      ctx.fillRect(70, ey, w, 12);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(70, ey, 200, 12);
      text(id, 10, ey + 11, 11);
      text(
        `${e.level.toFixed(2)}  in ${(e.accrual ?? 0).toFixed(3)}/mo vs out ${(e.cleaning ?? 0).toFixed(3)}/mo`,
        280, ey + 11, 11, '#777'
      );
    }
    ey += 20;
  }

  // --- map (top right) ---
  const m = mapPane();
  const { mapSize } = sim.config.rain;
  ctx.strokeStyle = '#444';
  ctx.strokeRect(m.x, m.y, m.s, m.s);
  const mx = (x) => m.x + (x / mapSize) * m.s;
  const my = (y) => m.y + (y / mapSize) * m.s;
  for (const r of snap.regions) {
    ctx.beginPath();
    ctx.arc(mx(r.x), my(r.y), (r.radius / mapSize) * m.s, 0, 2 * Math.PI);
    if (r.dry) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#445';
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = `rgba(90,110,160,${0.15 + r.intensity})`;
      ctx.fill();
    }
  }
  if (snap.rig.tx !== null) {
    ctx.strokeStyle = '#666';
    ctx.beginPath();
    ctx.moveTo(mx(snap.rig.x), my(snap.rig.y));
    ctx.lineTo(mx(snap.rig.tx), my(snap.rig.ty));
    ctx.stroke();
  }
  ctx.fillStyle = '#ddd';
  ctx.beginPath();
  ctx.arc(mx(snap.rig.x), my(snap.rig.y), 4, 0, 2 * Math.PI);
  ctx.fill();
  text('map (click to fly)', m.x, m.y + m.s + 14, 11, '#666');

  // --- events (right, under map) ---
  const evY = m.y + m.s + 34;
  text('events', m.x, evY, 12, '#888');
  snap.events.slice(-10).forEach((e, i) => {
    const detail =
      e.type === 'pop' ? ` balloon ${e.id}` :
      e.type === 'ground' ? ` lost ${e.creaturesLost} creatures` :
      e.type === 'balloon-swapped' ? ` lost logV ${e.logVolumeLost.toFixed(1)}` :
      e.type === 'crew-left' ? ` (${e.entropyKind})` : '';
    text(`${e.month.toFixed(1)} ${e.type}${detail}`, m.x, evY + 16 + i * 14, 11, '#777');
  });

  // --- help ---
  text(
    '[b]alloon  [1-5] swap  [p]assenger  [f]inanced  [d]epreciating  [c]rew  [x] shed  [space] pause  [ ] speed  [r]estart [n]ew seed',
    10, H - 8, 11, '#555'
  );
}

// ---- main loop: fixed-timestep sim, free-running render ----
let last = performance.now();
function frame(now) {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    if (!paused) sim.advance(realDt * timeScale);
    draw(sim.snapshot());
  } catch (err) {
    // Never die silently: a readout bug should read as a readout bug.
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    text(`readout error: ${err.message}`, 10, 30, 14, '#f66');
    text('(sim may still be fine — check the console)', 10, 50, 12, '#a66');
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
