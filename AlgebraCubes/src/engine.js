// The engine: pure Equation -> {equation, delta} functions. ZERO rendering,
// ZERO DOM. It never knows how a term is drawn. Every op returns a brand-new
// equation plus a structured delta so a renderer can animate from the delta
// without re-deriving anything.
//
// A term is a value riding on a typed cube. A coefficient (2x) and a constant
// (5) are the SAME shape of object — that unification is load-bearing.

import * as R from './rational.js';

// ---- construction ----
export function varTerm(id, varName, coeff) {
  return { id, kind: 'var', varName, coeff };
}
export function constTerm(id, value) {
  return { id, kind: 'const', varName: null, coeff: value };
}
// A parenthesis: a CONTAINER cube holding a sub-expression, with an optional
// scalar coeff riding on the whole group (so 2(x+3) is a group, coeff 2).
// Same "value on a typed cube" idea — the value here just happens to be a
// held expression.
export function groupTerm(id, terms, coeff = R.rat(1)) {
  return { id, kind: 'group', varName: null, coeff, terms };
}
// Not-a-Number: what you get when you divide by zero. It propagates and we
// just roll with it.
export function nanTerm(id) {
  return { id, kind: 'nan', varName: null, coeff: R.rat(0) };
}
export function hasNaN(eq) {
  return eq.left.some((t) => t.kind === 'nan') || eq.right.some((t) => t.kind === 'nan');
}

// 2x + 5 = 3y
export function seedEquation() {
  return {
    left: [varTerm('x1', 'x', R.rat(2)), constTerm('c1', R.rat(5))],
    right: [varTerm('y1', 'y', R.rat(3))],
  };
}

// ---- helpers ----
function locate(eq, termId) {
  for (const side of ['left', 'right']) {
    const index = eq[side].findIndex((t) => t.id === termId);
    if (index !== -1) return { side, index, term: eq[side][index] };
  }
  throw new Error(`no term with id ${termId}`);
}

const other = (side) => (side === 'left' ? 'right' : 'left');

function like(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'const') return true;
  return a.varName === b.varName;
}

function clone(eq) {
  return { left: [...eq.left], right: [...eq.right] };
}

// ---- operations ----

// Move a term to the other side, negating its coefficient.
export function crossEquals(eq, termId) {
  const loc = locate(eq, termId);
  const moved = { ...loc.term, coeff: R.neg(loc.term.coeff) };
  const out = clone(eq);
  out[loc.side] = out[loc.side].filter((t) => t.id !== termId);
  out[other(loc.side)] = [...out[other(loc.side)], moved];
  return {
    equation: out,
    delta: { type: 'cross', termId, from: loc.side, to: other(loc.side), newCoeff: moved.coeff },
  };
}

// Merge two like terms on the same side; coefficients add. The merged term
// keeps the FIRST term's id (b flies into a), which the renderer animates.
// Rejects unlike terms and cross-side pairs — that is illegal algebra, not a
// merely-unhelpful move.
export function gather(eq, termIdA, termIdB) {
  if (termIdA === termIdB) throw new Error('gather: same term twice');
  const a = locate(eq, termIdA);
  const b = locate(eq, termIdB);
  if (a.side !== b.side) throw new Error('gather: terms are on different sides');
  if (!like(a.term, b.term)) throw new Error('gather: unlike terms cannot combine');
  const sum = R.add(a.term.coeff, b.term.coeff);
  const merged = { ...a.term, coeff: sum };
  const out = clone(eq);
  out[a.side] = out[a.side]
    .map((t) => (t.id === termIdA ? merged : t))
    .filter((t) => t.id !== termIdB);
  return {
    equation: out,
    delta: { type: 'gather', consumed: [termIdA, termIdB], produced: termIdA, newCoeff: sum },
  };
}

// Multiply every term on BOTH sides by a nonzero rational k. k may be a
// reciprocal, so this is also "divide both sides".
export function scaleBoth(eq, k) {
  if (R.isZero(k)) throw new Error('scaleBoth: k must be nonzero');
  const perTerm = [];
  const scaleSide = (side) =>
    side.map((t) => {
      const coeff = R.mul(t.coeff, k);
      perTerm.push({ termId: t.id, newCoeff: coeff });
      return { ...t, coeff };
    });
  const out = { left: scaleSide(eq.left), right: scaleSide(eq.right) };
  return { equation: out, delta: { type: 'scale', k, perTerm } };
}

