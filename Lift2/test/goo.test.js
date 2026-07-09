// Goo spreads at its rate (fast vs slow really differ), overruns destroy
// assets, and firemen shrink it at a real water cost — no water, no defense.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

const NOPUMPS = { pumps: { jobRate: 0, essentialsRate: 0, lifestyleRate: 0 } };

describe('goo dynamics', () => {
  it('goo compounds at its spread rate; fast and slow pools really differ', () => {
    // far corner + drift off: this test measures pure compounding, with no
    // seam annihilation and no travel
    const sim = createSim({
      seed: 2,
      config: {
        ...NOPUMPS,
        board: { cardTile: { x: 14, y: 1 } },
        goo: { driftPerSpread: 0 },
      },
    });
    sim.actions.takeLoan(10); // bank: 0.01/mo
    sim.actions.drawCredit(10); // card: 0.04/mo
    for (let i = 0; i < 60 * 50; i++) sim.tick();
    const [bank, card] = sim.snapshot().gooPools;
    expect(bank.volume).toBeCloseTo(10 * Math.exp(0.01 * 50), 1); // ~16.5
    expect(card.volume).toBeCloseTo(10 * Math.exp(0.04 * 50), 0); // ~73.9
    expect(card.volume / bank.volume).toBeGreaterThan(4); // visibly different threats
  });

  it('goo that overruns an asset destroys it (and the debt survives the repo)', () => {
    const sim = createSim({
      seed: 2,
      config: {
        ...NOPUMPS,
        catalog: { car: { goo: { spreadRate: 0.05 } } }, // hot-rod loan for the test
      },
    });
    sim.actions.buy('car'); // financed by default
    for (let i = 0; i < 60 * 3; i++) sim.tick();
    expect(sim.state.instruments[0].destroyed).toBe(false); // contained at first
    for (let i = 0; i < 60 * 37; i++) sim.tick();
    expect(sim.state.instruments[0].destroyed).toBe(true);
    expect(sim.state.events.some((e) => e.type === 'destroyed')).toBe(true);
    // repossession does not erase the loan: the goo pool is still open
    expect(sim.snapshot().gooPools.some((p) => !p.closed && p.volume > 0)).toBe(true);
  });

  it('firemen shrink goo at exactly the water cost of principal + accrued interest', () => {
    const sim = createSim({ seed: 2, config: NOPUMPS });
    const poolId = sim.actions.takeLoan(10); // water: 20 + 10 = 30
    sim.actions.assignFireman(sim.state.firemen[0].id, poolId);
    sim.actions.assignFireman(sim.state.firemen[1].id, poolId);
    for (let i = 0; i < 60 * 20; i++) sim.tick();
    const pool = sim.state.gooPools[0];
    expect(pool.closed).toBe(true); // paid off
    expect(sim.state.events.some((e) => e.type === 'debt-cleared')).toBe(true);
    // total water sprayed = 10 principal + interest accrued while paying
    const sprayed = 30 - sim.state.main.level;
    expect(sprayed).toBeGreaterThan(10); // interest is never free
    expect(sprayed).toBeLessThan(11.5);
    // firemen released automatically when their pool closes
    expect(sim.state.firemen.every((f) => f.poolId === null)).toBe(true);
  });

  it('debt finds you: a far, neglected pool drifts to the pond and engages it', () => {
    const sim = createSim({
      seed: 2,
      config: {
        pumps: { jobRate: 2, essentialsRate: 0, lifestyleRate: 0 },
        board: { cardTile: { x: 14, y: 1 } }, // erupts as far away as possible
      },
    });
    sim.actions.drawCredit(5);
    const start = { ...sim.snapshot().gooPools[0] };
    for (let i = 0; i < 60 * 40; i++) sim.tick();
    const now = sim.snapshot().gooPools[0];
    const distStart = Math.hypot(start.x - 3, start.y - 6);
    const distNow = Math.hypot(now.x - 3, now.y - 6);
    expect(distNow).toBeLessThan(distStart - 5); // it traveled
    // ...and by now the seam is (or has been) fighting it: with income 2.0/mo
    // vs its growth, the pond wins the rate race eventually
    for (let i = 0; i < 60 * 100; i++) sim.tick();
    expect(sim.snapshot().gooPools[0].closed).toBe(true);
  });

  it('a dry tower means no defense: goo grows past deployed firemen', () => {
    const sim = createSim({ seed: 2, config: { ...NOPUMPS, start: { water: 0 } } });
    sim.actions.buy('car'); // financed: no water needed, 15 goo appears
    const pool = sim.snapshot().gooPools[0];
    for (const f of sim.state.firemen) sim.actions.assignFireman(f.id, pool.id);
    for (let i = 0; i < 60 * 5; i++) sim.tick();
    expect(sim.state.main.level).toBe(0);
    expect(sim.snapshot().derived.dry).toBe(true);
    expect(sim.snapshot().gooPools[0].volume).toBeGreaterThan(15); // grew unopposed
  });
});
