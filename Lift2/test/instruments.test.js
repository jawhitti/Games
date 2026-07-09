// The instrument grid: each row of the spec's table must be expressible,
// including the seams where naive models teach lies.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

const NOPUMPS = { pumps: { jobRate: 0, essentialsRate: 0, lifestyleRate: 0 } };

describe('the instrument grid', () => {
  it('car: stored water leaks to ~zero while the goo is still owed (underwater)', () => {
    const sim = createSim({ seed: 3, config: NOPUMPS });
    sim.actions.buy('car'); // financed: 15 goo, 15 stored value
    for (let i = 0; i < 60 * 12; i++) sim.tick();
    let snap = sim.snapshot();
    // underwater within a year: value fell, goo grew
    expect(snap.instruments[0].value).toBeLessThan(snap.instruments[0].gooOwed);
    for (let i = 0; i < 60 * 48; i++) sim.tick(); // to month 60
    snap = sim.snapshot();
    expect(snap.instruments[0].value).toBeLessThan(1.5); // ~9% of price: ~zero
    expect(snap.instruments[0].gooOwed).toBeGreaterThan(15); // still compounding
  });

  it('house: value is volatile — it can genuinely FALL, and drop under the goo', () => {
    const sim = createSim({ seed: 7, config: { ...NOPUMPS, start: { water: 200 } } });
    sim.actions.buy('house'); // mortgaged: 60 goo + permanent upkeep trickle
    const values = [];
    let underwater = false;
    for (let m = 0; m < 120; m++) {
      for (let i = 0; i < 60; i++) sim.tick();
      const inst = sim.snapshot().instruments[0];
      values.push(inst.value);
      if (inst.value < inst.gooOwed) underwater = true;
    }
    expect(Math.max(...values)).toBeGreaterThan(60); // it goes up...
    expect(Math.min(...values)).toBeLessThan(60); // ...and it goes DOWN
    expect(underwater).toBe(true); // and yes, below what's owed
  });

  it('rental: the boring true asset — no goo, holds value, PRODUCES water', () => {
    const sim = createSim({ seed: 3, config: { ...NOPUMPS, start: { water: 40 } } });
    sim.actions.buy('rental'); // cash: 30
    expect(sim.state.main.level).toBe(10);
    expect(sim.state.gooPools.length).toBe(0); // no goo, none
    for (let i = 0; i < 60 * 10; i++) sim.tick();
    expect(sim.snapshot().derived.income).toBeCloseTo(1.2, 6);
    expect(sim.state.main.level).toBeCloseTo(10 + 1.2 * 10, 3);
    expect(sim.snapshot().instruments[0].value).toBeCloseTo(30, 6); // holds
  });

  it('paid-off house still oozes permanent upkeep-goo — a floor, not zero', () => {
    const sim = createSim({ seed: 3, config: { ...NOPUMPS, start: { water: 200 } } });
    sim.actions.buy('house');
    const mortgage = sim.state.gooPools.find((p) => p.label === 'mortgage');
    const upkeep = sim.state.gooPools.find((p) => p.label === 'upkeep');
    // pay the mortgage off entirely with a lump spray
    const paid = sim.actions.spray(mortgage.id, 100);
    expect(paid).toBeCloseTo(60, 6);
    expect(mortgage.closed).toBe(true);
    // the upkeep trickle continues anyway
    for (let i = 0; i < 60 * 20; i++) sim.tick();
    expect(upkeep.closed).toBe(false);
    const owed = sim.snapshot().gooPools.find((p) => p.label === 'upkeep').volume;
    expect(owed).toBeCloseTo(0.06 * 20, 1);
    // spraying it down works, but it can never be closed — it regrows
    sim.actions.spray(upkeep.id, 10);
    expect(upkeep.closed).toBe(false);
    for (let i = 0; i < 60 * 10; i++) sim.tick();
    expect(sim.snapshot().gooPools.find((p) => p.label === 'upkeep').volume).toBeGreaterThan(0.3);
  });

  it('selling reclaims CURRENT worth only; underwater sale leaves goo behind', () => {
    const sim = createSim({ seed: 3, config: NOPUMPS });
    sim.actions.buy('car');
    for (let i = 0; i < 60 * 24; i++) sim.tick(); // car worth ~5.7, loan ~18.2
    const before = sim.snapshot().instruments[0];
    expect(before.value).toBeLessThan(before.gooOwed);
    const waterBefore = sim.state.main.level;
    const proceeds = sim.actions.sell(before.id);
    // all proceeds went to the loan, nothing hit the tower...
    expect(proceeds).toBe(0);
    expect(sim.state.main.level).toBe(waterBefore);
    // ...and the leftover goo is STILL THERE, now with no car attached
    const pool = sim.snapshot().gooPools[0];
    expect(pool.closed).toBe(false);
    expect(pool.volume).toBeCloseTo(before.gooOwed - before.value, 1);
  });
});