// ---- select-a-range-and-operate surface ----
// The player selects a CONTIGUOUS range of cubes on one side, then picks an
// operator that combines them. The operands are the selected cubes.

const pid = (ids, sep) => `(${ids.join(sep)})`;

function selectionSpan(eq, ids) {
  if (!ids || ids.length < 1) throw new Error('nothing selected');
  const locs = ids.map((id) => locate(eq, id)).sort((a, b) => a.index - b.index);
  const side = locs[0].side;
  if (!locs.every((l) => l.side === side)) throw new Error('selection spans both sides');
  const minIdx = locs[0].index;
  const maxIdx = locs[locs.length - 1].index;
  if (maxIdx - minIdx + 1 !== ids.length) throw new Error('selection must be contiguous');
  return { side, minIdx, maxIdx, terms: locs.map((l) => l.term) };
}

function replaceSpan(eq, side, minIdx, maxIdx, produced) {
  const out = clone(eq);
  out[side] = [...eq[side].slice(0, minIdx), produced, ...eq[side].slice(maxIdx + 1)];
  return out;
}

// op is one of '+', '-', '*', '/'. Combines the selected cubes into one.
export function applyOperator(eq, ids, op) {
  const { side, minIdx, maxIdx, terms } = selectionSpan(eq, ids);
  let produced;

  if (op === '+' || op === '-') {
    if (!terms.every((t) => like(terms[0], t))) {
      throw new Error('cannot combine unlike terms with + / −');
    }
    let c = terms[0].coeff;
    for (let i = 1; i < terms.length; i++) {
      c = op === '+' ? R.add(c, terms[i].coeff) : R.sub(c, terms[i].coeff);
    }
    produced = { ...terms[0], coeff: c }; // keep first id: others fly in
  } else if (op === '*') {
    let num = R.rat(1);
    const factors = [];
    for (const t of terms) {
      num = R.mul(num, t.coeff);
      if (t.kind !== 'const') factors.push(t);
    }
    if (factors.length === 0) produced = constTerm(pid(ids, '*'), num);
    else if (factors.length === 1 && factors[0].kind === 'var') {
      produced = varTerm(pid(ids, '*'), factors[0].varName, num);
    } else {
      // real product of variables/groups — a container, placeholder for FOIL
      produced = groupTerm(pid(ids, '*'), factors.map((f) => ({ ...f, coeff: R.rat(1) })), num);
    }
  } else if (op === '/') {
    let cur = terms[0];
    for (let i = 1; i < terms.length; i++) {
      const t = terms[i];
      if (t.kind === 'const') {
        cur = { ...cur, coeff: R.div(cur.coeff, t.coeff) };
      } else if (cur.kind === 'var' && t.kind === 'var' && cur.varName === t.varName) {
        cur = constTerm(pid(ids, '/'), R.div(cur.coeff, t.coeff)); // x/x, 2x/x
      } else if (cur.kind === 'const' && t.kind === 'const') {
        cur = constTerm(pid(ids, '/'), R.div(cur.coeff, t.coeff));
      } else {
        throw new Error('unsupported division (needs a fraction container — later)');
      }
    }
    produced = { ...cur, id: pid(ids, '/') };
  } else {
    throw new Error(`unknown operator ${op}`);
  }

  return {
    equation: replaceSpan(eq, side, minIdx, maxIdx, produced),
    delta: { type: 'combine', op, consumed: ids, produced: produced.id, newCoeff: produced.coeff },
  };
}

// Wrap the selected contiguous range into a parenthesis container.
export function groupTerms(eq, ids) {
  const { side, minIdx, maxIdx, terms } = selectionSpan(eq, ids);
  const produced = groupTerm(pid(ids, '|'), terms.map((t) => ({ ...t })));
  return {
    equation: replaceSpan(eq, side, minIdx, maxIdx, produced),
    delta: { type: 'group', consumed: ids, produced: produced.id },
  };
}

// Append a term to a side (used by the toolbox to build expressions). This is
// a free EDIT, not a value-preserving algebra move.
export function appendTerm(eq, side, term) {
  const out = clone(eq);
  out[side] = [...out[side], term];
  return { equation: out, delta: { type: 'append', side, id: term.id } };
}

