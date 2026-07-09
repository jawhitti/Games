// Exact rational arithmetic on bigint numerator/denominator, always reduced,
// denominator positive, sign carried on the numerator. Floats are banned on
// purpose: ÷2 of an odd coefficient must be 5/2, not 2.5 — the fraction
// question and the representation question are different questions, and a
// float would silently answer the wrong one.

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

export function rat(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) throw new Error('rational: zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  if (n === 0n) return { n: 0n, d: 1n };
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const div = (a, b) => {
  if (b.n === 0n) throw new Error('rational: divide by zero');
  return rat(a.n * b.d, a.d * b.n);
};
export const neg = (a) => rat(-a.n, a.d);
export const recip = (a) => {
  if (a.n === 0n) throw new Error('rational: reciprocal of zero');
  return rat(a.d, a.n);
};
export const abs = (a) => rat(a.n < 0n ? -a.n : a.n, a.d);

export const eq = (a, b) => a.n === b.n && a.d === b.d; // both reduced
export const isZero = (a) => a.n === 0n;
export const isOne = (a) => a.n === 1n && a.d === 1n;
export const isNeg = (a) => a.n < 0n;
export const isInt = (a) => a.d === 1n;
export const sign = (a) => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);

export const toString = (a) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);
