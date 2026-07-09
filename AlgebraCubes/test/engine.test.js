import { describe, it, expect } from 'vitest';
import * as R from '../src/rational.js';
import {
  seedEquation, varTerm, constTerm,
  crossEquals, gather, scaleBoth, fan, isSolved, createSession,
  applyOperator, groupTerms,
} from '../src/engine.js';

// find a term's signed coeff as a string, for compact assertions
function coeffStr(eq, id) {
  for (const side of ['left', 'right']) {
    const t = eq[side].find((x) => x.id === id);
    if (t) return R.toString(t.coeff);
  }
  return undefined;
}
const sideVarNames = (side) => side.map((t) => `${R.toString(t.coeff)}${t.varName ?? ''}`).join(' ');

describe('crossEquals', () => {
  it('moves a term across = and negates its coefficient', () => {
    const eq = seedEquation(); // 2x + 5 = 3y
    const { equation, delta } = crossEquals(eq, 'c1');
    expect(equation.left.map((t) => t.id)).toEqual(['x1']); // 5 left the left
    expect(coeffStr(equation, 'c1')).toBe('-5'); // now -5 on the right
    expect(equation.right.some((t) => t.id === 'c1')).toBe(true);
    expect(delta).toEqual({ type: 'cross', termId: 'c1', from: 'left', to: 'right', newCoeff: R.rat(-5) });
    // original untouched (pure)
    expect(eq.left.length).toBe(2);
  });
});

describe('gather', () => {
  it('merges like terms; coefficients add; first id is kept', () => {
    const eq = { left: [varTerm('a', 'x', R.rat(2)), varTerm('b', 'x', R.rat(3))], right: [] };
    const { equation, delta } = gather(eq, 'a', 'b');
    expect(equation.left.length).toBe(1);
    expect(coeffStr(equation, 'a')).toBe('5'); // 2x + 3x = 5x
    expect(delta).toMatchObject({ type: 'gather', consumed: ['a', 'b'], produced: 'a' });
  });

  it('rejects unlike terms and cross-side pairs (illegal, not just unhelpful)', () => {
    const unlike = { left: [varTerm('a', 'x', R.rat(2)), constTerm('b', R.rat(5))], right: [] };
    expect(() => gather(unlike, 'a', 'b')).toThrow(/unlike/);
    const varXvarY = { left: [varTerm('a', 'x', R.rat(1)), varTerm('b', 'y', R.rat(1))], right: [] };
    expect(() => gather(varXvarY, 'a', 'b')).toThrow(/unlike/);
    const split = { left: [varTerm('a', 'x', R.rat(1))], right: [varTerm('b', 'x', R.rat(1))] };
    expect(() => gather(split, 'a', 'b')).toThrow(/different sides/);
  });
});

describe('scaleBoth', () => {
  it('multiplies EVERY term on both sides, constants included', () => {
    const eq = seedEquation(); // 2x + 5 = 3y
    const { equation, delta } = scaleBoth(eq, R.recip(R.rat(2))); // ÷2
    expect(coeffStr(equation, 'x1')).toBe('1'); // 2x -> x
    expect(coeffStr(equation, 'c1')).toBe('5/2'); // 5 -> 5/2
    expect(coeffStr(equation, 'y1')).toBe('3/2'); // 3y -> 3/2 y
    expect(delta.type).toBe('scale');
    expect(delta.perTerm.length).toBe(3);
  });

  it('rejects k = 0', () => {
    expect(() => scaleBoth(seedEquation(), R.rat(0))).toThrow();
  });
});

describe('isSolved', () => {
  it('true only when the variable is alone with coefficient 1 and absent elsewhere', () => {
    // x = (3/2)y - 5/2  — solved for x
    const solved = {
      left: [varTerm('x1', 'x', R.rat(1))],
      right: [varTerm('y1', 'y', R.rat(3, 2)), constTerm('c1', R.rat(-5, 2))],
    };
    expect(isSolved(solved, 'x')).toBe(true);
    // 2x = ... is not solved (coeff 2)
    expect(isSolved({ left: [varTerm('x1', 'x', R.rat(2))], right: [] }, 'x')).toBe(false);
    // x on both sides is not solved
    const both = { left: [varTerm('x1', 'x', R.rat(1))], right: [varTerm('x2', 'x', R.rat(1))] };
    expect(isSolved(both, 'x')).toBe(false);
  });
});

