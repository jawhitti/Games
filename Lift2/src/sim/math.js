// Log-space arithmetic for anything that compounds (investment towers, goo
// pools). Multiplicative growth is addition on the log; linear deposits and
// withdrawals cross the boundary through log1p so tiny-vs-huge stays stable.

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

// exp(logV), with -Infinity meaning "empty" -> 0.
export function vol(logV) {
  return logV === -Infinity ? 0 : Math.exp(logV);
}

// Add a linear amount to a log-space quantity. logAdd(-Inf, a) = ln(a).
export function logAdd(logV, amount) {
  if (amount <= 0) return logV;
  if (logV === -Infinity) return Math.log(amount);
  return logV + Math.log1p(amount * Math.exp(-logV));
}

// Subtract a linear amount; empties to -Infinity rather than going negative.
export function logSub(logV, amount) {
  if (amount <= 0 || logV === -Infinity) return logV;
  const frac = amount * Math.exp(-logV);
  if (frac >= 1 - 1e-12) return -Infinity;
  return logV + Math.log1p(-frac);
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
