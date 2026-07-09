// The rotation model: exact plane rotations, the maypole/monkey-bar split,
// the finite group, and the handedness flip only w-turns can produce.

import { describe, it, expect } from 'vitest';
import { det4, mul, transpose, matApproxEq, IDENTITY } from '../src/core/vec4.js';
import {
  PLANES, planeRotation, isMaypole, matKey, reachableGroup,
  preservesSlice, inducedSliceMap,
} from '../src/core/so4.js';

describe('plane rotations', () => {
  it('every plane rotation is in SO(4): orthogonal, det +1', () => {
    for (const plane of PLANES) {
      for (const angle of [90, 180, -90, 45, 137]) {
        const R = planeRotation(plane, angle);
        expect(matApproxEq(mul(R, transpose(R)), [...IDENTITY], 1e-12)).toBe(true);
        expect(det4(R)).toBeCloseTo(1, 12);
      }
    }
  });

  it('multiples of 90 produce exact integer matrices', () => {
    for (const plane of PLANES) {
      const R = planeRotation(plane, 90);
      for (const v of R) expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('the maypole / monkey-bar split', () => {
  it('every maypole rest orientation maps the slice to itself, preserving handedness', () => {
    const gens = ['xy', 'xz', 'yz'].map((p) => planeRotation(p, 90));
    const group = reachableGroup(gens);
    expect(group.size).toBe(24); // signed 3-axis permutations, det +1
    for (const R of group.values()) {
      expect(preservesSlice(R)).toBe(true);
      expect(inducedSliceMap(R).det).toBeCloseTo(1, 12); // NEVER a mirror
    }
  });

  it('a monkey-bar 90 does NOT map the slice to itself (it re-cuts)', () => {
    for (const plane of ['xw', 'yw', 'zw']) {
      expect(preservesSlice(planeRotation(plane, 90))).toBe(false);
    }
  });

  it('a monkey-bar 180 maps the slice to itself MIRRORED: the handedness flip', () => {
    const R = planeRotation('zw', 180);
    expect(preservesSlice(R)).toBe(true);
    const { det, m3 } = inducedSliceMap(R);
    expect(det).toBeCloseTo(-1, 12); // unreachable by any maypole composition
    // z -> -z on the slice
    expect(m3).toEqual([1, 0, 0, 0, 1, 0, 0, 0, -1]);
  });

  it('the full 90-degree group has order 192 and the maypole subgroup 24', () => {
    const all = reachableGroup(PLANES.map((p) => planeRotation(p, 90)));
    expect(all.size).toBe(192);
    // and matKey is exact: closure never produced a near-duplicate
    for (const [key, R] of all) expect(matKey(R)).toBe(key);
  });

  it('isMaypole classifies the six planes', () => {
    expect(PLANES.filter(isMaypole)).toEqual(['xy', 'xz', 'yz']);
  });
});

describe('non-commutativity (Act 2 is built on this)', () => {
  it('xy then xz differs from xz then xy', () => {
    const a = mul(planeRotation('xz', 90), planeRotation('xy', 90));
    const b = mul(planeRotation('xy', 90), planeRotation('xz', 90));
    expect(matKey(a)).not.toBe(matKey(b));
  });
});
