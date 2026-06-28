// Seeded PRNG (mulberry32) so batch runs are reproducible.
// A single seed -> a single deterministic game/batch.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float() {
    return this.next();
  }
  // integer in [0, n)
  int(n) {
    return Math.floor(this.next() * n);
  }
  // true with probability p
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  // gaussian-ish noise via averaging two uniforms, scaled
  noise(scale) {
    return (this.next() + this.next() - 1) * scale;
  }
}

module.exports = { Rng, mulberry32 };
