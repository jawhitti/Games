// Net flow drives getting-ahead/falling-behind; towers convert negative
// flow into a finite time-to-crisis (runway), not instant death.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

describe('net flow and runway', () => {
  it('positive net flow: getting ahead, infinite runway, tower rising', () => {
    const sim = createSim({ seed: 1 }); // default: job 2.0 vs expenses 1.7
    for (let i = 0; i < 60 * 10; i++) sim.tick();
    const d = sim.snapshot().derived;
    expect(d.netFlow).toBeCloseTo(0.3, 6);
    expect(d.runwayMonths).toBe(Infinity);
    expect(sim.state.main.level).toBeCloseTo(20 + 0.3 * 10, 3);
  });

  it('negative net flow: the tower is TIME, not safety', () => {
    const sim = createSim({
      seed: 1,
      config: { pumps: { jobRate: 2, essentialsRate: 3, lifestyleRate: 0 } },
    });
    sim.tick();
    // 20 water / 1.0 deficit = ~20 months of runway, visible immediately
    expect(sim.snapshot().derived.netFlow).toBeCloseTo(-1.0, 6);
    expect(sim.snapshot().derived.runwayMonths).toBeCloseTo(20, 0);
    // not instant death: still solvent at month 10...
    for (let i = 0; i < 60 * 10; i++) sim.tick();
    expect(sim.state.main.level).toBeGreaterThan(8);
    // ...broke a bit after month 20
    for (let i = 0; i < 60 * 15; i++) sim.tick();
    expect(sim.state.main.level).toBe(0);
  });

  it('cutting the lifestyle expense improves net flow immediately', () => {
    const sim = createSim({ seed: 1 });
    sim.tick();
    const before = sim.snapshot().derived.netFlow;
    const lifestyle = sim.state.pumps.find((p) => p.cuttable);
    expect(sim.actions.cutExpense(lifestyle.id)).toBe(true);
    sim.tick();
    expect(sim.snapshot().derived.netFlow).toBeCloseTo(before + 0.5, 6);
    // essentials cannot be cut
    const essentials = sim.state.pumps.find((p) => p.kind === 'expense' && !p.cuttable);
    expect(sim.actions.cutExpense(essentials.id)).toBe(false);
  });
});
