import { describe, it, expect } from 'vitest';
import { createTree } from '../src/sim/tree.js';
import { seasonOf, CONFIG } from '../src/sim/config.js';

function grow(tree, days, from = 1) {
  for (let d = from; d < from + days; d++) tree.growDay(d);
}

describe('basic growth', () => {
  it('a seedling grows upward and stays numerically sane over a full year', () => {
    const tree = createTree({ seed: 5 });
    grow(tree, 360);
    const h = tree.heightOf();
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBeGreaterThan(2); // it became a small tree
    for (const s of tree.state.segments) {
      expect(Number.isFinite(s.x1)).toBe(true);
      expect(Number.isFinite(s.y1)).toBe(true);
      expect(s.thickness).toBeGreaterThan(0);
    }
  });

  it('the trunk ends up thicker than the twigs it carries', () => {
    const tree = createTree({ seed: 5 });
    grow(tree, 360);
    const trunk = tree.state.segments.find((s) => s.parent === -1);
    const tipThicknesses = tree.tips().map((t) => t.thickness);
    expect(trunk.thickness).toBeGreaterThan(Math.max(...tipThicknesses));
  });

  it('seasons scale growth: a spring day outgrows a winter day', () => {
    const spring = createTree({ seed: 9 });
    const winter = createTree({ seed: 9 });
    // grow both to the same size, then compare one spring vs one winter day
    grow(spring, 30);
    grow(winter, 30);
    const hs0 = spring.heightOf(), hw0 = winter.heightOf();
    spring.growDay(10); // deep spring
    winter.growDay(280); // deep winter
    expect(spring.heightOf() - hs0).toBeGreaterThan((winter.heightOf() - hw0) * 3);
    expect(seasonOf(10).name).toBe('spring');
    expect(seasonOf(280).name).toBe('winter');
  });
});
