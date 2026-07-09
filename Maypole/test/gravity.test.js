// Gravity is the SUN: a constant direction, indifferent to how the building
// is turned. Rotating the building never moves gravity — that is why walls
// become floors.

import { describe, it, expect } from 'vitest';
import { IDENTITY } from '../src/core/vec4.js';
import { planeRotation } from '../src/core/so4.js';
import { resolveGravity, SUN_G } from '../src/core/gravity.js';

describe('the sun (constant gravity)', () => {
  it('down is screen-bottom, with no w component, ever', () => {
    const gv = resolveGravity([...IDENTITY]);
    expect(gv.g).toEqual([0, -1, 0, 0]);
    expect(gv.screenDown).toEqual([0, -1]);
    expect(gv.wash).toBe(0);
  });

  it('is unchanged by ANY building rotation — maypole or monkey-bar', () => {
    for (const plane of ['xy', 'xz', 'yz', 'xw', 'yw', 'zw']) {
      for (const angle of [90, 180, -90, 45]) {
        // resolveGravity ignores R by design; assert the model is truly
        // orientation-independent
        const gv = resolveGravity(planeRotation(plane, angle));
        expect(gv.g).toEqual(SUN_G);
        expect(gv.roll).toBe(0);
      }
    }
  });

  it('never acquires a w component: nothing is ever pulled off the slice', () => {
    // things fall out of sealed rooms because their FLOORS rotate out of
    // the slice, not because gravity leaves space
    expect(SUN_G[3]).toBe(0);
  });
});
