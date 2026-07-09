// UI: every token is its own cube — numbers, variables, and operators
// (+ − × =). You manipulate by DRAGGING a term: drag it across the = and its
// sign flips (crossEquals); drop it onto a like term to combine (gather).
// The engine stays pure; this layer only lays out cubes and turns drags into
// engine calls. Color encodes type: x red, y green, numbers slate, ops gray.

import {
  varTerm, constTerm, groupTerm, createSession, crossEquals, gather, addBoth, addTermBoth, negateBoth, appendTerm,
  wrapBoth, distributeAll, combineAll, simplifyAll, needsSettle, hasGroup, hasNaN, isSolved, areLike, getTerm,
  negateTermById, invertTermById,
} from './engine.js';

const IN_STRIP = (y) => y >= -158 && y <= -100; // the editor strip's y-band

const TARGET = 'x'; // the goal: isolate x, alone, on EITHER side (x = 5 or 5 = x)
import * as R from './rational.js';

// starting equation: 2x + 7 = 3x + 2  →  solves to x = 5
// (x now lives on BOTH sides: cross the 3x → −x + 7 = 2, cross the 7 →
//  −x = −5, then ×(−1) → x = 5)
function startEquation() {
  return {
    left: [varTerm('x1', 'x', R.rat(2)), constTerm('c1', R.rat(7))],
    right: [varTerm('x2', 'x', R.rat(3)), constTerm('c2', R.rat(2))],
  };
}

const session = createSession(startEquation());

const SVGNS = 'http://www.w3.org/2000/svg';
const CUBE = 56, GAP = 12; // uniform spacing between every cube
const stage = document.getElementById('stage');
const trayLayer = document.createElementNS(SVGNS, 'g'); // left palette (static)
const stagingLayer = document.createElementNS(SVGNS, 'g'); // the expression being built
const historyLayer = document.createElementNS(SVGNS, 'g'); // previous rows, stacked below
const layer = document.createElementNS(SVGNS, 'g'); // current equation (cleared each render)
stage.appendChild(trayLayer);
stage.appendChild(stagingLayer);
stage.appendChild(historyLayer);
stage.appendChild(layer);
let uidc = 0;
const newId = () => `u${++uidc}`;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  for (const c of kids) if (c) e.appendChild(c);
  return e;
}
function text(s, attrs = {}) { const t = el('text', attrs); t.textContent = s; return t; }

// a small white corner dot encoding a value's sign & inverse:
//   right/left = positive/negative,  up/down = normal/reciprocal
function drawDot(inner, size, neg, inv) {
  const off = size * 0.34;
  inner.appendChild(el('circle', {
    cx: neg ? -off : off, cy: inv ? off : -off, r: size * 0.088,
    fill: '#fff', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1, 'pointer-events': 'none',
  }));
}

// every cube is bright — no gray, no black. color still encodes type, and
// each operator gets its own hue so the eye learns them.
const VAR_COLOR = { x: '#e23b32', y: '#2fa84f', z: '#8e44ec' };
const OP_COLOR = {
  '+': '#f08a24', '−': '#f08a24', '×': '#f08a24', '/': '#f08a24', // all operators — orange
  '(': '#e0a44b', ')': '#e0a44b',   // parentheses — gold
};
// THE RENDER BOUNDARY under test: the engine works in 0-9 / x / y; only this
// map changes how a value LOOKS. Meaning is preserved — [🌸][🐶] is still 12
// (positional), 😀 is still x. Operators keep their symbols.
const DIGIT_EMOJI = {
  '0': '🥚', '1': '🌸', '2': '🐶', '3': '🐱', '4': '🦊',
  '5': '🐢', '6': '🐸', '7': '🦉', '8': '🐙', '9': '🦄',
};
const VAR_EMOJI = { x: '☀️', y: '🌙' }; // independent sun, dependent moon
const OP_EMOJI = {
  '+': '🤝', // add — bring together
  '−': '✂️', // subtract — cut away
  '×': '🐇', // multiply — like rabbits
  '/': '🍕', // divide — share into slices
};
function displayGlyph(tok) {
  if (tok.k === 'num') return DIGIT_EMOJI[tok.t] ?? tok.t;
  if (tok.k === 'var') return VAR_EMOJI[tok.t] ?? tok.t;
  if (tok.k === 'op') return OP_EMOJI[tok.t] ?? tok.t; // parens keep their glyph
  if (tok.k === 'eq') return '⚖️'; // equality — both sides weigh the same
  if (tok.k === 'nan') return '💥'; // divide-by-zero
  return tok.t;
}

const white = (fill) => ({ fill, ink: '#fff' });
function cubeColor(tok) {
  if (tok.k === 'var') return white(VAR_COLOR[tok.t] ?? '#7a5bd0');
  if (tok.k === 'num') return white('#2f7fd6');       // numbers — blue
  if (tok.k === 'nan') return white('#d64545');       // NaN — alarm red
  if (tok.k === 'eq') return white('#18c93f');        // equals — bright green
  if (tok.k === 'op') return white(OP_COLOR[tok.t] ?? '#f08a24');
  return white('#2f7fd6');
}

// equation -> ordered token list. Every atom is a cube: numbers, variables,
// and operators (+ − × / ( ) =). Nothing is evaluated — a rational like 3/2
// is the three cubes [3][/][2]; multiplication is an [×] cube.

// Dots encode sign and inverse, so there are no − or / cubes in the equation:
//   neg  → dot moves LEFT   (positive = right)
//   inv  → dot moves DOWN   (normal   = up)   [denominator / reciprocal]
// one cube per digit; the whole number carries the flags on every digit.
//
// ADJACENCY MULTIPLIES — unless the neighbours are two SAME-ORIENTATION digits,
// which concatenate. So:
//   [2][x]        implicit × (2x)          — value touching a variable
//   n(…), )(…)    implicit ×               — value touching a paren
//   [2][5]        concatenate → 25         — both upright: positional numeral
//   [2⁻¹][5⁻¹]    concatenate → 1/25       — both inverted: denominator numeral
//   [2][2⁻¹]      multiply → 2 × ½ = 1     — DIFFERENT orientation ⇒ multiply
// An inverted digit is a reciprocal, so [3][2⁻¹] = 3 × ½ = 3/2 IS the fraction —
// numerator-run × (1/denominator-run). The only surviving × cube sits between
// two bare same-orientation numbers (2×3), so they can't be misread as 23.
function emitDigits(intVal, out, meta, neg = false, inv = false) {
  const s = String(intVal < 0n ? -intVal : intVal);
  for (const ch of s) out.push({ k: 'num', t: ch, neg, inv, ...meta, atomRole: 'num' });
}
// a magnitude (abs rational): numerator digits, then denominator digits marked
// inverse (a lower dot) — no [/] cube
function emitNumber(mag, out, meta, neg = false) {
  emitDigits(mag.n, out, meta, neg, false);
  if (mag.d !== 1n) emitDigits(mag.d, out, meta, false, true);
}

