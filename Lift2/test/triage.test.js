// The defend-vs-build stakes: the same crisis is winnable by good triage
// (defend what PRODUCES water) and lost by bad triage (defend the leaking
// depreciator). Deterministic: same seed, same crisis, only the fireman
// assignment differs.

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim/sim.js';

const SCENARIO = {
  start: { water: 40, firemen: 2 }, // only two firemen: you cannot hold both
  board: { cardTile: { x: 14, y: 1 } }, // the fast goo erupts far away...
  loans: { card: { spreadRate: 0.06 } },
  // both firemen together outspray the crisis pool's initial growth
  // (1.2 vs 0.9/mo) — winnable, but ONLY if they're on the right pool
  firemen: { sprayWaterPerMonth: 0.6 },
};

// Own a rental (income!) and a financed car (leaking); the fast card-goo
// erupts across the map — but debt drifts toward the pond, and the rental
// sits directly in its path. Ignore it and it arrives; fight it and it dies
// before it gets there.
function makeCrisis(assignTo) {
  const sim = createSim({ seed: 11, config: SCENARIO });
  sim.actions.buy('rental', { cell: { x: 9, y: 3 } }); // ON the drift path
  sim.actions.buy('car', { cell: { x: 8, y: 8 } }); // its loan pool sits contained nearby
  sim.actions.drawCredit(15); // the crisis: fast goo, close to the rental
  const pools = sim.snapshot().gooPools;
  const target = pools.find((p) => p.label === assignTo);
  for (const f of sim.state.firemen) sim.actions.assignFireman(f.id, target.id);
  for (let i = 0; i < 60 * 80; i++) sim.tick();
  return sim;
}

describe('defend vs build: triage', () => {
  it('good triage: defend the income producer, sacrifice the depreciator', () => {
    const sim = makeCrisis('card goo');
    const rental = sim.snapshot().instruments.find((i) => i.type === 'rental');
    expect(rental.destroyed).toBe(false); // the thing that makes water lives
    expect(sim.snapshot().derived.income).toBeCloseTo(2.0 + 1.2, 6);
    // and the card goo is beaten or at least contained
    const card = sim.snapshot().gooPools.find((p) => p.label === 'card goo');
    expect(card.closed || card.volume < 15).toBe(true);
  });

  it('bad triage: babysit the car loan, lose the income producer', () => {
    const sim = makeCrisis('car loan');
    const rental = sim.snapshot().instruments.find((i) => i.type === 'rental');
    expect(rental.destroyed).toBe(true); // the card goo ate the rental
    expect(sim.snapshot().derived.income).toBeCloseTo(2.0, 6); // rent gone
  });

  it('good triage ends strictly richer than bad triage', () => {
    const good = makeCrisis('card goo');
    const bad = makeCrisis('car loan');
    expect(good.snapshot().derived.netFlow).toBeGreaterThan(bad.snapshot().derived.netFlow);
    expect(good.state.main.level).toBeGreaterThan(bad.state.main.level);
  });
});
