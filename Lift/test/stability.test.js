// The make-or-break requirement: a balloon compounding unattended reaches
// >= 1e6x its starting volume without NaN/Inf/precision collapse, and
// displaySize stays bounded and monotonic the whole way.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

// Everything stochastic or external off: pure compounding.
const QUIET = {
  balloon: { flicker: 0, growthRateJitter: 0, popRiskPerMonth: 0 },
  fleet: { gondolaWeight: 0 },
  entropy: { baseRate: 0 },
  rain: { intensity: [0, 0] },
};

describe('numerical stability at extreme growth', () => {
  it('compounds to 1e6x and beyond without numerical failure', () => {
    const sim = createSim({ seed: 42, config: QUIET });
    const b = () => sim.state.balloons[0];
    const dt = sim.config.time.tickDt;
    const r = b().growthRate;

    const monthsTo1e6 = Math.log(1e6) / r;
    const displaySamples = [];
    let months = 0;
    while (months < monthsTo1e6 + 1) {
      sim.tick(dt);
      months += dt;
      if (displaySamples.length < months) {
        displaySamples.push(sim.snapshot().balloons[0].displaySize);
      }
    }

    expect(Number.isFinite(b().logVolume)).toBe(true);
    expect(b().logVolume).toBeGreaterThanOrEqual(Math.log(1e6));

    // displaySize: bounded and monotonically non-decreasing
    const { sizeMin, sizeMax } = sim.config.display;
    for (let i = 0; i < displaySamples.length; i++) {
      expect(displaySamples[i]).toBeGreaterThanOrEqual(sizeMin);
      expect(displaySamples[i]).toBeLessThanOrEqual(sizeMax);
      if (i > 0) {
        expect(displaySamples[i]).toBeGreaterThanOrEqual(displaySamples[i - 1]);
      }
    }

    // Keep going to 1e12x — still finite, display still bounded.
    const monthsTo1e12 = Math.log(1e12) / r;
    while (months < monthsTo1e12 + 1) {
      sim.tick(dt);
      months += dt;
    }
    expect(Number.isFinite(b().logVolume)).toBe(true);
    expect(b().logVolume).toBeGreaterThanOrEqual(Math.log(1e12));
    expect(Number.isFinite(sim.state.derived.totalLift)).toBe(true);
    const snap = sim.snapshot();
    expect(snap.balloons[0].displaySize).toBeLessThanOrEqual(sim.config.display.sizeMax);
  });

  it('stays finite with flicker and rain on over a long session', () => {
    const sim = createSim({
      seed: 7,
      config: { balloon: { popRiskPerMonth: 0 } },
    });
    for (let i = 0; i < 400 * 60; i++) sim.tick(); // 400 game-months
    const snap = sim.snapshot();
    expect(Number.isFinite(snap.balloons[0].logVolume)).toBe(true);
    expect(Number.isFinite(snap.derived.totalLift)).toBe(true);
    expect(Number.isFinite(snap.altitude)).toBe(true);
    expect(snap.balloons[0].displaySize).toBeLessThanOrEqual(sim.config.display.sizeMax);
  });
});