describe('MILESTONE 1: scripted solve of 2x + 5 = 3y for x', () => {
  it('cross the 5, halve both sides -> x = (3/2)y - 5/2', () => {
    const s = createSession(seedEquation());
    expect(isSolved(s.current(), 'x')).toBe(false);

    s.apply((eq) => crossEquals(eq, 'c1')); // 2x = 3y - 5
    s.apply((eq) => scaleBoth(eq, R.recip(R.rat(2)))); // x = (3/2)y - 5/2

    const eq = s.current();
    expect(sideVarNames(eq.left)).toBe('1x');
    expect(coeffStr(eq, 'y1')).toBe('3/2');
    expect(coeffStr(eq, 'c1')).toBe('-5/2');
    expect(isSolved(eq, 'x')).toBe(true);
  });
});

describe('exploration guarantees', () => {
  it('legal-but-unhelpful moves execute honestly (never refused or corrected)', () => {
    // from a solved-for-x state, ×2 moves you AWAY — engine must comply
    const s = createSession({ left: [varTerm('x1', 'x', R.rat(1))], right: [constTerm('c1', R.rat(3))] });
    s.apply((eq) => scaleBoth(eq, R.rat(2))); // 2x = 6 — worse, but true
    expect(coeffStr(s.current(), 'x1')).toBe('2');
    expect(isSolved(s.current(), 'x')).toBe(false);
  });

  it('undo restores the previous equation exactly', () => {
    const s = createSession(seedEquation());
    s.apply((eq) => crossEquals(eq, 'c1'));
    expect(s.current().left.length).toBe(1);
    s.undo();
    expect(s.current().left.map((t) => t.id)).toEqual(['x1', 'c1']); // back to seed
    expect(s.canUndo()).toBe(false);
  });
});

describe('select-a-range-and-operate', () => {
  const eq = () => ({
    left: [varTerm('a', 'x', R.rat(3)), varTerm('b', 'x', R.rat(2)), constTerm('c', R.rat(5))],
    right: [],
  });

  it('+ combines selected like terms', () => {
    const { equation } = applyOperator(eq(), ['a', 'b'], '+'); // 3x + 2x -> 5x
    expect(coeffStr(equation, 'a')).toBe('5');
    expect(equation.left.length).toBe(2); // 5x, 5
  });

  it('+ rejects unlike terms', () => {
    expect(() => applyOperator(eq(), ['b', 'c'], '+')).toThrow(/unlike/);
  });

  it('× scales a term by a selected constant (3 · 2x style)', () => {
    const e = { left: [constTerm('k', R.rat(3)), varTerm('v', 'x', R.rat(2))], right: [] };
    const { equation, delta } = applyOperator(e, ['k', 'v'], '*'); // 3 * 2x -> 6x
    const merged = equation.left[0];
    expect(merged.kind).toBe('var');
    expect(R.toString(merged.coeff)).toBe('6');
    expect(delta.op).toBe('*');
  });

  it('× of two variables makes a container (product placeholder)', () => {
    const e = { left: [varTerm('p', 'x', R.rat(2)), varTerm('q', 'y', R.rat(3))], right: [] };
    const { equation } = applyOperator(e, ['p', 'q'], '*'); // 2x * 3y -> group, coeff 6
    const g = equation.left[0];
    expect(g.kind).toBe('group');
    expect(R.toString(g.coeff)).toBe('6');
    expect(g.terms.length).toBe(2);
  });

  it('÷ cancels same-variable and divides constants', () => {
    const e = { left: [varTerm('n', 'x', R.rat(6)), varTerm('d', 'x', R.rat(2))], right: [] };
    expect(R.toString(applyOperator(e, ['n', 'd'], '/').equation.left[0].coeff)).toBe('3'); // 6x/2x = 3
  });

  it('( ) wraps a contiguous range into a container holding the sub-expression', () => {
    const { equation, delta } = groupTerms(eq(), ['b', 'c']); // (2x + 5)
    expect(equation.left.length).toBe(2); // 3x, (2x+5)
    const g = equation.left[1];
    expect(g.kind).toBe('group');
    expect(g.terms.map((t) => t.id)).toEqual(['b', 'c']);
    expect(delta.type).toBe('group');
  });

  it('requires a contiguous selection', () => {
    expect(() => applyOperator(eq(), ['a', 'c'], '+')).toThrow(/contiguous/);
  });
});

describe('fan (FOIL) is a typed placeholder', () => {
  it.todo('distributes a product of sums — milestone 4');
  it('throws until implemented', () => {
    expect(() => fan()).toThrow(/not implemented/);
  });
});
