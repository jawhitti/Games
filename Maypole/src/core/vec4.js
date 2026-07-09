// R^4 vectors and 4x4 matrices (row-major, length-16 arrays).
// Pure math, no rendering. Everything downstream builds on this.

export const EPS = 1e-9;

export function vec4(x = 0, y = 0, z = 0, w = 0) {
  return [x, y, z, w];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}

export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function length(a) {
  return Math.sqrt(dot(a, a));
}

export const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

// m * v
export function apply(m, v) {
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    out[r] = m[r * 4] * v[0] + m[r * 4 + 1] * v[1] + m[r * 4 + 2] * v[2] + m[r * 4 + 3] * v[3];
  }
  return out;
}

// a * b (apply b first, then a)
export function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = s;
    }
  }
  return out;
}

export function transpose(m) {
  const out = new Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) out[c * 4 + r] = m[r * 4 + c];
  }
  return out;
}

export function det4(m) {
  // Laplace expansion along row 0 via 3x3 minors
  const m3 = (a, b, c, d, e, f, g, h, i) =>
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  return (
    a00 * m3(a11, a12, a13, a21, a22, a23, a31, a32, a33) -
    a01 * m3(a10, a12, a13, a20, a22, a23, a30, a32, a33) +
    a02 * m3(a10, a11, a13, a20, a21, a23, a30, a31, a33) -
    a03 * m3(a10, a11, a12, a20, a21, a22, a30, a31, a32)
  );
}

export function approxEq(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

export function matApproxEq(a, b, eps = 1e-9) {
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > eps) return false;
  return true;
}