// Negate both sides: flip the sign of every term's coefficient. Multiplying
// an equation through by −1.
export function negateBoth(eq) {
  const neg = (t) => ({ ...t, coeff: R.neg(t.coeff) });
  return {
    equation: { left: eq.left.map(neg), right: eq.right.map(neg) },
    delta: { type: 'negate' },
  };
}

// Add a whole TERM (const or variable, e.g. −y or 2x) to both sides. The
// template carries kind/varName/coeff; each side gets its own fresh id.
let _addc = 0;
export function addTermBoth(eq, template) {
  const mk = (tag) => ({
    id: `t${++_addc}${tag}`, kind: template.kind, varName: template.varName ?? null, coeff: template.coeff,
  });
  return {
    equation: { left: [...eq.left, mk('L')], right: [...eq.right, mk('R')] },
    delta: { type: 'addTerm' },
  };
}

// Add a constant to BOTH sides (the "+n / −n to both sides" typed move).
// Appends a const term to each side; combine with a later gather if wanted.
export function addBoth(eq, n) {
  if (R.isZero(n)) throw new Error('addBoth: n must be nonzero');
  const idL = `add${++_addc}L`, idR = `add${++_addc}R`;
  return {
    equation: { left: [...eq.left, constTerm(idL, n)], right: [...eq.right, constTerm(idR, n)] },
    delta: { type: 'addBoth', n, produced: [idL, idR] },
  };
}

// Wrap each side in a parenthesis carrying a pending × or ÷ — the LITERAL,
// un-distributed form. `(3 − 5y)/2` is a group with coeff 1/2; nothing is
// evaluated until distribute() folds the coeff into the children.
let _grpc = 0;
export function wrapBoth(eq, op, k) {
  if (op === '/' && R.isZero(k)) {
    // divide by zero → NaN. Both sides break. Undo to recover.
    return {
      equation: { left: [nanTerm(`nan${++_grpc}L`)], right: [nanTerm(`nan${++_grpc}R`)] },
      delta: { type: 'nan' },
    };
  }
  if (R.isZero(k)) throw new Error('wrap: k must be nonzero');
  const coeff = op === '/' ? R.recip(k) : k;
  const wrap = (side, tag) =>
    side.length ? [groupTerm(`w${++_grpc}${tag}`, side.map((t) => ({ ...t })), coeff)] : side;
  return {
    equation: { left: wrap(eq.left, 'L'), right: wrap(eq.right, 'R') },
    delta: { type: 'wrap', op, k, coeff },
  };
}

// The distributive law as a rewrite: fold a group's coeff into each child
// term and splice them back loose. (3 − 5y)/2 -> 3/2 − 5/2·y.
export function distribute(eq, groupId) {
  const loc = locate(eq, groupId);
  if (loc.term.kind !== 'group') throw new Error('distribute: not a group');
  const children = loc.term.terms.map((t) => ({ ...t, coeff: R.mul(t.coeff, loc.term.coeff) }));
  const out = clone(eq);
  out[loc.side] = [...eq[loc.side].slice(0, loc.index), ...children, ...eq[loc.side].slice(loc.index + 1)];
  return { equation: out, delta: { type: 'distribute', groupId, produced: children.map((c) => c.id) } };
}

// distribute every group on both sides in a single step
export function distributeAll(eq) {
  const out = clone(eq);
  for (const s of ['left', 'right']) {
    const arr = [];
    for (const t of out[s]) {
      if (t.kind === 'group') arr.push(...t.terms.map((c) => ({ ...c, coeff: R.mul(c.coeff, t.coeff) })));
      else arr.push(t);
    }
    out[s] = arr;
  }
  return { equation: out, delta: { type: 'distributeAll' } };
}

export function hasGroup(eq) {
  return eq.left.some((t) => t.kind === 'group') || eq.right.some((t) => t.kind === 'group');
}

// Remove zero-coefficient terms (e.g. after 1 + (−1) gathers to 0). If a side
// empties entirely, leave a single 0. Returns a plain equation.
export function dropZeros(eq) {
  const clean = (side) => {
    const f = side.filter((t) => !R.isZero(t.coeff));
    return f.length ? f : [constTerm(`z${++_grpc}`, R.rat(0))];
  };
  return { left: clean(eq.left), right: clean(eq.right) };
}

