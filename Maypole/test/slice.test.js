// Slicing: exact at rest, smooth mid-swing, and honest about walls that
// thin to nothing and rooms that phase in.

import { describe, it, expect } from 'vitest';
import { IDENTITY } from '../src/core/vec4.js';
import { planeRotation } from '../src/core/so4.js';
import { sliceCell, sliceBuilding } from '../src/core/slice.js';

const cube = { min: [0, 0, 0, -0.5], max: [1, 1, 1, 0.5] };

describe('slicing at rest', () => {
  it('a w-straddling unit cube slices to itself', () => {
    const poly = sliceCell(cube, [...IDENTITY]);
    expect(poly).not.toBeNull();
    expect(poly.vertices.length).toBe(8);
    expect(poly.faces.length).toBe(6);
    expect(poly.volume).toBeCloseTo(1, 9);
  });

  it('a cell whose w-interval merely touches 0 still slices to its full face', () => {
    const poly = sliceCell({ min: [0, 0, 0, 0], max: [1, 1, 1, 1] }, [...IDENTITY]);
    expect(poly).not.toBeNull();
    expect(poly.volume).toBeCloseTo(1, 9);
  });

  it('a cell displaced in w is absent', () => {
    expect(sliceCell({ min: [0, 0, 0, 0.5], max: [1, 1, 1, 1.5] }, [...IDENTITY])).toBeNull();
  });
});

describe('slicing mid-swing (the re-cut is continuous)', () => {
  it('xw at 45 degrees: the slice is the analytically correct slab', () => {
    const cell = { min: [-1, 0, 0, -0.5], max: [1, 1, 1, 0.5] };
    const poly = sliceCell(cell, planeRotation('xw', 45));
    expect(poly).not.toBeNull();
    // binding constraint is the w-extent: |x| <= 0.5/sin(45) = sqrt(2)/2
    expect(poly.volume).toBeCloseTo(Math.SQRT2, 6);
  });

  it('volume varies continuously through a swing, no NaN and no jumps', () => {
    const cell = { min: [-1, 0, 0, -0.5], max: [1, 1, 1, 0.5] };
    let prev = null;
    for (let a = 0; a <= 90; a += 3) {
      const poly = sliceCell(cell, planeRotation('xw', a));
      expect(poly).not.toBeNull();
      expect(Number.isFinite(poly.volume)).toBe(true);
      if (prev !== null) expect(Math.abs(poly.volume - prev)).toBeLessThan(0.3);
      prev = poly.volume;
    }
  });

  it('a sealed room phases IN partway through the swing, not at the end', () => {
    // absent at rest; the timing window the spec builds puzzles on
    const vault = { min: [-0.5, 0, 0, 1], max: [0.5, 1, 1, 2] };
    expect(sliceCell(vault, planeRotation('xw', 0))).toBeNull();
    expect(sliceCell(vault, planeRotation('xw', 45))).toBeNull();
    expect(sliceCell(vault, planeRotation('xw', 75))).not.toBeNull();
    const done = sliceCell(vault, planeRotation('xw', 90));
    expect(done.volume).toBeCloseTo(1, 6);
  });

  it('maypole rotations never re-cut: slice volume is invariant', () => {
    const cell = { min: [0, 0, 0, -0.5], max: [2, 1, 3, 0.5] };
    for (const plane of ['xy', 'xz', 'yz']) {
      for (const a of [30, 45, 90, 137]) {
        const poly = sliceCell(cell, planeRotation(plane, a));
        expect(poly.volume).toBeCloseTo(6, 6); // 2*1*3, always
      }
    }
  });
});

describe('sliceBuilding', () => {
  it('skips absent cells and keeps source indices', () => {
    const cells = [cube, { min: [0, 0, 0, 3], max: [1, 1, 1, 4] }];
    const slices = sliceBuilding(cells, [...IDENTITY]);
    expect(slices.length).toBe(1);
    expect(slices[0].cellIndex).toBe(0);
  });
});
