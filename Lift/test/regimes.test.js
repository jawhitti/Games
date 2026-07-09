// The governing rule's three regimes: surplus grows, matched holds exactly,
// overload spirals (accelerating shrink, not linear decline).

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

const QUIET = {
  balloon: { flicker: 0, growthRateJitter: 0, popRiskPerMonth: 0 },
  fleet: { gondolaWeight: 0 },
  entropy: { baseRate: 0 },
  rain: { intensity: [0, 0] },
};

describe('lift vs load regimes', () => {
  it('unloaded: grows (log-volume increases)', () => {
    const sim = createSim({ seed: 1, config: QUIET });
    for (let i = 0; i < 60 * 10; i++) sim.tick();
    expect(sim.state.balloons[0].logVolume).toBeGreaterThan(0);
  });

  it('matched: size and altitude hold exactly over a very long run', () => {
    const sim = createSim({ seed: 1, config: QUIET });
    const r = sim.state.balloons[0].growthRate;
    // Load exactly equal to lift at volume 1: growth term cancels to zero.
    sim.actions.addPassenger({ financed: true, weight: r });
    sim.state.creatures[0].loanWeight0 = 0; // pure weight, no loan schedule

    const alt0 = sim.state.altitude;
    for (let i = 0; i < 60 * 10000; i++) sim.tick(); // 10,000 game-months
    // No drift from float error: matched means matched.
    expect(Math.abs(sim.state.balloons[0].logVolume)).toBeLessThan(1e-9);
    expect(Math.abs(sim.state.altitude - alt0)).toBeLessThan(1e-6);
  });

  it('overloaded: shrink accelerates (a spiral, not a line)', () => {
    // Pin altitude (climbRate 0) so the rig can't ground and scatter the
    // load before the spiral has time to express itself.
    const sim = createSim({
      seed: 1,
      config: { ...QUIET, altitude: { climbRate: 0, sinkRate: 0 } },
    });
    const r = sim.state.balloons[0].growthRate;
    // 1.2x lift: overloaded but gently, so all four sample blocks land
    // before the balloon drains to the numeric floor (the spiral finishes
    // fast — at 2x load a volume-1 balloon empties in ~14 months).
    sim.actions.addPassenger({ financed: true, weight: 1.2 * r });
    sim.state.creatures[0].loanWeight0 = 0;

    const logV = [];
    for (let block = 0; block < 4; block++) {
      for (let i = 0; i < 60 * 5; i++) sim.tick(); // 5-month blocks
      logV.push(sim.state.balloons[0].logVolume);
    }
    const d1 = logV[1] - logV[0];
    const d2 = logV[2] - logV[1];
    const d3 = logV[3] - logV[2];
    expect(d1).toBeLessThan(0);
    expect(d2).toBeLessThan(d1); // each block shrinks MORE than the last
    expect(d3).toBeLessThan(d2);
  });

  it('size and altitude are separate: a big balloon can be sinking', () => {
    const sim = createSim({ seed: 1, config: QUIET });
    // Grow big first...
    for (let i = 0; i < 60 * 100; i++) sim.tick();
    const bigLogV = sim.state.balloons[0].logVolume;
    expect(bigLogV).toBeGreaterThan(Math.log(100));
    // ...then overload it well past its (now large) lift.
    const lift = sim.state.derived.totalLift;
    sim.actions.addPassenger({ financed: true, weight: 3 * lift });
    sim.state.creatures[0].loanWeight0 = 0;
    const altBefore = sim.state.altitude;
    for (let i = 0; i < 60 * 2; i++) sim.tick();
    // Still big, but sinking: size high, altitude falling.
    expect(sim.state.balloons[0].logVolume).toBeGreaterThan(Math.log(50));
    expect(sim.state.altitude).toBeLessThan(altBefore);
  });
});