// one term's cubes (sign is handled by the caller as glue). meta.term is the
// TOP-level draggable term id, so every sub-cube drags the whole term.
function emitTerm(term, out, meta) {
  const neg = R.isNeg(term.coeff);
  const mag = R.abs(term.coeff);
  if (term.kind === 'const') {
    emitNumber(mag, out, meta, neg);
  } else if (term.kind === 'var') {
    if (R.isOne(mag)) {
      // bare ±x: the sign rides on the variable cube's dot
      out.push({ k: 'var', t: term.varName, neg, inv: false, ...meta, atomRole: 'var' });
    } else {
      emitNumber(mag, out, meta, neg); // coefficient carries the sign
      // no × cube: a value touching a variable multiplies by adjacency (2x).
      // Only value×value keeps an explicit ×, so 2 and 3 don't read as 23.
      out.push({ k: 'var', t: term.varName, neg: false, inv: false, ...meta, atomRole: 'var' });
    }
  } else if (term.kind === 'group') {
    const c = mag; // group coeff magnitude
    // a value touching a paren multiplies by adjacency: n(…), no × cube
    if (c.n !== 1n) emitDigits(c.n, out, meta, neg, false);
    out.push({ k: 'op', t: '(', ...meta, atomRole: 'op' });
    term.terms.forEach((ch, i) => {
      if (i > 0) out.push({ k: 'op', t: '+', ...meta, atomRole: 'op' }); // + connector; sign is on the dot
      emitTerm(ch, out, meta);
    });
    out.push({ k: 'op', t: ')', ...meta, atomRole: 'op' });
    // )[d⁻¹] — the reciprocal denominator multiplies the group by adjacency
    // (a paren touching a value), so no × cube here either
    if (c.d !== 1n) emitDigits(c.d, out, meta, false, true);
  }
}

// ---- lexical coefficient expressions (the unevaluated, candy-crush form) ----
// A CoeffExpr is an integer literal or a binary op over CoeffExprs. It renders
// literally (2/2 stays [2][/][2]) and only collapses when we simplify it.
const ci = (v) => ({ t: 'int', v: BigInt(v) });
const cbin = (op, a, b) => ({ t: 'bin', op, a, b });
const ratToExpr = (r) => (r.d === 1n ? ci(r.n) : cbin('/', ci(r.n), ci(r.d)));
function evalExpr(e) {
  if (e.t === 'int') return R.rat(e.v);
  const a = evalExpr(e.a), b = evalExpr(e.b);
  return e.op === '+' ? R.add(a, b) : e.op === '-' ? R.sub(a, b) : e.op === '*' ? R.mul(a, b) : R.div(a, b);
}
// pull the sign out so the term glue can show +/− and we render the magnitude
function splitSign(e) {
  if (e.t === 'int') return { neg: e.v < 0n, mag: ci(e.v < 0n ? -e.v : e.v) };
  if (e.op === '/' || e.op === '*') {
    const A = splitSign(e.a), B = splitSign(e.b);
    return { neg: A.neg !== B.neg, mag: cbin(e.op, A.mag, B.mag) };
  }
  return { neg: R.isNeg(evalExpr(e)), mag: e };
}
const isFrac = (e) => e.t === 'bin' && e.op === '/';
// render a lexical expr with dots: `neg` applies to the numerator; a / makes
// the denominator digits inverse (no − or / cubes)
function emitExpr(e, out, meta, neg = false) {
  if (e.t === 'int') { emitDigits(e.v, out, meta, neg || e.v < 0n, false); return; }
  // multiplying by 1 is identity: 1×k (or k×1) is just k, so 1·x renders as x
  if (e.op === '*') {
    if (e.a.t === 'int' && e.a.v === 1n) { emitExpr(e.b, out, meta, neg); return; }
    if (e.b.t === 'int' && e.b.v === 1n) { emitExpr(e.a, out, meta, neg); return; }
  }
  if (e.op === '/' && e.a.t === 'int' && e.b.t === 'int') {
    emitDigits(e.a.v, out, meta, neg || e.a.v < 0n, false);
    emitDigits(e.b.v, out, meta, false, true);
    return;
  }
  emitExpr(e.a, out, meta, neg);
  out.push({ k: 'op', t: e.op === '*' ? '×' : e.op, ...meta, atomRole: 'op' });
  emitExpr(e.b, out, meta);
}
// a term carrying a transient lexical `display` expression
function emitTermDisplay(term, out, meta) {
  const { neg, mag } = splitSign(term.display);
  if (term.kind === 'const') { emitExpr(mag, out, meta, neg); return; }
  if (mag.t === 'int' && mag.v === 1n) { out.push({ k: 'var', t: term.varName, neg, inv: false, ...meta, atomRole: 'var' }); return; }
  emitExpr(mag, out, meta, neg); // may keep a value×value × internally (2×3)
  // no × between the coefficient and the variable — adjacency multiplies
  out.push({ k: 'var', t: term.varName, neg: false, inv: false, ...meta, atomRole: 'var' });
}

function tokens(eq) {
  const out = [];
  const side = (arr, name) =>
    arr.forEach((term, i) => {
      if (term.kind === 'nan') { out.push({ k: 'nan', term: term.id, side: name }); return; }
      // + connector between terms only; a term's SIGN is shown by its dot,
      // never by a − cube (subtracting = adding a left-dotted term)
      if (i > 0) out.push({ k: 'op', t: '+', term: term.id, side: name, role: 'glue', atomRole: 'op' });
      if (term.display) emitTermDisplay(term, out, { term: term.id, side: name });
      else emitTerm(term, out, { term: term.id, side: name });
    });
  side(eq.left, 'left');
  out.push({ k: 'eq', t: '=', term: null });
  side(eq.right, 'right');
  return out;
}

// The UNEVALUATED distributed form: each group child becomes a loose term
// carrying `display = childCoeff op operand` (e.g. 3/2, 2/2, −5/2), shown for
// a beat before the engine's simplified result replaces it.
function distributeUneval(eq) {
  const expand = (side) => {
    const out = [];
    for (const t of side) {
      if (t.kind === 'group') {
        const c = t.coeff;
        const op = c.n === 1n ? '/' : c.d === 1n ? '*' : '/';
        const operand = c.n === 1n ? c.d : c.d === 1n ? c.n : c.d;
        for (const ch of t.terms) out.push({ ...ch, display: cbin(op, ratToExpr(ch.coeff), ci(operand)) });
      } else out.push(t);
    }
    return out;
  };
  return { left: expand(eq.left), right: expand(eq.right) };
}

// ---- audio ----
let actx = null;
const PITCH = { cross: 587, gather: 659, undo: 330, deny: 150, solved: 784, distribute: 698, simplify: 880, negate: 494, invert: 740 };
function chime(kind) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = kind === 'deny' ? 'sawtooth' : 'triangle';
    o.frequency.value = PITCH[kind] ?? 523;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'solved' ? 0.5 : 0.2));
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.55);
  } catch { /* audio optional */ }
}

// ---- layout + render ----
let terms = new Map(); // termId -> { cubes:[{g,ox}], cx, side }
let equalsX = 0;
let selectedEquation = false; // selected via clicking the = cube
let animating = false; // true during the show-expanded → simplify beat

