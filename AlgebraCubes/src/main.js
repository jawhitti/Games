// UI: every token is its own cube — numbers, variables, and operators
// (+ − × =). You manipulate by DRAGGING a term: drag it across the = and its
// sign flips (crossEquals); drop it onto a like term to combine (gather).
// The engine stays pure; this layer only lays out cubes and turns drags into
// engine calls. Color encodes type: x red, y green, numbers slate, ops gray.

import {
  varTerm, constTerm, groupTerm, createSession, crossEquals, gather, addBoth, addTermBoth, negateBoth, appendTerm,
  wrapBoth, distributeAll, combineAll, simplifyAll, needsSettle, hasGroup, hasNaN, isSolvedLeft, areLike, getTerm,
} from './engine.js';

const IN_STRIP = (y) => y >= -158 && y <= -100; // the editor strip's y-band

const TARGET = 'x'; // the goal: isolate x, alone, on the LEFT
import * as R from './rational.js';

// starting equation: 2x + 1 = 5  →  solves to x = 2
// (cross the +1 → 2x = 4, then ÷2 → x = 2)
function startEquation() {
  return {
    left: [varTerm('x1', 'x', R.rat(2)), constTerm('c1', R.rat(1))],
    right: [constTerm('c2', R.rat(5))],
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

// one cube per digit — a multi-digit integer is several adjacent digit cubes
function emitDigits(intVal, out, meta) {
  const s = String(intVal < 0n ? -intVal : intVal);
  for (const ch of s) out.push({ k: 'num', t: ch, ...meta });
}
// a magnitude (abs rational) as digit cubes, with a [/] between for fractions
function emitNumber(mag, out, meta) {
  emitDigits(mag.n, out, meta);
  if (mag.d !== 1n) {
    out.push({ k: 'op', t: '/', ...meta });
    emitDigits(mag.d, out, meta);
  }
}

// one term's cubes (sign is handled by the caller as glue). meta.term is the
// TOP-level draggable term id, so every sub-cube drags the whole term.
function emitTerm(term, out, meta) {
  const mag = R.abs(term.coeff);
  if (term.kind === 'const') {
    emitNumber(mag, out, meta);
  } else if (term.kind === 'var') {
    if (R.isOne(mag)) {
      out.push({ k: 'var', t: term.varName, ...meta });
    } else if (mag.d === 1n) {
      emitNumber(mag, out, meta);
      out.push({ k: 'op', t: '×', ...meta });
      out.push({ k: 'var', t: term.varName, ...meta });
    } else {
      // fraction coefficient on a variable renders parenthesized: (5/2 × y)
      out.push({ k: 'op', t: '(', ...meta });
      emitNumber(mag, out, meta);
      out.push({ k: 'op', t: '×', ...meta });
      out.push({ k: 'var', t: term.varName, ...meta });
      out.push({ k: 'op', t: ')', ...meta });
    }
  } else if (term.kind === 'group') {
    const c = mag; // group coeff magnitude
    if (c.n !== 1n && c.d === 1n) { emitNumber(c, out, meta); out.push({ k: 'op', t: '×', ...meta }); }
    else if (c.n !== 1n) { emitNumber(c, out, meta); out.push({ k: 'op', t: '×', ...meta }); }
    out.push({ k: 'op', t: '(', ...meta });
    term.terms.forEach((ch, i) => {
      if (i > 0 || R.isNeg(ch.coeff)) out.push({ k: 'op', t: R.isNeg(ch.coeff) ? '−' : '+', ...meta });
      emitTerm(ch, out, meta);
    });
    out.push({ k: 'op', t: ')', ...meta });
    if (c.d !== 1n) { out.push({ k: 'op', t: '/', ...meta }); out.push({ k: 'num', t: String(c.d), ...meta }); }
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
function emitExpr(e, out, meta) {
  if (e.t === 'int') { emitDigits(e.v, out, meta); return; }
  emitExpr(e.a, out, meta);
  out.push({ k: 'op', t: e.op === '*' ? '×' : e.op, ...meta });
  emitExpr(e.b, out, meta);
}
// a term carrying a transient lexical `display` expression
function emitTermDisplay(term, out, meta) {
  const { mag } = splitSign(term.display);
  if (term.kind === 'const') { emitExpr(mag, out, meta); return; }
  if (mag.t === 'int' && mag.v === 1n) { out.push({ k: 'var', t: term.varName, ...meta }); return; }
  if (isFrac(mag)) {
    out.push({ k: 'op', t: '(', ...meta });
    emitExpr(mag, out, meta);
    out.push({ k: 'op', t: '×', ...meta });
    out.push({ k: 'var', t: term.varName, ...meta });
    out.push({ k: 'op', t: ')', ...meta });
  } else {
    emitExpr(mag, out, meta);
    out.push({ k: 'op', t: '×', ...meta });
    out.push({ k: 'var', t: term.varName, ...meta });
  }
}

function tokens(eq) {
  const out = [];
  const side = (arr, name) =>
    arr.forEach((term, i) => {
      if (term.kind === 'nan') { out.push({ k: 'nan', term: term.id, side: name }); return; }
      const neg = term.display ? splitSign(term.display).neg : R.isNeg(term.coeff);
      if (i > 0 || neg) out.push({ k: 'op', t: neg ? '−' : '+', term: term.id, side: name, role: 'sign' });
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
const PITCH = { cross: 587, gather: 659, undo: 330, deny: 150, solved: 784, distribute: 698, simplify: 880, negate: 494 };
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
  if (flourish) flourishIn(cubeEls);
  if (isSolvedLeft(session.current(), TARGET)) {
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
  inner.appendChild(text(displayGlyph(tok), {
    x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 32, 'font-weight': 700,
    fill: c.ink, 'font-family': 'system-ui', 'pointer-events': 'none',
  }));
  g.appendChild(inner);
  if (tok.term) {
    g.style.cursor = 'grab';
    g.addEventListener('pointerdown', (e) => startDrag(e, tok.term));
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
function startDrag(evt, termId) {
  if (animating) return;
  const info = terms.get(termId);
  if (!info) return;
  drag = { termId, side: info.side, cubes: info.cubes, start: svgPt(evt), dx: 0, dy: 0 };
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
});
stage.addEventListener('pointerup', (evt) => {
  if (palDrag) {
    const p = svgPt(evt);
    const pd = palDrag; palDrag = null; pd.ghost.remove();
    const dist = Math.hypot(p.x - pd.start.x, p.y - pd.start.y);
    // a grabbed cube goes into the editor (tap, or drop anywhere above the
    // equation); build an operation there, then drag THAT onto the equation
    if (p.y < -90 || dist < 8) { staging.push(pd.token); renderStaging(); chime('gather'); }
    return;
  }
  if (copyDrag) {
    const p = svgPt(evt);
    const cd = copyDrag; copyDrag = null; cd.ghost.remove();
    if (IN_STRIP(p.y)) { staging.push({ ...cd.tok }); renderStaging(); chime('gather'); } // dropped in the editor
    return;
  }
  if (stageItemDrag) {
    const p = svgPt(evt);
    const sd = stageItemDrag; stageItemDrag = null;
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
        renderStaging(); chime('gather');
      }
      snapBack(d0);
      return;
    }
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
  if (isSolvedLeft(session.current(), TARGET)) chime('solved');
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
const POOL = [
  { k: 'var', t: 'x' }, { k: 'var', t: 'y' }, { k: 'var', t: 'x' }, { k: 'var', t: 'y' },
  { k: 'num', t: '0' }, { k: 'num', t: '1' }, { k: 'num', t: '2' }, { k: 'num', t: '3' }, { k: 'num', t: '4' },
  { k: 'num', t: '5' }, { k: 'num', t: '6' }, { k: 'num', t: '7' }, { k: 'num', t: '8' }, { k: 'num', t: '9' },
  { k: 'op', t: '+' }, { k: 'op', t: '−' }, { k: 'op', t: '×' }, { k: 'op', t: '/' },
];
const randomToken = () => ({ ...POOL[(Math.random() * POOL.length) | 0] });
const PAL_X = [-524, -474];
const PAL_Y = [-96, -40, 16, 72];
const PAL_SLOTS = 8;
const PAL_POS = Array.from({ length: PAL_SLOTS }, (_, i) => ({ x: PAL_X[i % 2], y: PAL_Y[(i / 2) | 0] }));
let paletteTokens = [];   // current token per slot
let paletteEls = [];      // slot cube elements
let staging = [];         // tokens being assembled
let stageCubeEls = [];    // their rendered cubes

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
  inner.appendChild(text(displayGlyph(tok), {
    x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 32 * (size / CUBE), 'font-weight': 700,
    fill: c.ink, 'font-family': 'system-ui', 'pointer-events': 'none',
  }));
  g.appendChild(inner);
  return g;
}

function renderPalette() {
  while (trayLayer.firstChild) trayLayer.removeChild(trayLayer.firstChild);
  trayLayer.appendChild(el('rect', { x: -556, y: -138, width: 116, height: 292, rx: 14, fill: 'rgba(0,0,0,0.04)', stroke: '#d8cfb8', 'stroke-width': 2 }));
  trayLayer.appendChild(text('grab a cube', { x: -499, y: -120, 'text-anchor': 'middle', 'font-size': 12, fill: '#8a7f66', 'font-family': 'system-ui' }));
  paletteTokens = []; paletteEls = [];
  for (let i = 0; i < PAL_SLOTS; i++) { paletteTokens.push(randomToken()); paletteEls.push(null); refreshSlot(i, false); }
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
  paletteTokens[i] = randomToken();
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

// about once a second, a random slot cycles to a new cube
setInterval(() => {
  if (document.hidden || !paletteEls.length) return;
  const i = (Math.random() * PAL_SLOTS) | 0;
  paletteTokens[i] = randomToken();
  refreshSlot(i, true);
}, 950);

function renderStaging() {
  while (stagingLayer.firstChild) stagingLayer.removeChild(stagingLayer.firstChild);
  stagingLayer.appendChild(el('rect', { x: -412, y: -158, width: 824, height: 54, rx: 12, fill: 'rgba(224,180,75,0.10)', stroke: '#d8cfb8', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  if (!staging.length) {
    stagingLayer.appendChild(text('build an operation here (start with ÷ × + −), then drag it onto the equation to apply to BOTH sides', { x: 0, y: -127, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#a89a78', 'font-family': 'system-ui' }));
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
}

const STAGE_SIZE = 42, STAGE_GAP = 8, STAGE_X0 = -392 + 42 / 2;
// each staging cube is draggable: sideways to REORDER, up to DELETE, down onto
// the equation to COMMIT the whole expression
let stageItemDrag = null;
function startStageItemDrag(evt, i) {
  if (animating) return;
  const cube = stageCubeEls[i];
  stageItemDrag = { i, cube, start: svgPt(evt) };
  cube.g.style.transition = 'none';
  cube.g.style.opacity = '0.9';
  cube.g.parentNode.appendChild(cube.g); // bring to front while dragging
  stage.setPointerCapture(evt.pointerId);
}

// The staged expression is an OPERATION applied to BOTH sides. It must begin
// with an operator (× ÷ + −); the rest is the number to operate by.
//   ÷8 → divide both sides by 8    ×3 → multiply both sides by 3
//   +5 → add 5 to both sides       −2 → subtract 2 from both sides
function applyStagingOp() {
  if (!staging.length || staging[0].k !== 'op') {
    chime('deny'); status('the expression must begin with an operator (÷ × + −) to apply'); renderStaging(); return;
  }
  const op = staging[0].t;
  const operand = staging.slice(1);
  if (!operand.length) { chime('deny'); status('operate by what?'); renderStaging(); return; }
  // fold the operand: adjacent digits concatenate positionally ([1][2] = 12);
  // a single / splits numerator/denominator; each − flips the sign; parens are
  // transparent; a variable makes it a term. So ×(−1) reads as −1 (a negate).
  let numStr = '', denStr = '', inDen = false, varName = null, sign = 1n;
  for (const t of operand) {
    if (t.k === 'op' && t.t === '/') inDen = true;
    else if (t.k === 'op' && t.t === '−') sign = -sign;
    else if (t.k === 'num') { if (inDen) denStr += t.t; else numStr += t.t; }
    else if (t.k === 'var') varName = t.t;
    // '(' ')' and '×' are transparent for a single operand
  }
  let coeff;
  try { coeff = R.rat(sign * (numStr ? BigInt(numStr) : 1n), denStr ? BigInt(denStr) : 1n); } catch { chime('deny'); return; }
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
      if (varName) { chime('deny'); status('can’t × or ÷ both sides by a variable — only a number'); renderStaging(); return; }
      if (R.isZero(coeff) && op !== '/') { chime('deny'); status('that would do nothing'); renderStaging(); return; }
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
svgButton('distribute', EQX, -38, 132, () => {
  if (animating) return;
  if (!hasGroup(session.current())) { chime('deny'); status('nothing to distribute — apply × or ÷ first'); return; }
  const uneval = distributeUneval(session.current());
  session.apply((e) => distributeAll(e));
  animating = true;
  renderEq(uneval, true);
  chime('distribute'); status('');
  clearTimeout(simpTimer);
  simpTimer = setTimeout(() => { animating = false; render(true); chime('simplify'); settle(); }, 950);
}, 'eq');
svgButton('↺ undo', EQX, 16, 132, () => {
  if (session.canUndo()) { session.undo(); render(); chime('undo'); status(''); } else chime('deny');
}, 'eq');
svgButton('reset', EQX, 68, 132, () => {
  while (session.canUndo()) session.undo(); render(); status('');
}, 'eq');

// ---- EDITOR action row (gold): these act on the expression you're building ----
svgButton('apply → ⚖️', -248, -80, 128, () => { if (!animating) applyStagingOp(); }, 'editor');
svgButton('( )', -156, -80, 50, () => { staging.push({ k: 'op', t: '(' }, { k: 'op', t: ')' }); renderStaging(); chime('gather'); }, 'editor');
svgButton('=', -100, -80, 50, () => { staging.push({ k: 'eq', t: '=' }); renderStaging(); chime('gather'); }, 'editor');
svgButton('simplify', -20, -80, 100, () => { if (!animating) simplifyStaging(); }, 'editor');
svgButton('test 👍', 78, -80, 92, () => testStaging(), 'editor');
svgButton('clear', 160, -80, 66, () => { staging = []; renderStaging(); }, 'editor');

// ---- the editor's own Simplify: evaluate the staged numeric expression and,
// if it resolves to a WHOLE number, replace it with that number. 🌸🍕🌸 = 1÷1
// = 1 → 🌸. Fractions and anything with a variable are left as they are. ----
function evalExprTokens(toks) {
  if (toks.some((t) => t.k === 'var')) return null; // has a variable → won't resolve
  let result = null, termVal = null, sign = 1, curNum = '', pendingOp = '×';
  const flushNum = () => {
    if (curNum === '') return;
    const n = R.rat(BigInt(curNum));
    termVal = termVal === null ? n : (pendingOp === '/' ? R.div(termVal, n) : R.mul(termVal, n));
    curNum = '';
  };
  const flushTerm = () => {
    flushNum();
    if (termVal === null) return;
    const signed = sign < 0 ? R.neg(termVal) : termVal;
    result = result === null ? signed : R.add(result, signed);
    termVal = null; pendingOp = '×';
  };
  for (const t of toks) {
    if (t.k === 'num') curNum += t.t;
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
