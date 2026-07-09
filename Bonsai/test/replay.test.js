// Determinism and replay: a tree is a pure function of (seed, action log).
// This is what makes the shared timelapse truthful — replaying the log
// reproduces exactly the tree the player grew, and stepping day-by-day is
// identical to jumping straight to the end.

import { describe, it, expect } from 'vitest';
import { createGame, loadGame } from '../src/sim/game.js';

function fingerprint(tree) {
  tree.recomputePositions();
  return tree.state.segments
    .map((s) => `${s.id}:${s.parent}:${s.x1.toFixed(6)},${s.y1.toFixed(6)},${s.thickness.toFixed(6)},${s.isTip ? 1 : 0}`)
    .join('|');
}

describe('deterministic replay', () => {
  it('same seed + same actions => identical tree', () => {
    const actions = [
      { day: 20, type: 'pinch', segId: 0 },
      { day: 45, type: 'wire', segId: 0, delta: 0.3 },
    ];
    const a = createGame({ seed: 11, actions }).simulateTo(200);
    const b = createGame({ seed: 11, actions }).simulateTo(200);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('a different seed grows a different tree', () => {
    const a = createGame({ seed: 1 }).simulateTo(150);
    const b = createGame({ seed: 2 }).simulateTo(150);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('stepping day-by-day matches jumping to the end (timelapse == live)', () => {
    const game = createGame({ seed: 8, actions: [{ day: 30, type: 'prune', segId: 1 }] });
    const frames = game.frames(180); // the timelapse, one tree per day
    const jumped = game.simulateTo(180);
    expect(frames.length).toBe(181); // day 0..180 inclusive
    expect(fingerprint(frames[frames.length - 1].tree)).toBe(fingerprint(jumped));
    // and growth is monotone in a quiet stretch: the tree never un-grows
    let prev = -1;
    for (let i = 1; i <= 20; i++) {
      const h = frames[i].tree.heightOf();
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
  });

  it('save/load round-trips a tree to the same fingerprint', () => {
    const game = createGame({ seed: 4 });
    game.act(10, { type: 'pinch', segId: 0 });
    game.act(25, { type: 'wire', segId: 0, delta: -0.4 });
    const reloaded = loadGame(game.save());
    expect(fingerprint(reloaded.simulateTo(120))).toBe(fingerprint(game.simulateTo(120)));
  });

  it('multiple actions per day are allowed and all replay deterministically', () => {
    const game = createGame({ seed: 4 });
    expect(game.act(5, { type: 'pinch', segId: 0 })).toBe(true);
    expect(game.act(5, { type: 'wire', segId: 0, delta: 0.3 })).toBe(true);
    expect(game.act(5, { type: 'pinch', segId: 1 })).toBe(true);
    expect(game.log.filter((a) => a.day === 5).length).toBe(3);
    // same-day actions apply in insertion order, and replay is reproducible
    const a = loadGame(game.save()).simulateTo(60);
    const b = loadGame(game.save()).simulateTo(60);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});
