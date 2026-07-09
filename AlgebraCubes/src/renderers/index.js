// The render boundary. Each renderer knows how to draw ONE leaf cube's value
// (drawLeaf); color comes from the shared typeColor (type only). The group
// container (parentheses) is drawn once, shared, recursing into the active
// renderer for its children — so a container looks consistent whatever the
// value style is. No renderer does any math; the engine never knows any of
// this exists.

import { CUBE, typeColor } from './colors.js';
import * as R from '../rational.js';

const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  for (const c of kids) if (c) e.appendChild(c);
  return e;
}
function text(s, attrs = {}) {
  const t = el('text', attrs);
  t.textContent = s;
  return t;
}

// value magnitude as int or stacked fraction, centered at (0,0)
function valueGlyph(coeff, ink, size = 26) {
  const a = R.abs(coeff);
  const g = el('g');
  if (a.d === 1n) {
    g.appendChild(text(String(a.n), {
      x: 0, y: size * 0.35, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 700, fill: ink,
    }));
  } else {
    g.appendChild(text(String(a.n), {
      x: 0, y: -3, 'text-anchor': 'middle', 'font-size': size * 0.6, 'font-weight': 700, fill: ink,
    }));
    g.appendChild(el('line', { x1: -size * 0.32, y1: 1, x2: size * 0.32, y2: 1, stroke: ink, 'stroke-width': 2 }));
    g.appendChild(text(String(a.d), {
      x: 0, y: size * 0.62, 'text-anchor': 'middle', 'font-size': size * 0.6, 'font-weight': 700, fill: ink,
    }));
  }
  return g;
}

function cubeRect(c, s = 1, fillOverride) {
  const e = CUBE * s;
  return el('rect', {
    x: -e / 2, y: -e / 2, width: e, height: e, rx: 10 * s,
    fill: fillOverride ?? c.fill, stroke: c.stroke, 'stroke-width': 2.5 * s,
  });
}

// ---- three leaf renderers ----

export const FaceNumeral = {
  name: 'Face',
  drawLeaf(term, g, s = 1) {
    const c = typeColor(term);
    g.appendChild(cubeRect(c, s));
    const vg = valueGlyph(term.coeff, c.ink, 26 * s);
    g.appendChild(vg);
  },
};

export const Pips = {
  name: 'Pips',
  drawLeaf(term, g, s = 1) {
    const c = typeColor(term);
    g.appendChild(cubeRect(c, s));
    const a = R.abs(term.coeff);
    const n = a.d === 1n ? Number(a.n) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 12) {
      const cols = Math.min(3, n);
      const rows = Math.ceil(n / cols);
      const gap = 15 * s;
      for (let i = 0; i < n; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * gap;
        const y = (row - (rows - 1) / 2) * gap;
        g.appendChild(el('circle', { cx: x, cy: y, r: 4.5 * s, fill: c.ink }));
      }
    } else {
      // deliberate degradation: pips can't show fractions or big numbers
      g.appendChild(el('rect', {
        x: -CUBE * s * 0.4, y: -CUBE * s * 0.28, width: CUBE * s * 0.8, height: CUBE * s * 0.56,
        rx: 4, fill: 'none', stroke: '#c0392b', 'stroke-width': 2, 'stroke-dasharray': '4 3',
      }));
      g.appendChild(valueGlyph(term.coeff, '#c0392b', 20 * s));
    }
  },
};

export const SplitCube = {
  name: 'Split',
  drawLeaf(term, g, s = 1) {
    const c = typeColor(term);
    if (term.kind === 'const') {
      // a constant is just the value tile alone
      g.appendChild(cubeRect(c, s));
      g.appendChild(valueGlyph(term.coeff, c.ink, 26 * s));
      return;
    }
    // a variable: base cube; coefficient (if not 1) is a small tile fused on
    g.appendChild(cubeRect(c, s));
    if (!R.isOne(R.abs(term.coeff))) {
      const sub = el('g', { transform: `translate(${-CUBE * s * 0.36},${-CUBE * s * 0.36}) scale(${0.5})` });
      const cc = typeColor({ kind: 'const', varName: null });
      sub.appendChild(cubeRect(cc, s));
      sub.appendChild(valueGlyph(term.coeff, cc.ink, 26 * s));
      g.appendChild(sub);
    }
  },
};

export const RENDERERS = [FaceNumeral, Pips, SplitCube];

// ---- shared: render any term (leaf or group container) ----
export function renderTerm(renderer, term, g, s = 1) {
  while (g.firstChild) g.removeChild(g.firstChild);
  if (term.kind === 'group') {
    drawGroup(renderer, term, g, s);
  } else {
    renderer.drawLeaf(term, g, s);
  }
}

function drawGroup(renderer, group, g, s) {
  const cs = s * 0.72;
  const slot = CUBE * cs + 16;
  const n = group.terms.length;
  const innerW = n * slot;
  const h = CUBE * s + 16;
  // container box = the parentheses
  g.appendChild(el('rect', {
    x: -innerW / 2 - 18, y: -h / 2, width: innerW + 36, height: h, rx: 16,
    fill: 'rgba(245,240,228,0.75)', stroke: '#8a7f66', 'stroke-width': 2.5,
  }));
  // optional scalar coeff riding on the whole group
  if (!R.isOne(group.coeff)) {
    const badge = el('g', { transform: `translate(${-innerW / 2 - 40},0)` });
    const cc = typeColor({ kind: 'const', varName: null });
    badge.appendChild(cubeRect(cc, s * 0.6));
    badge.appendChild(valueGlyph(group.coeff, cc.ink, 26 * s * 0.6));
    g.appendChild(badge);
  }
  group.terms.forEach((t, i) => {
    const cx = -innerW / 2 + slot * (i + 0.5);
    if (i > 0 || R.isNeg(t.coeff)) {
      g.appendChild(text(R.isNeg(t.coeff) ? '−' : '+', {
        x: cx - slot / 2, y: 8 * s, 'text-anchor': 'middle', 'font-size': 24 * cs, fill: '#5a5040',
      }));
    }
    const cg = el('g', { transform: `translate(${cx},0)` });
    renderTerm(renderer, t, cg, cs);
    g.appendChild(cg);
  });
}

export { el, text };
