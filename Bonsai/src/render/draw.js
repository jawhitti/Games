// Pure drawing: given a tree state, ink it onto a 2D context. Sumi-e-ish —
// dark tapered wood, soft foliage pads at the tips. No sim logic here, so
// the same function draws the live tree and every frame of a timelapse.

import { seasonOf } from '../sim/config.js';

// Foliage sits in discrete PADS at the ends of bare branches (as on a real
// bonsai), not as a blob on every tip. Each season gives the pads a base
// tone and a lighter top-lit highlight.
const SEASON_PAD = {
  spring: { base: '#4c7a3a', hi: '#7fb45f' },
  summer: { base: '#3c6234', hi: '#5f9048' },
  autumn: { base: '#9a6a2c', hi: '#c8993f' },
  winter: null, // deciduous: bare in winter
};

// Cluster branch-end points (canvas space) into pads by proximity.
function clusterTips(pts, mergeDist) {
  const clusters = [];
  for (const p of pts) {
    let best = null, bestD = mergeDist;
    for (const c of clusters) {
      const d = Math.hypot(c.cx - p.x, c.cy - p.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) {
      best.pts.push(p);
      best.sx += p.x; best.sy += p.y;
      best.cx = best.sx / best.pts.length;
      best.cy = best.sy / best.pts.length;
    } else {
      clusters.push({ cx: p.x, cy: p.y, sx: p.x, sy: p.y, pts: [p] });
    }
  }
  return clusters;
}

// Draw one pad as a union of opaque circles (clean silhouette), then a
// smaller offset highlight layer for a lit, puffy look.
function drawPad(ctx, pts, puffR, base, hi) {
  ctx.fillStyle = base;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, puffR, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = hi;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x - puffR * 0.28, p.y - puffR * 0.34, puffR * 0.52, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawFoliagePads(ctx, tips, proj, day) {
  const pad = SEASON_PAD[seasonOf(day).name];
  if (!pad) return;
  const pts = tips.map((t) => ({ x: proj.X(t.x1), y: proj.Y(t.y1) }));
  // pad/puff sizes scale gently with the on-screen tree size
  const puffR = Math.max(6, Math.min(22, proj.scale * 2.6));
  const mergeDist = puffR * 2.1;
  const clusters = clusterTips(pts, mergeDist);
  // draw far (lower on screen = further pads) first for soft overlap
  clusters.sort((a, b) => b.cy - a.cy);
  for (const c of clusters) {
    if (c.pts.length < 2) {
      // a lone twig-end: a single small puff (keeps sparse areas honest)
      drawPad(ctx, c.pts, puffR * 0.7, pad.base, pad.hi);
    } else {
      drawPad(ctx, c.pts, puffR, pad.base, pad.hi);
    }
  }
}

export function drawTree(ctx, tree, { w, h, day = 0, selected = null } = {}) {
  ctx.clearRect(0, 0, w, h);

  // fit the tree to the lower-center of the canvas
  tree.recomputePositions();
  const segs = tree.state.segments;
  let maxY = 0, minX = 0, maxX = 0;
  for (const s of segs) {
    maxY = Math.max(maxY, s.y1, s.y0);
    minX = Math.min(minX, s.x1, s.x0);
    maxX = Math.max(maxX, s.x1, s.x0);
  }
  const treeH = Math.max(3, maxY);
  const treeW = Math.max(2, maxX - minX);
  const scale = Math.min((h * 0.8) / treeH, (w * 0.7) / treeW);
  const cx = w / 2 - ((minX + maxX) / 2) * scale;
  const groundY = h * 0.9;
  const X = (x) => cx + x * scale;
  const Y = (y) => groundY - y * scale;

  // ground line
  ctx.strokeStyle = 'rgba(90,80,64,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  // wood — draw thick-to-thin so joins look continuous
  ctx.strokeStyle = '#3a2c20';
  ctx.lineCap = 'round';
  const ordered = [...segs].sort((a, b) => b.thickness - a.thickness);
  for (const s of ordered) {
    ctx.lineWidth = Math.max(1, s.thickness * scale * 2.2);
    ctx.beginPath();
    ctx.moveTo(X(s.x0), Y(s.y0));
    ctx.lineTo(X(s.x1), Y(s.y1));
    ctx.stroke();
  }

  // foliage as discrete pads at the branch ends (skip in winter)
  drawFoliagePads(ctx, segs.filter((s) => s.isTip), { X, Y, scale }, day);

  // selection ring
  if (selected != null) {
    const s = tree.state.byId.get(selected);
    if (s) {
      ctx.strokeStyle = '#c0492b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(s.x1), Y(s.y1), 9, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }

  return { X, Y, scale };
}

// hit test: nearest segment tip-end to a canvas point, within radius
export function pickSegment(tree, px, py, proj, maxDist = 18) {
  let best = null, bestD = maxDist;
  for (const s of tree.state.segments) {
    const d = Math.hypot(proj.X(s.x1) - px, proj.Y(s.y1) - py);
    if (d < bestD) { bestD = d; best = s.id; }
  }
  return best;
}