// what's selected in the equation. role 'term' = the whole expression (you
// clicked an operator); 'num'/'var' = just that atom (you clicked a value or a
// variable). The flip buttons and a drag both act on this.
let selection = null; // { termId, role }
let selBoxEl = null;  // the drawn selection box, so a drag can carry it along
let selectedToks = []; // the exact cubes inside the selection (the grab unit)
let selDrag = null;   // dragging a COPY of the selection out into the editor
// Which cubes fall inside the current selection. An operator owns the WHOLE
// sub-expression it governs, never a stranded fragment:
//   • a top-level glue +  → the entire side (a·b + c, tap + → all of it)
//   • an in-term × / ( )  → just that term (the sub-tree it binds)
//   • an atom (value/var) → only itself
function inSelection(tok) {
  if (!selection || tok.term == null) return false;
  if (selection.kind === 'side') return tok.side === selection.side;
  if (selection.kind === 'term') return tok.term === selection.termId;
  return tok.term === selection.termId && tok.atomRole === selection.role; // atom
}
function selectionFor(tok) {
  if (tok.role === 'glue') return { kind: 'side', side: tok.side };      // top-level + connective
  if (tok.atomRole === 'op') return { kind: 'term', termId: tok.term };  // ×, ( ), group structure
  return { kind: 'atom', termId: tok.term, role: tok.atomRole };         // a value or a variable
}
function sameSelection(a, b) {
  return a.kind === b.kind && a.side === b.side && a.termId === b.termId && a.role === b.role;
}
function setSelection(tok) {
  if (!tok.term || tok.k === 'eq' || tok.k === 'nan') { clearSelection(); return; }
  const next = selectionFor(tok);
  selection = (selection && sameSelection(selection, next)) ? null : next; // tap again = clear
  render();
}
function clearSelection() { if (selection) { selection = null; render(); } }

function render(flourish = false) { renderEq(session.current(), flourish); }

function renderEq(eq, flourish = false) {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  const toks = tokens(eq);
  // x positions
  let x = 0;
  toks.forEach((tok, i) => {
    x += i === 0 ? 0 : GAP;
    tok.cx = x + CUBE / 2;
    x += CUBE;
  });
  const total = x;

  terms = new Map();
  const cubeEls = [];
  for (const tok of toks) {
    const cx = tok.cx - total / 2;
    if (tok.k === 'eq') equalsX = cx;
    const g = makeCube(tok, cx);
    layer.appendChild(g);
    cubeEls.push(g);
    if (tok.term) {
      if (!terms.has(tok.term)) terms.set(tok.term, { cubes: [], side: tok.side });
      terms.get(tok.term).cubes.push({ g, ox: cx });
    }
  }
  for (const info of terms.values()) {
    info.cx = info.cubes.reduce((a, c) => a + c.ox, 0) / info.cubes.length;
  }
  // selection box: a gold frame around the selected atom / expression
  selBoxEl = null; selectedToks = [];
  if (selection) {
    const sel = toks.filter(inSelection);
    if (sel.length) {
      selectedToks = sel; // the exact cubes to copy when the selection is dragged
      const xs = sel.map((t) => t.cx - total / 2);
      const minX = Math.min(...xs) - CUBE / 2, maxX = Math.max(...xs) + CUBE / 2;
      selBoxEl = el('rect', {
        x: minX - 8, y: -CUBE / 2 - 8, width: (maxX - minX) + 16, height: CUBE + 16, rx: 14,
        fill: 'rgba(224,180,75,0.16)', stroke: '#e0b020', 'stroke-width': 3, 'pointer-events': 'none',
      });
      layer.insertBefore(selBoxEl, layer.firstChild); // behind the cubes
    } else {
      selection = null; // the selected term is gone (combined/crossed away)
    }
  }
  if (flourish) flourishIn(cubeEls);
  if (isSolved(session.current(), TARGET)) {
    layer.appendChild(text('🎉', { x: 0, y: -56, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 34 }));
  }
  renderHistory();
}

// previous equation states stack below the current row — FULL size, faded
function renderHistory() {
  while (historyLayer.firstChild) historyLayer.removeChild(historyLayer.firstChild);
  const prev = session.list().slice(0, -1); // everything before the current row
  const show = prev.slice(-6);
  const rowH = CUBE + 20;
  historyLayer.appendChild(el('line', { x1: -460, y1: 46, x2: 460, y2: 46, stroke: '#d8cfb8', 'stroke-width': 1.5, 'stroke-dasharray': '4 5' }));
  for (let idx = show.length - 1, row = 0; idx >= 0; idx--, row++) {
    const eq = show[idx];
    const y = 84 + row * rowH;
    const opacity = Math.max(0.3, 0.85 - row * 0.11);
    const toks = tokens(eq);
    let x = 0;
    toks.forEach((tok, i) => { x += i === 0 ? 0 : GAP; tok.cx = x + CUBE / 2; x += CUBE; });
    const total = x;
    const rowG = el('g', { opacity });
    for (const tok of toks) {
      const g = makeCubeShape(tok, tok.cx - total / 2, y, CUBE);
      if (['num', 'var', 'op'].includes(tok.k)) {
        g.style.cursor = 'grab';
        g.addEventListener('pointerdown', (e) => { e.stopPropagation(); startCopyDrag(e, tok); });
      } else g.style.pointerEvents = 'none';
      rowG.appendChild(g);
    }
    historyLayer.appendChild(rowG);
  }
}

// cubes reassemble: scale + fade in with a small stagger — the flourish
function flourishIn(cubeEls) {
  cubeEls.forEach((g) => {
    const inner = g._inner;
    inner.style.transformBox = 'fill-box';
    inner.style.transformOrigin = 'center';
    inner.style.transition = 'none';
    inner.style.opacity = '0';
    inner.style.transform = 'scale(0.4)';
  });
  requestAnimationFrame(() => cubeEls.forEach((g, i) => {
    const inner = g._inner;
    inner.style.transition = 'opacity .28s ease, transform .3s cubic-bezier(.3,1.5,.5,1)';
    inner.style.transitionDelay = `${i * 0.025}s`;
    inner.style.opacity = '1';
    inner.style.transform = 'scale(1)';
  }));
}

function makeCube(tok, cx) {
  const c = cubeColor(tok);
  const g = el('g', { transform: `translate(${cx},0)` });
  const inner = el('g');
  g._inner = inner;
  const selRing = tok.k === 'eq' && selectedEquation;
  inner.appendChild(el('rect', {
    x: -CUBE / 2, y: -CUBE / 2, width: CUBE, height: CUBE, rx: 11,
    fill: c.fill, stroke: selRing ? '#e0b020' : 'rgba(0,0,0,0.25)', 'stroke-width': selRing ? 4 : 2,
  }));
  const glyph = text(displayGlyph(tok), {
    x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 32, 'font-weight': 700,
    fill: c.ink, 'font-family': 'system-ui', 'pointer-events': 'none',
  });
  if (tok.neg || tok.inv) glyph.setAttribute('transform', `scale(${tok.neg ? -1 : 1},${tok.inv ? -1 : 1})`);
  inner.appendChild(glyph);
  if (tok.k === 'num' || tok.k === 'var') drawDot(inner, CUBE, tok.neg, tok.inv);
  g.appendChild(inner);
  if (tok.term) {
    g.style.cursor = 'grab';
    g.addEventListener('pointerdown', (e) => {
      // if this cube is part of the current selection, dragging pulls a COPY of
      // the whole selection out toward the editor; otherwise tap-select / move
      if (selection && inSelection(tok)) startSelectionDrag(e);
      else startDrag(e, tok);
    });
  } else if (tok.k === 'eq') {
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => { e.stopPropagation(); clearSelection(); });
  }
  return g;
}

