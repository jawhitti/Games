// Seeded RNG (mulberry32). All randomness flows through one of these so a
// tree is a reproducible function of its seed. A fresh generator is made
// from (seed, day) each growth step, so replay is bit-identical regardless
// of how the days were stepped.

export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix two integers into one seed so each day gets its own stream.
export function mixSeed(seed, day) {
  let h = (seed ^ (day * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return h >>> 0;
}
