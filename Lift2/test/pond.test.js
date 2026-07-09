// The pond and THE LAW: goo and water always annihilate 1:1 — spray, pump,
// or seam contact. Goo's menace is purely that it compounds.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

const NOPUMPS = { pumps: { jobRate: 0, essentialsRate: 0, lifestyleRate: 0 } };

describe('the pond and the seam', () => {
  it('seam contact annihilates exactly 1:1 (conservation across the seam)', () => {
    const sim = createSim({
      seed: 4,
      config: { ...NOPUMPS, loans: { bank: { spreadRate: 0 } } }, // freeze growth
    });
    sim.actions.takeLoan(10); // water 30, goo 10
    // drag the pool onto the pond so the seam engages
    const pool = sim.state.gooPools[0];
    pool.x = sim.state.main.x;
    pool.y = sim.state.main.y;
    for (let i = 0; i < 60 * 10; i++) sim.tick();
    const waterLost = 30 - sim.state.main.level;
    const gooLost = 10 - sim.snapshot().gooPools[0].volume;
    expect(waterLost).toBeGreaterThan(1); // the seam is really working
    expect(waterLost).toBeCloseTo(gooLost, 9); // and it is exactly 1:1
  });

  it('the seam is a rate race: income above goo growth wins it eventually', () => {
    const sim = createSim({
      seed: 4,
      config: { pumps: { jobRate: 2, essentialsRate: 0, lifestyleRate: 0 } },
    });
    sim.actions.takeLoan(10); // 1%/mo growth = 0.1/mo vs +2.0/mo income
    const pool = sim.state.gooPools[0];
    pool.x = sim.state.main.x;
    pool.y = sim.state.main.y;
    for (let i = 0; i < 60 * 60; i++) sim.tick();
    expect(sim.state.gooPools[0].closed).toBe(true); // the pond ate the debt
    expect(sim.state.main.level).toBeGreaterThan(20); // and kept growing after
  });

  it('defense pump: standing service that pays principal + interest, 1:1', () => {
    const sim = createSim({ seed: 4, config: NOPUMPS });
    sim.actions.takeLoan(10); // pool at loanTile (1,9); water 30
    // NOT adjacent: a 10-goo blob has radius ~1.1, and a pump built inside
    // the blob is overrun (swallowed) and never runs. Stand off two tiles.
    const built = sim.actions.buildPump({ cell: { x: 3, y: 9 } });
    expect(built).toBeTruthy();
    expect(sim.state.main.level).toBe(25); // build cost left the pond
    for (let i = 0; i < 60 * 40; i++) sim.tick();
    const pool = sim.state.gooPools[0];
    expect(pool.closed).toBe(true); // 0.5/mo vs 0.1/mo growth: serviced off
    const sprayed = 25 - sim.state.main.level;
    expect(sprayed).toBeGreaterThan(10); // principal + interest, never free
    expect(sprayed).toBeLessThan(12);
    // idle pump keeps its tile but moves no water
    for (let i = 0; i < 60 * 5; i++) sim.tick();
    expect(sim.snapshot().derived.pumpRate).toBe(0);
  });

  it('a pump out of range does nothing; selling it salvages half the price', () => {
    const sim = createSim({ seed: 4, config: NOPUMPS });
    sim.actions.takeLoan(10); // pool at (1,9)
    const id = sim.actions.buildPump({ cell: { x: 14, y: 1 } }); // far corner
    for (let i = 0; i < 60 * 10; i++) sim.tick();
    expect(sim.snapshot().derived.pumpRate).toBe(0);
    expect(sim.snapshot().gooPools[0].volume).toBeGreaterThan(10); // untouched
    const salvage = sim.actions.sell(id);
    expect(salvage).toBeCloseTo(2.5, 9); // half of 5 back — sunk cost is real
  });
});
