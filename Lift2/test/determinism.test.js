// Same seed + same actions => bit-identical sessions (including the house's
// volatile value, which consumes the seeded gaussian stream).

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

describe('seedable determinism', () => {
  it('two sims with the same seed stay identical through a volatile session', () => {
    const run = () => {
      const sim = createSim({ seed: 42, config: { start: { water: 200 } } });
      sim.actions.buy('house');
      sim.actions.buy('rental');
      sim.actions.takeLoan(10);
      const pool = sim.state.gooPools.find((p) => p.label === 'bank loan');
      sim.actions.assignFireman(sim.state.firemen[0].id, pool.id);
      for (let i = 0; i < 60 * 100; i++) sim.tick();
      return JSON.stringify(sim.snapshot());
    };
    expect(run()).toBe(run());
  });

  it('a different seed produces a different session', () => {
    const run = (seed) => {
      const sim = createSim({ seed, config: { start: { water: 200 } } });
      sim.actions.buy('house'); // volatile => consumes the rng
      for (let i = 0; i < 60 * 20; i++) sim.tick();
      return JSON.stringify(sim.snapshot());
    };
    expect(run(1)).not.toBe(run(2));
  });
});
