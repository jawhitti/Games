// §9 invariants & acceptance tests. These run in CI against EVERY level in
// levels/ — a level that ships without passing them doesn't ship.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apply } from '../src/core/vec4.js';
import { PLANES, planeRotation, isMaypole, preservesSlice, inducedSliceMap, mul, matKey, IDENTITY } from '../src/core/so4.js';
import { sliceCell } from '../src/core/slice.js';
import { loadLevel } from '../src/core/level.js';
import { verify } from '../src/core/verify.js';

const levelsDir = fileURLToPath(new URL('../levels/', import.meta.url));
const levels = readdirSync(levelsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => loadLevel(JSON.parse(readFileSync(levelsDir + f, 'utf8'))));

function boxCorners(cell) {
  const out = [];
  for (let m = 0; m < 16; m++) {
    out.push([0, 1, 2, 3].map((k) => (m & (1 << k) ? cell.max[k] : cell.min[k])));
  }
  return out;
}

describe('§9.1 rigid rotation: rotation, not distortion', () => {
  it('all pairwise vertex distances are invariant at every interpolation t', () => {
    const cell = { min: [-1.5, -1, 0.25, -0.5], max: [2, 0, 1, 1.5] };
    const rest = boxCorners(cell);
    const restDist = [];
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        restDist.push(Math.hypot(...rest[i].map((v, k) => v - rest[j][k])));
      }
    }
    for (const plane of PLANES) {
      for (const t of [0.1, 0.25, 0.5, 0.77, 1]) {
        const R = planeRotation(plane, 90 * t);
        const pts = rest.map((p) => apply(R, p));
        let n = 0;
        for (let i = 0; i < 16; i++) {
          for (let j = i + 1; j < 16; j++) {
            const d = Math.hypot(...pts[i].map((v, k) => v - pts[j][k]));
            expect(Math.abs(d - restDist[n++])).toBeLessThan(1e-9);
          }
        }
      }
    }
  });
});

describe('§9.2 handedness (continuous-angle form)', () => {
  it('any maypole rotation at ANY angle induces det +1 on the slice', () => {
    for (const plane of ['xy', 'xz', 'yz']) {
      for (const a of [17, 45, 90, 133, 180]) {
        const R = planeRotation(plane, a);
        expect(preservesSlice(R)).toBe(true);
        expect(inducedSliceMap(R).det).toBeCloseTo(1, 9);
      }
    }
  });

  it('every monkey-bar 180 induces det -1 on the slice', () => {
    for (const plane of ['xw', 'yw', 'zw']) {
      const R = planeRotation(plane, 180);
      expect(preservesSlice(R)).toBe(true);
      expect(inducedSliceMap(R).det).toBeCloseTo(-1, 9);
    }
  });
});

describe('§9.3 slice continuity and tangency', () => {
  it('no NaN and no negative volume through an exact tangency', () => {
    // this box's slice appears exactly at 45 deg of an xw swing; sweep
    // through the tangency, including the exact grazing angle
    const cell = { min: [-0.5, 0, 0, 0.5], max: [0.5, 1, 1, 1.5] };
    for (let a = 0; a <= 90; a += 0.5) {
      const poly = sliceCell(cell, planeRotation('xw', a));
      if (poly) {
        expect(Number.isFinite(poly.volume)).toBe(true);
        expect(poly.volume).toBeGreaterThan(0);
      }
    }
    // at the exact tangency the slice is a zero-volume sliver: reported
    // as absent, never as NaN
    expect(sliceCell(cell, planeRotation('xw', 45))).toBeNull();
  });
});

describe('§9.7 determinism', () => {
  it('the same switch sequence always produces the same orientation', () => {
    const seq = [['xy', 90], ['xw', 90], ['yz', -90], ['zw', 180], ['xw', 90]];
    const run = () =>
      matKey(seq.reduce((R, [p, a]) => mul(planeRotation(p, a), R), [...IDENTITY]));
    expect(run()).toBe(run());
  });

  it('verification is repeatable state-for-state', () => {
    for (const level of levels) {
      const a = verify(level);
      const b = verify(level);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});

describe('§9.4 + §9.5: every shipped level', () => {
  it('there is at least one shipped level', () => {
    expect(levels.length).toBeGreaterThan(0);
  });

  for (const level of levels) {
    it(`${level.id}: goal is reachable`, () => {
      expect(verify(level).reachable).toBe(true);
    });
  }

  for (const level of levels.filter((l) => l.needsW)) {
    it(`${level.id}: tagged needs-w — maypole subgraph MUST fail`, () => {
      expect(verify(level, { maypoleOnly: true }).reachable).toBe(false);
    });
  }
});
