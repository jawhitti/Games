// Level model + reachability verifier, exercised on the sealed-vault level:
// the goal room is provably unreachable on the maypole subgraph and
// reachable once the disguised w-switch is allowed. This proof shape is
// exactly what Act 3 reveals and Act 4's chirality locks depend on.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadLevel, cellIndexAt } from '../src/core/level.js';
import { verify } from '../src/core/verify.js';

const raw = JSON.parse(
  readFileSync(new URL('../levels/3-01-sealed-vault.json', import.meta.url), 'utf8')
);

describe('level model', () => {
  it('loads and validates the sealed-vault level', () => {
    const level = loadLevel(raw);
    expect(level.cells.length).toBe(2);
    expect(cellIndexAt(level, level.start)).toBe(0);
    expect(cellIndexAt(level, level.goal)).toBe(1);
  });

  it('rejects malformed levels with specific errors', () => {
    expect(() => loadLevel({ ...raw, cells: [] })).toThrow(/no cells/);
    expect(() =>
      loadLevel({ ...raw, switches: [{ ...raw.switches[0], angle: 45 }] })
    ).toThrow(/angle/);
    expect(() => loadLevel({ ...raw, start: [99, 99, 99, 0] })).toThrow(/start/);
  });
});

describe('reachability verifier', () => {
  it('the vault is sealed to maypole switches: provably unreachable', () => {
    const level = loadLevel(raw);
    const result = verify(level, { allowedSwitchIds: ['s0'] });
    expect(result.reachable).toBe(false);
    expect(result.statesExplored).toBeGreaterThan(0); // it really searched
  });

  it('the w-switch opens it: reachable, and the path uses s1', () => {
    const level = loadLevel(raw);
    const result = verify(level);
    expect(result.reachable).toBe(true);
    const switchesUsed = result.path.filter((v) => v.type.startsWith('switch'));
    expect(switchesUsed.some((v) => v.id === 's1')).toBe(true);
  });

  it('the search space stays finite and small', () => {
    const level = loadLevel(raw);
    const result = verify(level);
    // 2 cells x at most 192 orientations = 384 states max
    expect(result.statesExplored).toBeLessThanOrEqual(384);
  });
});
