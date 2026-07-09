// Same seed => identical sessions, tick for tick. Different seed => different.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

// Pops stay on-seed too, but a popped balloon would make the later
// balloon-indexed assertions fragile — keep them off here.
const NOPOP = { balloon: { popRiskPerMonth: 0 } };

describe('seedable determinism', () => {
  it('two sims with the same seed stay bit-identical', () => {
    const a = createSim({ seed: 123, config: NOPOP });
    const b = createSim({ seed: 123, config: NOPOP });
    for (const sim of [a, b]) {
      sim.actions.addPassenger({ financed: true });
      sim.actions.moveTo(80, 20);
      for (let i = 0; i < 60 * 120; i++) sim.tick(); // 120 months, rain+flicker on
    }
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });

  it('a different seed produces a different session', () => {
    const a = createSim({ seed: 123 });
    const b = createSim({ seed: 124 });
    for (let i = 0; i < 60 * 20; i++) {
      a.tick();
      b.tick();
    }
    expect(JSON.stringify(a.snapshot())).not.toBe(JSON.stringify(b.snapshot()));
  });

  it('advance() with ragged frame times matches fixed ticking', () => {
    const a = createSim({ seed: 9, config: NOPOP });
    const b = createSim({ seed: 9, config: NOPOP });
    const dt = a.config.time.tickDt;
    // a: 600 clean ticks. b: the same span fed as irregular real-time slices,
    // finishing with a flush past the 600th tick boundary so float error in
    // the accumulated slices can't leave a tick ambiguously un-executed.
    for (let i = 0; i < 600; i++) a.tick(dt);
    const total = 600 * dt; // months == seconds at monthsPerSecond 1
    let fed = 0;
    const rag = [0.013, 0.031, 0.007, 0.049, 0.017];
    let i = 0;
    while (fed < total - 0.1) {
      const slice = rag[i++ % rag.length];
      b.advance(slice);
      fed += slice;
    }
    b.advance(total + dt / 2 - fed);
    expect(b.state.month).toBe(a.state.month);
    expect(b.state.balloons[0].logVolume).toBe(a.state.balloons[0].logVolume);
  });
});