// ---- drag ----
let drag = null;
function svgPt(evt) {
  const p = stage.createSVGPoint();
  p.x = evt.clientX; p.y = evt.clientY;
  return p.matrixTransform(stage.getScreenCTM().inverse());
}
function startDrag(evt, tok) {
  if (animating) return;
  const termId = tok.term;
  const info = terms.get(termId);
  if (!info) return;
  // carry the selection box along only if it frames the term being dragged
  const box = (selection && selection.termId === termId) ? selBoxEl : null;
  drag = { termId, tok, side: info.side, cubes: info.cubes, box, start: svgPt(evt), dx: 0, dy: 0 };
  for (const c of info.cubes) { c.g.style.transition = 'none'; c.g.style.cursor = 'grabbing'; c.g.style.opacity = '0.9'; }
  stage.setPointerCapture(evt.pointerId);
}
stage.addEventListener('pointermove', (evt) => {
  if (palDrag) {
    const p = svgPt(evt);
    palDrag.ghost.setAttribute('transform', `translate(${p.x},${p.y})`);
    return;
  }
  if (copyDrag) {
    const p = svgPt(evt);
    copyDrag.ghost.setAttribute('transform', `translate(${p.x},${p.y})`);
    return;
  }
  if (selDrag) {
    const p = svgPt(evt);
    selDrag.ghost.setAttribute('transform', `translate(${p.x},${p.y})`);
    return;
  }
  if (stageItemDrag) {
    const p = svgPt(evt);
    const c = stageItemDrag.cube;
    c.g.setAttribute('transform', `translate(${c.ox + (p.x - stageItemDrag.start.x)},${c.oy + (p.y - stageItemDrag.start.y)})`);
    return;
  }
  if (!drag) return;
  const p = svgPt(evt);
  drag.dx = p.x - drag.start.x; drag.dy = p.y - drag.start.y;
  for (const c of drag.cubes) c.g.setAttribute('transform', `translate(${c.ox + drag.dx},${drag.dy})`);
  if (drag.box) drag.box.setAttribute('transform', `translate(${drag.dx},${drag.dy})`);
});
stage.addEventListener('pointerup', (evt) => {
  if (palDrag) {
    const p = svgPt(evt);
    const pd = palDrag; palDrag = null; pd.ghost.remove();
    const dist = Math.hypot(p.x - pd.start.x, p.y - pd.start.y);
    // a grabbed cube goes into the editor (tap, or drop anywhere above the
    // equation); build an operation there, then drag THAT onto the equation
    if (p.y < -90 || dist < 8) { clearSelection(); stagingSel = null; staging.push(pd.token); renderStaging(); chime('gather'); }
    return;
  }
  if (copyDrag) {
    const p = svgPt(evt);
    const cd = copyDrag; copyDrag = null; cd.ghost.remove();
    if (IN_STRIP(p.y)) { clearSelection(); stagingSel = null; staging.push({ ...cd.tok }); renderStaging(); chime('gather'); } // dropped in the editor
    return;
  }
  if (selDrag) {
    const p = svgPt(evt);
    const sd = selDrag; selDrag = null; sd.ghost.remove();
    const dist = Math.hypot(p.x - sd.start.x, p.y - sd.start.y);
    if (dist < 6) { clearSelection(); return; } // tapped the selection again → deselect
    if (IN_STRIP(p.y)) { stagingSel = null; for (const tk of sd.toks) staging.push({ ...tk }); renderStaging(); chime('gather'); }
    return;
  }
  if (stageItemDrag) {
    const p = svgPt(evt);
    const sd = stageItemDrag; stageItemDrag = null;
    // a tap (no real movement) SELECTS in the editor — same tree rules as the
    // equation: a top-level + grabs the whole expression, an atom just itself
    if (Math.hypot(p.x - sd.start.x, p.y - sd.start.y) < 6) { setStagingSelection(sd.i); return; }
    stagingSel = null; // any real edit invalidates the index-based selection
    if (p.y > -90) { applyStagingOp(); return; } // pull down onto equation → apply to BOTH sides
    const inStrip = p.x >= -412 && p.x <= 412 && p.y >= -162 && p.y <= -100;
    if (!inStrip) { staging.splice(sd.i, 1); renderStaging(); chime('deny'); return; } // dragged off into space → delete
    // otherwise reorder within the strip
    const tok = staging[sd.i];
    staging.splice(sd.i, 1);
    let target = staging.length;
    for (let j = 0; j < staging.length; j++) { if (p.x < STAGE_X0 + j * (STAGE_SIZE + STAGE_GAP)) { target = j; break; } }
    staging.splice(target, 0, tok);
    renderStaging();
    return;
  }
  if (!drag) return;
  // dropped up in the editor strip → COPY this term's cubes into the editor
  {
    const p = svgPt(evt);
    if (IN_STRIP(p.y)) {
      const term = getTerm(session.current(), drag.termId);
      const d0 = drag; drag = null;
      if (term && term.kind !== 'nan' && term.kind !== 'group') {
        const toks = [];
        emitTerm(term, toks, {});
        for (const tk of toks) if (['num', 'var', 'op'].includes(tk.k)) staging.push({ k: tk.k, t: tk.t });
        clearSelection(); renderStaging(); chime('gather');
      }
      snapBack(d0);
      return;
    }
  }
  // a tap (no real movement) SELECTS rather than moves: an atom cube selects
  // just that value/variable, an operator cube selects the whole expression
  if (Math.hypot(drag.dx, drag.dy) < 6) {
    const d = drag; drag = null;
    snapBack(d);
    setSelection(d.tok);
    return;
  }
  const eq = session.current();
  const info = terms.get(drag.termId);
  const centerNow = info.cx + drag.dx;
  const crossed = (drag.side === 'left' && centerNow > equalsX) ||
    (drag.side === 'right' && centerNow < equalsX);
  // gather target: a like term on the SAME side, overlapping the drop
  let gatherId = null;
  for (const [id, other] of terms) {
    if (id === drag.termId || other.side !== drag.side) continue;
    if (Math.abs(other.cx - centerNow) < CUBE * 0.9 && areLike(eq, id, drag.termId)) gatherId = id;
  }
  const d = drag; drag = null;
  try {
    if (crossed) { session.apply((e) => crossEquals(e, d.termId)); render(true); chime('cross'); }
    else if (gatherId) { session.apply((e) => gather(e, gatherId, d.termId)); render(true); chime('gather'); }
    else { snapBack(d); return; }
    status('');
    settle(); // board tidies itself: combine likes, drop zeros
  } catch (err) { snapBack(d); chime('deny'); status(err.message); }
});

function solvedChime() {
  if (isSolved(session.current(), TARGET)) chime('solved');
}

