// The tree: a deterministic function of (seed, action log). Growth happens
// at TIPS (segments whose far end holds a live apical meristem). Left alone,
// apical dominance concentrates growth in the highest tip and puts the buds
// below it to sleep — the tree runs leggy and upward. The craft, and the
// game, is cutting/pinching the leader to RELEASE those lower buds.
//
// State at day N is rebuilt by replaying the log from day 0, so the timelapse
// a player shares is literally a re-simulation — it can never drift from what
// really happened.

import { CONFIG, seasonOf } from './config.js';
import { makeRng, mixSeed } from '../rng.js';

// A segment: one internode. Position is derived by walking from the root, so
// bending a parent (wire) bends everything above it for free.
function makeSegment(id, parent, angle, opts = {}) {
  return {
    id,
    parent, // id or -1
    children: [],
    angle, // absolute, radians; 0 = straight up, +x to the right
    length: 0.02,
    maxLength: CONFIG.growth.segmentMaxLength,
    thickness: CONFIG.wood.startThickness,
    age: 0,
    isTip: opts.isTip ?? true, // live growing apex at the far end?
    vigor: opts.vigor ?? CONFIG.growth.startVigor,
    run: opts.run ?? 0, // segments this shoot has run since its last fork
    buds: opts.buds ?? CONFIG.growth.budsPerSegment, // dormant lateral buds
    wireTarget: null, // absolute angle to bend toward, or null
    // cached each step:
    x0: 0, y0: 0, x1: 0, y1: 0,
  };
}

