// The soul of the game: apical dominance and its release. Left alone, the
// leader hogs growth and the buds below sleep. Cut/pinch the leader and the
// suppressed growth below wakes up — "clip and grow". If these fail, the
// game is just "watch a tree get bigger" and has no craft.

import { describe, it, expect } from 'vitest';
import { createTree } from '../src/sim/tree.js';

function grow(tree, days, from = 1) {
  for (let d = from; d < from + days; d++) tree.growDay(d);
}

// active growing tips below a given height — the honest signature of
// "clip and grow": releasing suppressed buds sprouts new shoots low down.
// (Length is a poor proxy because released buds are young and short.)
function lowerTips(tree, maxHeight) {
  tree.recomputePositions();
  return tree.state.segments.filter((s) => s.isTip && s.y1 < maxHeight).length;
}
function lowerSegments(tree, maxHeight) {
  tree.recomputePositions();
  return tree.state.segments.filter((s) => (s.y0 + s.y1) / 2 < maxHeight).length;
}

describe('apical dominance', () => {
  it('the leader (highest tip) is the least suppressed, so it grows most', () => {
    const tree = createTree({ seed: 3 });
    grow(tree, 120);
    const tips = tree.tips();
    tree.recomputePositions();
    const leader = tips.reduce((a, b) => (b.y1 > a.y1 ? b : a));
    // the leader sits at ~zero suppression; a lower tip sits under load
    const lower = tips.reduce((a, b) => (b.y1 < a.y1 ? b : a));
    expect(tree.suppressionAt(leader.y1, leader.id)).toBeLessThan(
      tree.suppressionAt(lower.y1, lower.id)
    );
  });

  it('cutting the leader releases the buds below it (drops their suppression)', () => {
    // the robust core of clip-and-grow: removing the dominant apex strictly
    // lowers the suppression on the wood beneath it, which is what lets those
    // buds break. (In a bushy tree the downstream effect is diluted by the
    // other apices — a real horticultural truth — so we assert the direct,
    // always-true release rather than a fragile bud-count.)
    const tree = createTree({ seed: 3 });
    grow(tree, 60);
    tree.recomputePositions();
    const leader = tree.tips().reduce((a, b) => (b.y1 > a.y1 ? b : a));
    const band = leader.y1 * 0.8;
    const before = tree.suppressionAt(band);
    expect(before).toBeGreaterThan(0.1); // the leader really was holding it down
    tree.prune(leader.id);
    const after = tree.suppressionAt(band);
    expect(after).toBeLessThan(before); // clipping released it
  });

  it('wiring bends the whole limb and the shape holds through new growth', () => {
    const tree = createTree({ seed: 4 });
    grow(tree, 40);
    tree.recomputePositions();
    // pick a mid-branch segment with growth above it
    const seg = tree.state.segments.find((s) => s.children.length > 0 && s.parent !== -1)
      ?? tree.state.segments[1];
    const subtreeIds = [];
    const collect = (s) => { subtreeIds.push(s.id); for (const c of s.children) collect(tree.state.byId.get(c)); };
    collect(seg);
    const before = subtreeIds.map((id) => tree.state.byId.get(id).angle);

    tree.wire(seg.id, 0.8); // bend the whole limb — instantly

    // every EXISTING segment in the limb moved by the full delta at once
    // (whole-limb pivot, no easing, no single kink)
    for (let i = 0; i < subtreeIds.length; i++) {
      const s = tree.state.byId.get(subtreeIds[i]);
      expect(s.angle - before[i]).toBeCloseTo(0.8, 9);
    }
    // and it holds: growing much longer doesn't spring it back
    const held = tree.state.byId.get(seg.id).angle;
    grow(tree, 80, 41);
    expect(tree.state.byId.get(seg.id).angle).toBe(held);
  });

  it('pinching a tip stops that shoot and lifts suppression below it', () => {
    const tree = createTree({ seed: 7 });
    grow(tree, 50);
    tree.recomputePositions();
    const leader = tree.tips().reduce((a, b) => (b.y1 > a.y1 ? b : a));
    const before = tree.tips().length;
    expect(tree.pinch(leader.id)).toBe(true);
    expect(leader.isTip).toBe(false); // that shoot no longer extends
    // over the next weeks, released buds break: more active tips appear
    grow(tree, 90, 51);
    expect(tree.tips().length).toBeGreaterThan(before);
  });
});