// Runs after EVERY manipulation: the board tidies itself — combine all like
// terms, drop redundant zeros — after a short beat, with a flourish. This is
// the candy-crush cascade.
function settle() {
  if (!needsSettle(session.current())) { solvedChime(); return; }
  animating = true;
  clearTimeout(simpTimer);
  simpTimer = setTimeout(() => {
    // PUSH the combined result as a new history row (don't replace) — so the
    // pre-combine state stays in the stack for the player to inspect
    session.apply((e) => ({ equation: combineAll(e), delta: { type: 'settle' } }));
    animating = false;
    render(true);
    chime('simplify');
    solvedChime();
  }, 520);
}
// ---- left tray: assemble an expression from cubes, then drag the whole
// thing down onto a side of the equation ----
const TRAY_CUBE = 44;
// palette pool — a lively, ever-changing set of grabbable cubes. NEVER an =.
// values cycle (the lively part); operators are TOOLS you always need, so they
// don't belong in the lottery — they're pinned to fixed slots below.
const VALUE_POOL = [
  { k: 'var', t: 'x' }, { k: 'var', t: 'y' },
  { k: 'num', t: '0' }, { k: 'num', t: '1' }, { k: 'num', t: '2' }, { k: 'num', t: '3' }, { k: 'num', t: '4' },
  { k: 'num', t: '5' }, { k: 'num', t: '6' }, { k: 'num', t: '7' }, { k: 'num', t: '8' }, { k: 'num', t: '9' },
];
// pinned operators (never cycle away): × multiply, + add. No − cube — a − b is
// just a + (−b), and the negate dot makes the −b, so subtraction needs no glyph.
const PINNED = { 6: { k: 'op', t: '×' }, 7: { k: 'op', t: '+' } };
const slotToken = (i) => (PINNED[i] ? { ...PINNED[i] } : { ...VALUE_POOL[(Math.random() * VALUE_POOL.length) | 0] });
const PAL_X = [-524, -474];
const PAL_Y = [-96, -40, 16, 72];
const PAL_SLOTS = 8;
const PAL_POS = Array.from({ length: PAL_SLOTS }, (_, i) => ({ x: PAL_X[i % 2], y: PAL_Y[(i / 2) | 0] }));
let paletteTokens = [];   // current token per slot
let paletteEls = [];      // slot cube elements
let staging = [];         // tokens being assembled
let stageCubeEls = [];    // their rendered cubes
let stagingSel = null;    // { idxs, key } — selected editor cubes (same tree rules)

// a plain cube <g> at (cx,cy), any size; content in an inner <g> so it can
// spin/scale (for the rotate-in) without losing its translate
function makeCubeShape(tok, cx, cy, size = CUBE) {
  const c = cubeColor(tok);
  const g = el('g', { transform: `translate(${cx},${cy})` });
  const inner = el('g');
  g._inner = inner;
  inner.appendChild(el('rect', {
    x: -size / 2, y: -size / 2, width: size, height: size, rx: size * 0.18,
    fill: c.fill, stroke: 'rgba(0,0,0,0.2)', 'stroke-width': 2,
  }));
  const glyph = text(displayGlyph(tok), {
    x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 32 * (size / CUBE), 'font-weight': 700,
    fill: c.ink, 'font-family': 'system-ui', 'pointer-events': 'none',
  });
  if (tok.neg || tok.inv) glyph.setAttribute('transform', `scale(${tok.neg ? -1 : 1},${tok.inv ? -1 : 1})`);
  inner.appendChild(glyph);
  if (tok.k === 'num' || tok.k === 'var') drawDot(inner, size, tok.neg, tok.inv);
  g.appendChild(inner);
  return g;
}

function renderPalette() {
  while (trayLayer.firstChild) trayLayer.removeChild(trayLayer.firstChild);
  trayLayer.appendChild(el('rect', { x: -556, y: -138, width: 116, height: 292, rx: 14, fill: 'rgba(0,0,0,0.04)', stroke: '#d8cfb8', 'stroke-width': 2 }));
  trayLayer.appendChild(text('grab a cube', { x: -499, y: -120, 'text-anchor': 'middle', 'font-size': 12, fill: '#8a7f66', 'font-family': 'system-ui' }));
  paletteTokens = []; paletteEls = [];
  for (let i = 0; i < PAL_SLOTS; i++) { paletteTokens.push(slotToken(i)); paletteEls.push(null); refreshSlot(i, false); }
}

// (re)draw one palette slot; `animate` spins the fresh cube in
function refreshSlot(i, animate = true) {
  if (paletteEls[i]) paletteEls[i].remove();
  const g = makeCubeShape(paletteTokens[i], PAL_POS[i].x, PAL_POS[i].y, TRAY_CUBE);
  g.style.cursor = 'grab';
  g.addEventListener('pointerdown', (e) => startPaletteDrag(e, i));
  trayLayer.appendChild(g);
  paletteEls[i] = g;
  if (animate) {
    const inner = g._inner;
    inner.style.transformBox = 'fill-box'; inner.style.transformOrigin = 'center';
    inner.style.transition = 'none'; inner.style.transform = 'rotate(-180deg) scale(0.3)';
    requestAnimationFrame(() => {
      inner.style.transition = 'transform .45s cubic-bezier(.3,1.5,.5,1)';
      inner.style.transform = 'rotate(0deg) scale(1)';
    });
  }
}

// grab a cube from a slot — a fresh one rotates in to replace it (a dispenser)
let palDrag = null;
function startPaletteDrag(evt, i) {
  if (animating) return;
  const token = paletteTokens[i];
  paletteTokens[i] = slotToken(i); // pinned slots dispense the same operator again
  refreshSlot(i, true);
  const ghost = makeCubeShape(token, 0, 0, TRAY_CUBE);
  ghost.style.pointerEvents = 'none'; ghost.style.opacity = '0.92';
  stage.appendChild(ghost);
  const p = svgPt(evt);
  ghost.setAttribute('transform', `translate(${p.x},${p.y})`);
  palDrag = { token, ghost, start: p };
  stage.setPointerCapture(evt.pointerId);
}

// copy a cube seen in the equation or history INTO the editor (reuse it)
let copyDrag = null;
function startCopyDrag(evt, tok) {
  if (animating || !['num', 'var', 'op'].includes(tok.k)) return;
  const ghost = makeCubeShape(tok, 0, 0, TRAY_CUBE);
  ghost.style.pointerEvents = 'none'; ghost.style.opacity = '0.9';
  stage.appendChild(ghost);
  copyDrag = { tok: { k: tok.k, t: tok.t }, ghost, start: svgPt(evt) };
  const p = svgPt(evt);
  ghost.setAttribute('transform', `translate(${p.x},${p.y})`);
  stage.setPointerCapture(evt.pointerId);
}

// drag a COPY of the current selection (the grab unit — an atom or a whole
// expression) out of the equation toward the editor. This is how you reuse a
// value that the dock isn't currently offering: tap it, drag it into the tray.
function startSelectionDrag(evt) {
  if (animating || !selectedToks.length) return;
  const size = TRAY_CUBE, gap = 6;
  const w = selectedToks.length * size + (selectedToks.length - 1) * gap;
  const ghost = el('g');
  selectedToks.forEach((t, i) => ghost.appendChild(makeCubeShape(t, -w / 2 + size / 2 + i * (size + gap), 0, size)));
  ghost.style.pointerEvents = 'none'; ghost.style.opacity = '0.92';
  stage.appendChild(ghost);
  const p = svgPt(evt);
  ghost.setAttribute('transform', `translate(${p.x},${p.y})`);
  selDrag = { ghost, start: p, toks: selectedToks.map((t) => ({ k: t.k, t: t.t, neg: !!t.neg, inv: !!t.inv })) };
  stage.setPointerCapture(evt.pointerId);
}

// about once a second, a random slot cycles to a new cube
setInterval(() => {
  if (document.hidden || !paletteEls.length) return;
  // cycle a VALUE slot only — pinned operators stay put
  const valueSlots = [];
  for (let i = 0; i < PAL_SLOTS; i++) if (!PINNED[i]) valueSlots.push(i);
  const i = valueSlots[(Math.random() * valueSlots.length) | 0];
  paletteTokens[i] = slotToken(i);
  refreshSlot(i, true);
}, 950);

