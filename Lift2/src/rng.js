// Seedable RNG (mulberry32) + gaussian sampler. All randomness in the sim
// flows through one of these so sessions are reproducible from a seed.

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

// Box-Muller with a cached spare. Deterministic given a deterministic rng.
export function makeGauss(rng) {
  let spare = null;
  return function gauss() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = rng(); // avoid log(0)
    const r = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * rng();
    spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  };
}
