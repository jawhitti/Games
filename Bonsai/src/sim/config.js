// Every tunable for how a tree grows. Balancing the FEEL of growth — how
// leggy vs dense, how fast, how strongly the tip suppresses the buds below
// — happens here.

export const CONFIG = {
  yearDays: 360,
  // Seasonal growth multiplier. Spring flush, summer steady, autumn slows,
  // winter dormant. Bonsai work is timed to these in real horticulture.
  seasons: [
    { name: 'spring', days: 90, growth: 1.5 },
    { name: 'summer', days: 90, growth: 1.0 },
    { name: 'autumn', days: 90, growth: 0.45 },
    { name: 'winter', days: 90, growth: 0.15 }, // dormant but not frozen
  ],

  growth: {
    dailyEnergy: 2.4, // baseline length grown per day across the whole tree
    segmentMaxLength: 0.35, // short internodes = tight, twiggy ramification
    //                         (large values look leggy: long bare sticks)
    startVigor: 1.0,
    // Apical dominance: a tip/bud is suppressed by the vigor of every apex
    // ABOVE it, falling off with vertical distance. The apex holds its own
    // shoot-tip region tightly (so pinching still releases locally), but its
    // grip fades over a shorter distance, so buds lower on the tree break
    // into side branches on their own — the tree ramifies as it matures.
    apicalStrength: 0.4,
    suppressionFalloff: 0.7, // vertical units over which an apex's grip fades
    budActivateThreshold: 2.4, // a dormant bud breaks when suppression drops below this
    budsPerSegment: 8, // latent buds each new segment carries
    budAngle: 0.85, // radians a lateral departs from its parent
    angleJitter: 0.16, // wander added to each new extension
    // A lateral departs sideways, drifts out a touch, then SEEKS UPWARD:
    // each new segment curves back toward vertical, so branches sweep out
    // and then rise (negative gravitropism). Higher upwardSeek = more
    // aggressively vertical.
    outwardDrift: 0.11, // radians/segment pushed away from vertical (spreading limbs)
    upwardSeek: 0.03, // fraction of its angle a shoot sheds toward vertical per segment
    // As a shoot extends it FORKS: this fraction of maturations split into
    // two tips instead of continuing as one, so branches bifurcate all along
    // their length, not only off the trunk.
    forkChance: 0.55,
    forkAngle: 0.62, // radians each half of a fork departs from the shoot line
    forkVigorKeep: 0.97, // vigor each fork half keeps (near 1 = co-dominant limbs)
    minRunBeforeFork: 4, // segments a shoot must run before it may fork again
    maxSegments: 8000, // perf/backstop cap; a full tip idles (not dies) at it
    tipEnergyCap: 0.35, // most one tip can grow in a day (keeps it smooth)
    // Energy comes from the roots; capacity SATURATES with trunk thickness
    // so growth can't run away: cap = 1 + gain * thick/(thick + half).
    capacityGain: 1.6,
    capacityHalf: 0.25,
  },

  wood: {
    startThickness: 0.004, // new shoots start as fine threads
    // Secondary thickening, pipe model: a trunk's cross-section is set by the
    // foliage it feeds, so THICKNESS scales with sqrt(leaves) — sub-linear
    // and bounded. Wood never thins, so cuts above permanently slow a
    // point's future thickening.
    thicknessPerSqrtLeaf: 0.02,
    baseTarget: 0.005, // a leafless twig's floor thickness — stays thin
    thickenRate: 0.007, // fatten slowly toward target (years to build a trunk)
  },

  wire: {
    // Wiring bends a whole limb INSTANTLY: the segment and its subtree pivot
    // together the moment you wire, and future growth (which inherits the
    // tip's direction) keeps the shape. No easing — you see the bend now.
    defaultBend: 0.8, // radians a wire button applies (~46°)
  },
};

export function seasonOf(day, config = CONFIG) {
  let d = ((day % config.yearDays) + config.yearDays) % config.yearDays;
  for (const s of config.seasons) {
    if (d < s.days) return s;
    d -= s.days;
  }
  return config.seasons[config.seasons.length - 1];
}