// Auto-settle: combine ALL like terms on each side (consts together, each
// variable together) and drop zeros. Groups are left alone. First-appearance
// order is kept. This is the "board tidies itself" pass run after every move.
export function combineAll(eq) {
  const combineSide = (side) => {
    if (side.some((t) => t.kind === 'nan')) return [nanTerm(`nan${++_grpc}`)]; // NaN eats the side
    const order = [];
    const byKey = new Map();
    for (const t of side) {
      if (t.kind === 'group') { order.push({ term: t }); continue; }
      const key = t.kind === 'const' ? 'const' : `var:${t.varName}`;
      if (byKey.has(key)) byKey.get(key).coeff = R.add(byKey.get(key).coeff, t.coeff);
      else { const e = { id: t.id, kind: t.kind, varName: t.varName, coeff: t.coeff }; byKey.set(key, e); order.push({ ref: e }); }
    }
    const out = [];
    for (const o of order) {
      if (o.term) out.push(o.term);
      else if (!R.isZero(o.ref.coeff)) out.push(o.ref);
    }
    return out.length ? out : [constTerm(`z${++_grpc}`, R.rat(0))];
  };
  return { left: combineSide(eq.left), right: combineSide(eq.right) };
}

// Simplify everything: expand any parentheses, then combine all like terms.
// Coefficients stay EXACT rationals — a division that lands on a whole number
// shows as an integer; one that doesn't (like 3/2, or anything with a
// variable) just stays as it is. Nothing is forced.
export function simplifyAll(eq) {
  const distributed = distributeAll(eq).equation;
  return { equation: combineAll(distributed), delta: { type: 'simplify' } };
}

// Does the board have anything to tidy — repeated like terms, or a redundant 0?
export function needsSettle(eq) {
  for (const s of ['left', 'right']) {
    const side = eq[s];
    const seen = new Set();
    for (const t of side) {
      if (t.kind === 'group') continue;
      const key = t.kind === 'const' ? 'const' : `var:${t.varName}`;
      if (seen.has(key)) return true;
      seen.add(key);
      if (R.isZero(t.coeff) && side.length > 1) return true;
    }
  }
  return false;
}

// Distribution / product of sums (FOIL). STUB — expands a group. Milestone 4.
export function fan() {
  throw new Error('fan: not implemented (milestone 4 — FOIL/distribution)');
}

// ---- lookups for the UI (still pure, still no rendering) ----
export function getTerm(eq, id) {
  try { return locate(eq, id).term; } catch { return null; }
}
export function sideOf(eq, id) {
  try { return locate(eq, id).side; } catch { return null; }
}
export function areLike(eq, idA, idB) {
  const a = getTerm(eq, idA), b = getTerm(eq, idB);
  return !!a && !!b && a.id !== b.id && like(a, b);
}

// The goal for THIS prototype: solved iff the LEFT side is exactly the single
// variable `varName` with coeff 1, and that variable is absent from the right.
// Left-only, and specific to the target variable — y being isolated does not
// count.
export function isSolvedLeft(eq, varName) {
  const L = eq.left;
  return (
    L.length === 1 &&
    L[0].kind === 'var' &&
    L[0].varName === varName &&
    R.isOne(L[0].coeff) &&
    !eq.right.some((r) => r.kind === 'var' && r.varName === varName)
  );
}

// ---- goal test ----
// Solved iff one side is exactly [one var term of varName, coeff 1] and the
// other side contains no term of that varName.
export function isSolved(eq, varName) {
  const oneSideIsIsolated = (a, b) =>
    a.length === 1 &&
    a[0].kind === 'var' &&
    a[0].varName === varName &&
    R.isOne(a[0].coeff) &&
    !b.some((t) => t.kind === 'var' && t.varName === varName);
  return oneSideIsIsolated(eq.left, eq.right) || oneSideIsIsolated(eq.right, eq.left);
}

// ---- session: full undo, so exploration never traps ----
export function createSession(initial) {
  const history = [initial];
  return {
    current: () => history[history.length - 1],
    // op: (eq) => {equation, delta}. Applies, records, returns the delta.
    apply(op) {
      const { equation, delta } = op(history[history.length - 1]);
      history.push(equation);
      return delta;
    },
    undo() {
      if (history.length > 1) history.pop();
      return history[history.length - 1];
    },
    replaceTop(eq) { history[history.length - 1] = eq; },
    list: () => history.slice(),
    canUndo: () => history.length > 1,
    depth: () => history.length,
  };
}
