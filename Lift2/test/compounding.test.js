// The master primitive: a self-feeding pump compounds stably over a long
// session; the reinvest valve open vs closed = growth vs flat.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

const NOPUMPS = { pumps: { jobRate: 0, essentialsRate: 0, lifestyleRate: 0 } };

describe('self-feeding pump (compounding)', () => {
  it('valve open (reinvest): compounds hugely with no numerical failure', () => {
    const sim = createSim({ seed: 1, config: NOPUMPS });
    const id = sim.actions.invest(10);
    expect(id).toBeTruthy();
    const inst = sim.state.instruments[0];
    const fills = [];
    for (let m = 0; m < 600; m++) {
      for (let i = 0; i < 60; i++) sim.tick();
      if (m % 20 === 0) fills.push(sim.snapshot().instruments[0].fill);
    }
    // ln(10) + 0.015 * 600 = 11.3 -> ~81,000 water: an 8000x session
    const logV = inst.stored.logValue;
    expect(Number.isFinite(logV)).toBe(true);
    expect(logV).toBeGreaterThan(Math.log(10) + 0.015 * 600 - 0.01);
    // display fill: bounded 0..1 and monotonically non-decreasing
    for (let i = 0; i < fills.length; i++) {
      expect(fills[i]).toBeGreaterThanOrEqual(0);
      expect(fills[i]).toBeLessThanOrEqual(1);
      if (i > 0) expect(fills[i]).toBeGreaterThanOrEqual(fills[i - 1]);
    }
    // keep going: 2000 more months (~e^30 total). Still finite, still 0..1.
    for (let i = 0; i < 60 * 2000; i++) sim.tick();
    expect(Number.isFinite(inst.stored.logValue)).toBe(true);
    const snap = sim.snapshot();
    expect(snap.instruments[0].fill).toBeLessThanOrEqual(1);
    expect(Number.isFinite(snap.derived.wealthFlow)).toBe(true);
  });

  it('valve closed (consume): tower stays exactly flat, stream goes to main', () => {
    const sim = createSim({ seed: 1, config: NOPUMPS });
    const id = sim.actions.invest(10);
    sim.actions.setValve(id, 'consume');
    const logV0 = sim.state.instruments[0].stored.logValue;
    for (let i = 0; i < 60 * 100; i++) sim.tick();
    // consuming the stream is what halts the growth — exactly
    expect(sim.state.instruments[0].stored.logValue).toBe(logV0);
    // the stream landed in the main tower: 0.015 * 10 * 100 months = 15
    expect(sim.state.main.level).toBeCloseTo(10 + 15, 3);
  });

  it('reopening the valve resumes growth from where it left off', () => {
    const sim = createSim({ seed: 1, config: NOPUMPS });
    const id = sim.actions.invest(10);
    sim.actions.setValve(id, 'consume');
    for (let i = 0; i < 60 * 50; i++) sim.tick();
    sim.actions.setValve(id, 'reinvest');
    const v0 = sim.state.instruments[0].stored.logValue;
    for (let i = 0; i < 60 * 50; i++) sim.tick();
    expect(sim.state.instruments[0].stored.logValue).toBeCloseTo(v0 + 0.015 * 50, 6);
  });
});
