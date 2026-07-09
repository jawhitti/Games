// Diversification: one pop is survivable with a fleet, fatal with a single
// balloon. Grounding scatters creatures but keeps balloons.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

const QUIET = {
  balloon: { flicker: 0, growthRateJitter: 0, popRiskPerMonth: 0 },
  entropy: { baseRate: 0 },
  rain: { intensity: [0, 0] },
};

describe('pops and the ground', () => {
  it('a pop with a 5-balloon fleet is survivable', () => {
    const sim = createSim({
      seed: 3,
      config: { ...QUIET, fleet: { ...QUIET.fleet, startBalloons: 5 } },
    });
    // Load comfortably under 4 balloons' lift, over 0 balloons'.
    sim.actions.addPassenger({ financed: true, weight: 0.1 });
    sim.state.creatures[0].loanWeight0 = 0;

    sim.forcePop(sim.state.balloons[0].id);
    for (let i = 0; i < 60 * 50; i++) sim.tick(); // 50 months
    expect(sim.state.balloons.length).toBe(4);
    expect(sim.state.altitude).toBeGreaterThan(0);
    expect(sim.state.events.some((e) => e.type === 'ground')).toBe(false);
  });

  it('a single-balloon rig grounds when its balloon pops', () => {
    const sim = createSim({ seed: 3, config: QUIET });
    sim.actions.addPassenger({ financed: true, weight: 0.03 });

    sim.forcePop(sim.state.balloons[0].id);
    for (let i = 0; i < 60 * 30; i++) sim.tick();
    const groundEvent = sim.state.events.find((e) => e.type === 'ground');
    expect(groundEvent).toBeDefined();
    expect(groundEvent.creaturesLost).toBe(1);
    expect(sim.state.creatures.length).toBe(0); // everyone scattered
  });

  it('grounding scatters creatures but keeps the balloons', () => {
    const sim = createSim({
      seed: 3,
      config: { ...QUIET, fleet: { ...QUIET.fleet, startBalloons: 2 } },
    });
    // Overload past lift, but mildly: a total overload (say 50x lift) drains
    // the balloons to nothing before touchdown; here they must survive it.
    sim.actions.addPassenger({ financed: true, weight: 0.3 });
    sim.state.creatures[0].loanWeight0 = 0;
    for (let i = 0; i < 60 * 30; i++) sim.tick();

    expect(sim.state.events.some((e) => e.type === 'ground')).toBe(true);
    expect(sim.state.creatures.length).toBe(0); // the life is lost...
    expect(sim.state.balloons.length).toBe(2); // ...the means survive
    // Suddenly light, the rig rises again.
    for (let i = 0; i < 60 * 20; i++) sim.tick();
    expect(sim.state.altitude).toBeGreaterThan(0);
  });

  it('a grounded rig is docked: the ground carries the load, the balloon regrows', () => {
    const sim = createSim({ seed: 3, config: QUIET });
    // Drain the balloon far past the point where its lift could carry even
    // the empty gondola — the previously-unrescuable dead state.
    sim.state.balloons[0].logVolume = -5;
    sim.setAltitude(0);
    sim.tick();
    expect(sim.state.grounded).toBe(true);
    const v0 = sim.state.balloons[0].logVolume;
    for (let i = 0; i < 60 * 12; i++) sim.tick();
    expect(sim.state.balloons[0].logVolume).toBeGreaterThan(v0); // regrowing, not bleeding
    for (let i = 0; i < 60 * 200; i++) sim.tick();
    expect(sim.state.altitude).toBeGreaterThan(0); // ...and eventually lifts off
  });

  it('shedding a heavy creature can arrest the fall before grounding', () => {
    // Gondola weight off: after the balloon burned itself covering the
    // overload, its remaining lift must only beat an empty rig to recover.
    const sim = createSim({ seed: 3, config: { ...QUIET, fleet: { gondolaWeight: 0 } } });
    const id = sim.actions.addPassenger({ financed: true, weight: 0.3 });
    sim.state.creatures[0].loanWeight0 = 0;
    // Sink for a while, but shed before touching down.
    while (sim.state.altitude > 5) sim.tick();
    sim.actions.shedCreature(id);
    for (let i = 0; i < 60 * 20; i++) sim.tick();
    expect(sim.state.events.some((e) => e.type === 'ground')).toBe(false);
    expect(sim.state.altitude).toBeGreaterThan(5);
  });
});
