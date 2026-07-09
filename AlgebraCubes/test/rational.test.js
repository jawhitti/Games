import { describe, it, expect } from 'vitest';
import * as R from '../src/rational.js';

describe('rational arithmetic (exact, no floats)', () => {
  it('reduces and normalizes sign to the numerator', () => {
    expect(R.toString(R.rat(4, 8))).toBe('1/2');
    expect(R.toString(R.rat(2, -4))).toBe('-1/2');
    expect(R.toString(R.rat(-6, -3))).toBe('2');
    expect(R.toString(R.rat(0, 5))).toBe('0');
  });

  it('÷2 of an odd coefficient is 5/2, NOT 2.5', () => {
    const half = R.recip(R.rat(2));
    expect(R.toString(R.mul(R.rat(5), half))).toBe('5/2');
    // and it never becomes a float
    expect(typeof R.mul(R.rat(5), half).n).toBe('bigint');
  });

  it('add / sub / mul / div stay exact', () => {
    expect(R.toString(R.add(R.rat(1, 3), R.rat(1, 6)))).toBe('1/2');
    expect(R.toString(R.sub(R.rat(3), R.rat(1, 2)))).toBe('5/2');
    expect(R.toString(R.mul(R.rat(2, 3), R.rat(3, 4)))).toBe('1/2');
    expect(R.toString(R.div(R.rat(1), R.rat(3)))).toBe('1/3');
  });

  it('predicates', () => {
    expect(R.isOne(R.rat(1))).toBe(true);
    expect(R.isOne(R.rat(2, 2))).toBe(true);
    expect(R.isZero(R.rat(0, 9))).toBe(true);
    expect(R.isNeg(R.rat(-3, 4))).toBe(true);
    expect(R.eq(R.rat(2, 4), R.rat(1, 2))).toBe(true);
  });

  it('rejects zero denominators and zero reciprocals', () => {
    expect(() => R.rat(1, 0)).toThrow();
    expect(() => R.recip(R.rat(0))).toThrow();
    expect(() => R.div(R.rat(1), R.rat(0))).toThrow();
  });
});
