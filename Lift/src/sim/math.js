// Numeric helpers for log-space arithmetic.

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ln(sum(exp(xs))) without overflow — the fleet's total log-volume.
export function logSumExp(xs) {
  if (xs.length === 0) return -Infinity;
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

// Deep-merge for config overrides: plain objects merge, everything else
// (numbers, arrays) replaces. Returns a new object; inputs untouched.
export function mergeConfig(base, override) {
  if (!override) return structuredClone(base);
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override)) {
    const b = base?.[key];
    const o = override[key];
    if (
      b && o &&
      typeof b === 'object' && typeof o === 'object' &&
      !Array.isArray(b) && !Array.isArray(o)
    ) {
      out[key] = mergeConfig(b, o);
    } else {
      out[key] = structuredClone(o);
    }
  }
  return out;
}