// ---- editor selection: the SAME tree rules as the equation, applied to the
// flat staging tokens. Tapping a top-level + selects the whole expression;
// tapping a × / paren selects its additive term; a digit selects its whole
// number; an atom selects itself. Parenthesis depth decides what "top-level"
// means, so a + inside ( ) selects only its group, not everything.
function stageDepths() {
  const d = new Array(staging.length); let depth = 0;
  for (let i = 0; i < staging.length; i++) {
    d[i] = depth;
    const t = staging[i];
    if (t.k === 'op' && t.t === '(') depth++;
    else if (t.k === 'op' && t.t === ')') depth = Math.max(0, depth - 1);
  }
  return d;
}
function numRunAt(i) { // the contiguous digit cubes forming one number
  let a = i, b = i;
  while (a > 0 && staging[a - 1].k === 'num') a--;
  while (b < staging.length - 1 && staging[b + 1].k === 'num') b++;
  const out = []; for (let j = a; j <= b; j++) out.push(j); return out;
}
function stageTermAt(i) { // the additive segment bounded by top-level +
  const d = stageDepths();
  let lo = 0, hi = staging.length;
  for (let j = i - 1; j >= 0; j--) if (staging[j].k === 'op' && staging[j].t === '+' && d[j] === 0) { lo = j + 1; break; }
  for (let j = i + 1; j < staging.length; j++) if (staging[j].k === 'op' && staging[j].t === '+' && d[j] === 0) { hi = j; break; }
  const out = []; for (let j = lo; j < hi; j++) out.push(j); return out;
}
function stageSelIndices(i) {
  const t = staging[i], d = stageDepths();
  if (t.k === 'op' && t.t === '+' && d[i] === 0) return staging.map((_, j) => j); // whole expression
  if (t.k === 'num') return numRunAt(i);
  if (t.k === 'var' || t.k === 'eq') return [i];
  return stageTermAt(i); // ×, /, −, ( ), or a nested + → its term
}
function setStagingSelection(i) {
  const idxs = stageSelIndices(i), key = idxs.join(',');
  stagingSel = (stagingSel && stagingSel.key === key) ? null : { idxs, key }; // tap again = clear
  renderStaging();
}

