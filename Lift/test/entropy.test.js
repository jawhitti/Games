// The phase change: at low altitude the player keeps up with entropy solo;
// past a threshold, accrual exceeds solo capacity and levels rise until
// crew is added. This must emerge from the numbers, not a scripted switch.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

// Freeze altitude (climbRate 0) so each test pins its own value.
const PINNED = {
  balloon: { flicker: 0, growthRateJitter: 0, popRiskPerMonth: 0 },
  altitude: { climbRate: 0, sinkRate: 0 },
  rain: { intensity: [0, 0] },
};

function totalEntropy(sim) {
  return Object.values(sim.state.entropy).reduce((s, e) => s + e.level, 0);
}

describe('entropy phase change', () => {
  it('low altitude: solo capacity keeps every kind at zero', () => {
    const sim = createSim({ seed: 5, config: PINNED });
    sim.setAltitude(20);
    for (let i = 0; i < 60 * 50; i++) sim.tick();
    expect(totalEntropy(sim)).toBeLessThan(1e-9);
  });

  it('high altitude: accrual exceeds solo capacity and levels climb', () => {
    const sim = createSim({ seed: 5, config: PINNED });
    sim.setAltitude(2000); // unlocks all kinds, accrual scaled way up
    for (let i = 0; i < 60 * 50; i++) sim.tick();
    expect(totalEntropy(sim)).toBeGreaterThan(1);
  });

  it('the solo-capacity threshold exists strictly between low and high', () => {
    // Scan altitudes; net pressure (accrual*kinds - soloCapacity) must cross
    // from negative to positive exactly once — a real, tunable threshold.
    const losing = [];
    for (const alt of [20, 200, 500, 800, 1100, 1400, 1700, 2000]) {
      const sim = createSim({ seed: 5, config: PINNED });
      sim.setAltitude(alt);
      for (let i = 0; i < 60 * 20; i++) sim.tick();
      losing.push(totalEntropy(sim) > 0.01);
    }
    expect(losing[0]).toBe(false); // solo wins at the bottom
    expect(losing[losing.length - 1]).toBe(true); // solo loses at the top
    // Monotone crossing: once losing, always losing at higher altitude.
    const firstLoss = losing.indexOf(true);
    expect(firstLoss).toBeGreaterThan(0);
    for (let i = firstLoss; i < losing.length; i++) expect(losing[i]).toBe(true);
  });

  it('crew reverses a losing kind, and their departure resumes the loss', () => {
    const sim = createSim({ seed: 5, config: PINNED });
    sim.setAltitude(2000);
    for (let i = 0; i < 60 * 30; i++) sim.tick();
    const before = sim.state.entropy.leak.level;
    expect(before).toBeGreaterThan(0);

    sim.actions.addCrew('leak', { stayMonths: 20 });
    for (let i = 0; i < 60 * 15; i++) sim.tick();
    const during = sim.state.entropy.leak.level;
    expect(during).toBeLessThan(before); // crew eats it faster than it accrues

    for (let i = 0; i < 60 * 10; i++) sim.tick(); // timer expires at month 20
    expect(sim.state.creatures.some((c) => c.kind === 'crew')).toBe(false);
    expect(sim.state.events.some((e) => e.type === 'crew-left')).toBe(true);
    for (let i = 0; i < 60 * 15; i++) sim.tick();
    expect(sim.state.entropy.leak.level).toBeGreaterThan(during); // winning again
  });

  it('kinds unlock at altitude and stay unlocked', () => {
    const sim = createSim({ seed: 5, config: PINNED });
    sim.setAltitude(20);
    sim.tick();
    let snap = sim.snapshot();
    expect(snap.entropy.leak.active).toBe(true);
    expect(snap.entropy.garbage.active).toBe(false);
    expect(snap.entropy.hunger.active).toBe(false);

    sim.setAltitude(900);
    sim.tick();
    sim.setAltitude(10); // fall back down — unlocks don't re-lock
    sim.tick();
    snap = sim.snapshot();
    expect(snap.entropy.garbage.active).toBe(true);
    expect(snap.entropy.hunger.active).toBe(true);
  });
});