export function createTree({ seed = 1, config = CONFIG } = {}) {
  const C = config;
  const state = {
    seed,
    day: 0,
    nextId: 0,
    segments: [],
    byId: new Map(),
  };

  function add(seg) {
    state.segments.push(seg);
    state.byId.set(seg.id, seg);
    if (seg.parent !== -1) state.byId.get(seg.parent).children.push(seg.id);
    return seg;
  }

  // seedling: one short trunk segment reaching up, with a tiny seed-based lean
  const r0 = makeRng(mixSeed(seed, 0));
  add(makeSegment(state.nextId++, -1, (r0() - 0.5) * 0.15));

  // ---- geometry: walk from roots, cache endpoints ----
  function recomputePositions() {
    const roots = state.segments.filter((s) => s.parent === -1);
    const walk = (seg, x, y) => {
      seg.x0 = x;
      seg.y0 = y;
      seg.x1 = x + Math.sin(seg.angle) * seg.length;
      seg.y1 = y + Math.cos(seg.angle) * seg.length;
      for (const cid of seg.children) walk(state.byId.get(cid), seg.x1, seg.y1);
    };
    for (const root of roots) walk(root, 0, 0);
  }

  // suppression felt at height h: sum over live apexes above h of their
  // vigor, fading with vertical distance. This IS apical dominance.
  // Exact O(tips) version — used by external callers / tests.
  function suppressionAt(h, excludeId = null) {
    let s = 0;
    for (const seg of state.segments) {
      if (!seg.isTip || seg.id === excludeId) continue;
      const dh = seg.y1 - h;
      if (dh <= 0) continue; // only apexes ABOVE suppress
      s += seg.vigor * Math.exp(-dh / C.growth.suppressionFalloff);
    }
    return s;
  }

  // Fast internal suppression for the growth hot loops: bin tip vigor by
  // height, so a query only sums the handful of bins within the kernel's
  // reach instead of every tip. O(kernelBins) per query, not O(tips). This
  // is what keeps a dense (10x-tip) tree fast to simulate and replay.
  function buildField() {
    const falloff = C.growth.suppressionFalloff;
    const binW = falloff * 0.5;
    let minY = Infinity, maxY = -Infinity;
    for (const s of state.segments) {
      if (!s.isTip) continue;
      if (s.y1 < minY) minY = s.y1;
      if (s.y1 > maxY) maxY = s.y1;
    }
    if (minY === Infinity) return { bins: new Float64Array(1), binW, minY: 0, falloff };
    const n = Math.max(1, Math.ceil((maxY - minY) / binW) + 1);
    const bins = new Float64Array(n);
    for (const s of state.segments) {
      if (!s.isTip) continue;
      bins[Math.floor((s.y1 - minY) / binW)] += s.vigor;
    }
    return { bins, binW, minY, falloff };
  }

  function fieldSuppression(field, h) {
    const { bins, binW, minY, falloff } = field;
    const cutoff = falloff * 7; // exp(-7) ~ 0.0009: negligible beyond
    let s = 0;
    for (let i = Math.max(0, Math.floor((h - minY) / binW)); i < bins.length; i++) {
      const dh = minY + (i + 0.5) * binW - h;
      if (dh <= 0) continue;
      if (dh > cutoff) break;
      s += bins[i] * Math.exp(-dh / falloff);
    }
    return s;
  }

  // ---- one day of growth ----
  function growDay(day) {
    recomputePositions();
    const season = seasonOf(day, C);
    const rng = makeRng(mixSeed(seed, day + 1));

    const tips = state.segments.filter((s) => s.isTip);
    if (tips.length === 0) return; // fully pinched: nothing extends this day

    // effective vigor of each tip = intrinsic, divided by how strongly the
    // apexes above it suppress it. The leader (highest) is unsuppressed and
    // dominates; kill it and the next tip's share jumps.
    let field = buildField();
    let totalEff = 0;
    const eff = new Map();
    for (const t of tips) {
      // subtract self so a tip isn't counted as suppressing itself
      const supp = Math.max(0, fieldSuppression(field, t.y1) - t.vigor);
      const e = t.vigor / (1 + C.growth.apicalStrength * supp);
      eff.set(t.id, e);
      totalEff += e;
    }

    // Energy comes from the ROOTS, proxied by trunk thickness — which wood
    // never loses. So pruning the canopy does NOT reduce the budget; it just
    // redirects the same energy into fewer growing points, which then surge.
    // This is exactly why "clip and grow" thickens and densifies a tree.
    const trunkThickness = Math.max(
      ...state.segments.filter((s) => s.parent === -1).map((s) => s.thickness)
    );
    const capacity =
      1 + C.growth.capacityGain * (trunkThickness / (trunkThickness + C.growth.capacityHalf));
    const energy = C.growth.dailyEnergy * season.growth * capacity;
    for (const t of tips) {
      let share = Math.min(C.growth.tipEnergyCap, (energy * eff.get(t.id)) / totalEff);
      // grow the current apex, spilling any overflow into fresh extension
      // segments (a shoot is a chain of segments; the live apex is its far end)
      let apex = t;
      let guard = 0;
      while (share > 1e-6 && guard++ < 6) {
        const room = apex.maxLength - apex.length;
        if (share <= room) {
          apex.length += share;
          break;
        }
        // at the segment cap a full tip STAYS a tip and simply idles — it
        // keeps its foliage and can extend again if pruning frees room. (The
        // old code marked it non-tip here, so at the cap every tip died and
        // the whole tree froze.)
        if (state.segments.length >= C.growth.maxSegments) {
          apex.length = apex.maxLength;
          break;
        }
        share -= room;
        apex.length = apex.maxLength;
        apex.isTip = false;
        const jitter = (rng() - 0.5) * 2 * C.growth.angleJitter;
        // outward drift (small) spreads a branch off vertical; upward-seek
        // then curves it back toward vertical each segment, so shoots sweep
        // out and rise rather than flopping outward forever
        const drift = Math.sign(apex.angle) * C.growth.outwardDrift * Math.min(1, Math.abs(apex.angle));
        const seek = -apex.angle * C.growth.upwardSeek;
        const base = apex.angle + jitter + drift + seek;
        // FORK: the shoot splits into two tips, so branches bifurcate all
        // along their length (not just off the trunk). Otherwise it extends
        // as a single continuation. A shoot may only fork after running a few
        // segments since its last fork, so every branch has a LENGTH before
        // it divides — visible limbs and a real branching hierarchy, not an
        // instant twig-mist.
        const canFork = apex.run >= C.growth.minRunBeforeFork;
        if (canFork && rng() < C.growth.forkChance && state.segments.length + 2 <= C.growth.maxSegments) {
          // both halves keep nearly full vigor, so a fork makes two
          // CO-DOMINANT limbs (not a leader + a weak lateral) — this is what
          // lets the trunk divide instead of running as one central spire
          const fv = apex.vigor * C.growth.forkVigorKeep;
          add(makeSegment(state.nextId++, apex.id, base + C.growth.forkAngle, { vigor: fv, run: 0 }));
          add(makeSegment(state.nextId++, apex.id, base - C.growth.forkAngle, { vigor: fv, run: 0 }));
          break; // the two new tips grow on subsequent days
        }
        apex = add(makeSegment(state.nextId++, apex.id, base, { vigor: apex.vigor * 0.97, run: apex.run + 1 }));
      }
    }

    // dormant buds break where suppression has fallen enough (e.g. the leader
    // above them was cut). This is the "clip and grow" release.
    recomputePositions();
    field = buildField();
    for (const seg of [...state.segments]) {
      if (seg.buds <= 0 || state.segments.length >= C.growth.maxSegments) continue;
      if (seg.isTip) continue; // a live growing apex doesn't sprout laterals
      //                          at its own tip — buds below it are the most
      //                          suppressed, not the least. Buds break only on
      //                          wood whose shoot-tip above has been cut away.
      const supp = fieldSuppression(field, seg.y1);
      const noise = rng() * 0.15;
      if (supp + noise < C.growth.budActivateThreshold) {
        const side = rng() < 0.5 ? 1 : -1;
        add(makeSegment(state.nextId++, seg.id, seg.angle + side * C.growth.budAngle, {
          vigor: seg.vigor * 0.9,
        }));
        seg.buds -= 1;
      }
    }

    thicken();
    for (const seg of state.segments) seg.age += 1;
  }

  // wood thickens toward a target driven by the foliage its subtree carries;
  // never thins (cuts above permanently starve future thickening).
  function thicken() {
    const leaves = new Map();
    const countLeaves = (seg) => {
      let n = seg.isTip ? 1 : 0;
      for (const cid of seg.children) n += countLeaves(state.byId.get(cid));
      leaves.set(seg.id, n);
      return n;
    };
    for (const root of state.segments.filter((s) => s.parent === -1)) countLeaves(root);
    for (const seg of state.segments) {
      const target = C.wood.baseTarget + C.wood.thicknessPerSqrtLeaf * Math.sqrt(leaves.get(seg.id) ?? 0);
      if (target > seg.thickness) {
        seg.thickness += C.wood.thickenRate * (target - seg.thickness);
      }
    }
  }

  // ---- actions (one per day in the real game) ----
  // prune: cut a segment and everything above it. Permanent. Frees energy
  // and lifts suppression on the buds below — the fundamental bonsai move.
  function prune(segId) {
    const seg = state.byId.get(segId);
    if (!seg || seg.parent === -1) return false; // can't cut the base
    const toRemove = new Set();
    const collect = (s) => {
      toRemove.add(s.id);
      for (const cid of s.children) collect(state.byId.get(cid));
    };
    collect(seg);
    const parent = state.byId.get(seg.parent);
    parent.children = parent.children.filter((c) => c !== segId);
    state.segments = state.segments.filter((s) => !toRemove.has(s.id));
    for (const id of toRemove) state.byId.delete(id);
    return true;
  }

  // pinch: remove just the growing tip of a shoot (not its wood). Stops that
  // shoot extending and lifts its suppression on the buds below.
  function pinch(segId) {
    const seg = state.byId.get(segId);
    if (!seg || !seg.isTip) return false;
    seg.isTip = false;
    return true;
  }

  // wire: bend a whole limb by `delta` radians, INSTANTLY. The segment and
  // its entire subtree pivot together, so the branch swings as a unit rather
  // than kinking at one joint; extensions inherit the tip's direction, so
  // growth after the wire keeps the shape.
  function wire(segId, delta) {
    const seg = state.byId.get(segId);
    if (!seg) return false;
    const apply = (s) => {
      s.angle += delta;
      for (const cid of s.children) apply(state.byId.get(cid));
    };
    apply(seg);
    recomputePositions();
    return true;
  }

  const api = {
    state,
    config: C,
    prune,
    pinch,
    wire,
    growDay,
    recomputePositions,
    suppressionAt,
    tips: () => state.segments.filter((s) => s.isTip),
    heightOf: () => {
      recomputePositions();
      return Math.max(0, ...state.segments.map((s) => s.y1));
    },
  };
  recomputePositions();
  return api;
}