function renderStaging() {
  if (stagingSel && stagingSel.idxs.some((j) => j >= staging.length)) stagingSel = null; // stale
  while (stagingLayer.firstChild) stagingLayer.removeChild(stagingLayer.firstChild);
  stagingLayer.appendChild(el('rect', { x: -412, y: -158, width: 824, height: 54, rx: 12, fill: 'rgba(224,180,75,0.10)', stroke: '#d8cfb8', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  if (!staging.length) {
    stagingLayer.appendChild(text('drag cubes here', { x: 0, y: -127, 'text-anchor': 'middle', 'font-size': 13, fill: '#c3b691', 'font-family': 'system-ui' }));
    return;
  }
  const size = 42, gap = 8;
  let x = -392 + size / 2;
  stageCubeEls = [];
  staging.forEach((tok, i) => {
    const g = makeCubeShape(tok, x, -131, size);
    g.style.cursor = 'grab';
    g.addEventListener('pointerdown', (e) => startStageItemDrag(e, i));
    stagingLayer.appendChild(g);
    stageCubeEls.push({ g, ox: x, oy: -131 });
    x += size + gap;
  });
  // selection box (gold), same look as the equation's
  if (stagingSel) {
    const sel = stagingSel.idxs.filter((j) => j < stageCubeEls.length);
    if (sel.length) {
      const xs = sel.map((j) => stageCubeEls[j].ox);
      const minX = Math.min(...xs) - size / 2, maxX = Math.max(...xs) + size / 2;
      const box = el('rect', {
        x: minX - 5, y: -131 - size / 2 - 5, width: (maxX - minX) + 10, height: size + 10, rx: 10,
        fill: 'rgba(224,180,75,0.16)', stroke: '#e0b020', 'stroke-width': 2.5, 'pointer-events': 'none',
      });
      stagingLayer.insertBefore(box, stageCubeEls[sel[0]].g); // behind the cubes
    }
  }
}

const STAGE_SIZE = 42, STAGE_GAP = 8, STAGE_X0 = -392 + 42 / 2;
// each staging cube is draggable: sideways to REORDER, up to DELETE, down onto
// the equation to COMMIT the whole expression
let stageItemDrag = null;
function startStageItemDrag(evt, i) {
  if (animating) return;
  clearSelection(); // working in the tray → equation loses button focus
  const cube = stageCubeEls[i];
  stageItemDrag = { i, cube, start: svgPt(evt) };
  cube.g.style.transition = 'none';
  cube.g.style.opacity = '0.9';
  cube.g.parentNode.appendChild(cube.g); // bring to front while dragging
  stage.setPointerCapture(evt.pointerId);
}

// Read a maximal run of number cubes as ONE value using the orientation rule:
// same-orientation digits concatenate ([2][5] → 25), an orientation change
// MULTIPLIES because an inverted digit is a reciprocal ([3][2⁻¹] → 3 × ½ = 3/2,
// and the interleaved [2][3⁻¹][4] → 2 × ⅓ × 4 = 8/3). Any dotted (neg) digit
// makes the whole number negative — an OR over digits, never a per-digit flip.
// This is the single source of truth both parsers below share. Returns a Rational.
function numberFromCubes(cubes) {
  let value = R.rat(1), runStr = '', runInv = false, neg = false;
  const flushRun = () => {
    if (runStr === '') return;
    const base = R.rat(BigInt(runStr));
    value = R.mul(value, runInv ? R.recip(base) : base); // inverted run ⇒ reciprocal factor
    runStr = '';
  };
  for (const c of cubes) {
    if (c.neg) neg = true;
    const inv = c.inv || false;
    if (runStr !== '' && inv !== runInv) flushRun(); // orientation change ⇒ new factor
    runInv = inv;
    runStr += c.t;
  }
  flushRun();
  return neg ? R.neg(value) : value;
}

// The staged expression is an OPERATION applied to BOTH sides. It must begin
// with an operator (× ÷ + −); the rest is the number to operate by.
//   ÷8 → divide both sides by 8    ×3 → multiply both sides by 3
//   +5 → add 5 to both sides       −2 → subtract 2 from both sides
function applyStagingOp() {
  if (!staging.length) { chime('deny'); return; }
  if (staging.some((t) => t.k === 'eq')) { chime('deny'); return; } // that's a statement to TEST, not an operation
  // no leading operator → assume + (adding). A leading + − × / uses that.
  let op, operand;
  const lead = staging[0];
  if (lead.k === 'op' && '+−×/'.includes(lead.t)) { op = lead.t; operand = staging.slice(1); }
  else {
    operand = staging;
    // No leading operator: a bare whole number is an ADD (+n). But a fraction or
    // reciprocal — a denominator, built with the inverse dot now that ÷ left the
    // dock — is a SCALING factor, so multiply (×½ is how you divide by 2).
    const isFraction = operand.some((t) => (t.k === 'num' && t.inv) || (t.k === 'op' && t.t === '/'));
    op = isFraction ? '×' : '+';
  }
  if (!operand.length) { chime('deny'); return; }
  // fold the operand into a coefficient. A maximal run of contiguous digit cubes
  // is ONE number (numberFromCubes applies the orientation rule); a × or /
  // operator starts a NEW factor (so [2][3] concatenates to 23, but [2]×[3]
  // multiplies to 6); a variable makes it a term. Parens are transparent.
  let coeff = R.rat(1), varName = null, cubes = [], divide = false;
  const flushFactor = () => {
    if (!cubes.length) return;
    const n = numberFromCubes(cubes);
    coeff = divide ? R.div(coeff, n) : R.mul(coeff, n);
    cubes = []; divide = false;
  };
  try {
    for (const t of operand) {
      if (t.k === 'num') cubes.push(t);
      else if (t.k === 'var') { flushFactor(); varName = t.t; if (t.neg) coeff = R.neg(coeff); }
      else if (t.k === 'op') {
        if (t.t === '/') { flushFactor(); divide = true; }        // legacy ÷ operator
        else if (t.t === '×') flushFactor();                      // explicit multiply separator
        else if (t.t === '−') { flushFactor(); coeff = R.neg(coeff); } // legacy − operator
        // '(' ')' transparent
      }
    }
    flushFactor();
  } catch { chime('deny'); return; }
  try {
    if (op === '+' || op === '−') {
      // add or subtract a TERM (number OR variable, e.g. −y) from both sides
      const signed = op === '−' ? R.neg(coeff) : coeff;
      const template = varName
        ? { kind: 'var', varName, coeff: signed }
        : { kind: 'const', varName: null, coeff: signed };
      // adding 0 is legal-but-pointless: allow it and let the 0 poof on settle
      session.apply((e) => addTermBoth(e, template));
    } else {
      // × and ÷ still take a NUMBER only (scaling both sides by a variable is
      // a different move we don't do yet)
      if (varName) { chime('deny'); renderStaging(); return; } // × or ÷ by a variable: not yet
      // ×0 is allowed: it collapses to 0 = 0 (destructive but legal)
      if (op === '×') session.apply((e) => wrapBoth(e, '*', coeff));
      else session.apply((e) => wrapBoth(e, '/', coeff));
    }
    staging = [];
    renderStaging();
    render(true);
    if (hasNaN(session.current())) { chime('deny'); status('💥 you divided by zero — undo to put the universe back'); }
    else { chime('distribute'); status(op === '×' || op === '/' ? 'now press “distribute” to expand the parentheses' : ''); settle(); }
  } catch (err) { chime('deny'); status(err.message); }
}

function snapBack(d) {
  for (const c of d.cubes) {
    c.g.style.transition = 'transform 0.22s ease-out';
    c.g.setAttribute('transform', `translate(${c.ox},0)`);
    c.g.style.opacity = '1';
    c.g.style.cursor = 'grab';
  }
  // the selection box rode along during the drag — send it home too, or it's
  // left stranded wherever the term was released
  if (d.box) {
    d.box.style.transition = 'transform 0.22s ease-out';
    d.box.setAttribute('transform', 'translate(0,0)');
  }
}

// ---- tools ----
// ---- controls live in the scene now (the bottom dock is gone) ----
const controlsLayer = document.createElementNS(SVGNS, 'g');
const statusLayer = document.createElementNS(SVGNS, 'g');
stage.appendChild(controlsLayer);
stage.appendChild(statusLayer);

// This is a puzzle — feedback is chimes and cubes, not captions. status() is
// intentionally a no-op; the call sites remain so it's easy to re-enable for
// debugging, but nothing is ever printed to the player.
function status() {}

const SCHEMES = {
  eq: { fill: '#eef4fb', stroke: '#2f6fb0', ink: '#22496f' },      // equation — blue
  editor: { fill: '#fbf3e0', stroke: '#c69a3a', ink: '#7a5a12' },  // editor — gold
};
function svgButton(label, x, y, w, onclick, scheme = 'eq') {
  const s = SCHEMES[scheme];
  const g = el('g', { transform: `translate(${x},${y})` });
  g.appendChild(el('rect', { x: -w / 2, y: -20, width: w, height: 40, rx: 10, fill: s.fill, stroke: s.stroke, 'stroke-width': 2 }));
  g.appendChild(text(label, { x: 0, y: 6, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: s.ink, 'font-family': 'system-ui', 'pointer-events': 'none' }));
  g.style.cursor = 'pointer';
  g.addEventListener('pointerdown', (e) => { e.stopPropagation(); onclick(); });
  controlsLayer.appendChild(g);
}

// ---- EQUATION panel (blue): these act on both sides ----
const EQX = 486;
controlsLayer.appendChild(el('rect', { x: EQX - 78, y: -104, width: 156, height: 214, rx: 14, fill: 'rgba(47,111,176,0.06)', stroke: '#9cbfe0', 'stroke-width': 2 }));
controlsLayer.appendChild(text('EQUATION', { x: EQX, y: -84, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#2f6fb0', 'font-family': 'system-ui', 'letter-spacing': '0.1em' }));
controlsLayer.appendChild(text('these act on both sides', { x: EQX, y: -68, 'text-anchor': 'middle', 'font-size': 11, fill: '#6b8bb0', 'font-family': 'system-ui' }));

let simpTimer = null;
// SIMPLIFY (equation): distribute parentheses, but show the UNEVALUATED form
// first (3/2, −5/2·y — the pending divisions) as its OWN history row, then fold
// to the real coefficients (another row), then combine like terms. Every stage
// is written to history so the player can step back through the whole thing.
svgButton('simplify', EQX, -38, 132, () => {
  if (animating) return;
  if (!hasGroup(session.current())) { chime('deny'); return; }
  const groupForm = session.current();
  const uneval = distributeUneval(groupForm);            // pending form (display only)
  const distributed = distributeAll(groupForm).equation; // folded coefficients — capture NOW
  // 1) push the intermediate, unevaluated row so it lands in history
  session.apply(() => ({ equation: uneval, delta: { type: 'distributeUneval' } }));
  animating = true;
  render(true);
  chime('distribute');
  clearTimeout(simpTimer);
  simpTimer = setTimeout(() => {
    // 2) fold to the evaluated result (its own row), then 3) settle combines likes
    session.apply(() => ({ equation: distributed, delta: { type: 'distributeAll' } }));
    animating = false;
    render(true);
    chime('simplify');
    settle();
  }, 950);
}, 'eq');
svgButton('↺ undo', EQX, 16, 132, () => {
  if (session.canUndo()) { session.undo(); render(); chime('undo'); status(''); } else chime('deny');
}, 'eq');
svgButton('reset', EQX, 68, 132, () => {
  while (session.canUndo()) session.undo(); render(); status('');
}, 'eq');

// Flip the staged shape. These are the two involutions of the Klein four-group:
//   neg  → mirror (horizontal): the operand's sign flips. ×(−1) on empty.
//   inv  → upside-down (vertical): the operand becomes its reciprocal, which is
//          inherently multiplicative, so we make sure the op is × (÷4 == ×¼).
// The dot follows the flip; the flip follows the button. Same encoding the
// equation already draws — now you PERFORM it instead of just reading it.
function flipStaging(kind) {
  const flag = kind === 'neg' ? 'neg' : 'inv';
  if (!staging.length) {
    if (kind === 'neg') { staging = [{ k: 'op', t: '×' }, { k: 'num', t: '1', neg: true }]; renderStaging(); chime('negate'); }
    else chime('deny'); // nothing to invert
    return;
  }
  // with a selection, flip ONLY the selected sub-expression's values — the tree
  // rule: select the + in a+b and both flip (−a + −b); select just a and only a
  // flips (−a + b). With no selection, flip the whole operand.
  if (stagingSel) {
    let changed = false;
    for (const j of stagingSel.idxs) { const t = staging[j]; if (t.k === 'num' || t.k === 'var') { t[flag] = !t[flag]; changed = true; } }
    if (!changed) { chime('deny'); return; }
    renderStaging();
    chime(kind === 'neg' ? 'negate' : 'invert');
    return;
  }
  const hasLeadOp = staging[0].k === 'op' && '+−×/'.includes(staging[0].t);
  if (kind === 'inv' && !hasLeadOp) staging.unshift({ k: 'op', t: '×' }); // reciprocal ⇒ multiply
  for (const t of staging) if (t.k === 'num' || t.k === 'var') t[flag] = !t[flag];
  renderStaging();
  chime(kind === 'neg' ? 'negate' : 'invert');
}

// The flip buttons act on whatever is SELECTED in the equation; with nothing
// selected they fall back to shaping the staged operand.
function flipTarget(kind) {
  if (selection) flipSelection(kind);
  else flipStaging(kind);
}

function flipSelection(kind) {
  if (animating) return;
  if (selection.kind === 'side') { chime('deny'); return; } // whole-side flip isn't a single-term op
  const term = getTerm(session.current(), selection.termId);
  if (!term || term.kind === 'nan') { chime('deny'); return; }
  try {
    if (kind === 'neg') {
      session.apply((e) => negateTermById(e, selection.termId));
      chime('negate');
    } else {
      // invert = reciprocate the numeric part. A bare variable (x, coeff ±1)
      // would need to become 1/x — a variable in the denominator, which this
      // model can't hold — so refuse rather than silently do nothing.
      if (selection.kind === 'atom' && selection.role === 'var' && R.isOne(R.abs(term.coeff))) { chime('deny'); return; }
      if (R.isZero(term.coeff)) { chime('deny'); return; }
      session.apply((e) => invertTermById(e, selection.termId));
      chime('invert');
    }
    render();
    settle();
  } catch { chime('deny'); }
}

// ---- EDITOR action row (gold): these act on the expression you're building ----
svgButton('apply → ⚖️', -286, -80, 104, () => { if (!animating) applyStagingOp(); }, 'editor');
svgButton('( )', -208, -80, 44, () => { clearSelection(); stagingSel = null; staging.push({ k: 'op', t: '(' }, { k: 'op', t: ')' }); renderStaging(); chime('gather'); }, 'editor');
svgButton('=', -158, -80, 44, () => { clearSelection(); stagingSel = null; staging.push({ k: 'eq', t: '=' }); renderStaging(); chime('gather'); }, 'editor');
svgButton('×(−1)', -96, -80, 72, () => flipTarget('neg'), 'editor');
svgButton('invert', -16, -80, 80, () => flipTarget('inv'), 'editor');
svgButton('simplify', 70, -80, 84, () => { if (!animating) simplifyStaging(); }, 'editor');
svgButton('test 👍', 162, -80, 92, () => testStaging(), 'editor');
svgButton('clear', 250, -80, 76, () => { staging = []; stagingSel = null; renderStaging(); }, 'editor');

// ---- the editor's own Simplify: evaluate the staged numeric expression and,
// if it resolves to a WHOLE number, replace it with that number. 🌸🍕🌸 = 1÷1
// = 1 → 🌸. Fractions and anything with a variable are left as they are. ----
function evalExprTokens(toks) {
  if (toks.some((t) => t.k === 'var')) return null; // has a variable → won't resolve
  let result = null, termVal = null, sign = 1, pendingOp = '×', cubes = [];
  // a maximal run of digit cubes is ONE number (shared orientation rule); × / are
  // factor links within a term; + − split terms
  const flushNum = () => {
    if (!cubes.length) return;
    const n = numberFromCubes(cubes);
    termVal = termVal === null ? n : (pendingOp === '/' ? R.div(termVal, n) : R.mul(termVal, n));
    cubes = [];
  };
  const flushTerm = () => {
    flushNum();
    if (termVal === null) return;
    const signed = sign < 0 ? R.neg(termVal) : termVal;
    result = result === null ? signed : R.add(result, signed);
    termVal = null; pendingOp = '×';
  };
  for (const t of toks) {
    if (t.k === 'num') cubes.push(t);
    else if (t.k === 'op') {
      if (t.t === '+' || t.t === '−') { flushTerm(); sign = t.t === '−' ? -1 : 1; }
      else if (t.t === '×') { flushNum(); pendingOp = '×'; }
      else if (t.t === '/') { flushNum(); pendingOp = '/'; }
    }
  }
  flushTerm();
  return result;
}

// TEST: a plain verdict — 👍 (the two sides are equal numbers) or 👎 (anything
// else: not equal, has a variable, no =, ÷0). No words, just the thumb.
const verdictLayer = document.createElementNS(SVGNS, 'g');
stage.appendChild(verdictLayer);
let verdictTimer = null;
function testStaging() {
  const eqIdx = staging.findIndex((t) => t.k === 'eq');
  let ok = false;
  if (eqIdx !== -1) {
    try {
      const lv = evalExprTokens(staging.slice(0, eqIdx));
      const rv = evalExprTokens(staging.slice(eqIdx + 1));
      ok = lv != null && rv != null && R.eq(lv, rv);
    } catch { ok = false; }
  }
  flashVerdict(ok);
}

function flashVerdict(ok) {
  while (verdictLayer.firstChild) verdictLayer.removeChild(verdictLayer.firstChild);
  const g = el('g', { transform: 'translate(0,130)' });
  const inner = el('g');
  inner.appendChild(el('rect', { x: -110, y: -110, width: 220, height: 220, rx: 28, fill: '#fffdf8', stroke: ok ? '#2f8f4a' : '#c0392b', 'stroke-width': 6 }));
  inner.appendChild(text(ok ? '👍' : '👎', { x: 0, y: 4, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 130 }));
  g.appendChild(inner);
  verdictLayer.appendChild(g);
  inner.style.transformBox = 'fill-box'; inner.style.transformOrigin = 'center';
  inner.style.transition = 'none'; inner.style.opacity = '0'; inner.style.transform = 'scale(0.5)';
  requestAnimationFrame(() => {
    inner.style.transition = 'opacity .16s ease, transform .3s cubic-bezier(.3,1.6,.5,1)';
    inner.style.opacity = '1'; inner.style.transform = 'scale(1)';
  });
  chime(ok ? 'solved' : 'deny');
  clearTimeout(verdictTimer);
  verdictTimer = setTimeout(() => { while (verdictLayer.firstChild) verdictLayer.removeChild(verdictLayer.firstChild); }, 1600);
}

function simplifyStaging() {
  if (!staging.length) { chime('deny'); return; }
  const leadOp = (staging[0].k === 'op' && '+−×/'.includes(staging[0].t)) ? staging[0] : null;
  const exprToks = leadOp ? staging.slice(1) : staging;
  let val;
  try { val = evalExprTokens(exprToks); } catch { chime('deny'); status('can’t simplify (÷0?)'); return; }
  if (val == null) { chime('deny'); status('it has a variable — won’t resolve to a number'); return; }
  if (val.d !== 1n) { chime('deny'); status('doesn’t resolve to a whole number — left as is'); return; }
  const digits = [];
  if (val.n < 0n) digits.push({ k: 'op', t: '−' });
  for (const ch of String(val.n < 0n ? -val.n : val.n)) digits.push({ k: 'num', t: ch });
  staging = leadOp ? [leadOp, ...digits] : digits;
  renderStaging(); chime('simplify'); status('');
}

renderPalette();
renderStaging();
render();
status('grab cubes into the editor, build an operation (start with ÷ × + −), then drag it onto ⚖️');
