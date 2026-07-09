// SO(4): plane rotations and the finite subgroup the game lives in.
//
// The six rotation planes split into two classes, and this split is the
// entire game:
//   maypole planes    (xy, xz, yz) — no w. They map the w=0 slice to itself:
//                     pure reorientation, orientation-preserving on the slice.
//   monkey-bar planes (xw, yw, zw) — involve w. They rotate building material
//                     THROUGH the slice: the cross-section re-cuts, and a
//                     180 reflects the slice's handedness.
//
// Authored angles are restricted to multiples of 90, so every rest
// orientation is a signed axis-permutation of R^4 with integer entries —
// a finite, enumerable group (order 192 with all six planes).

import { IDENTITY, mul, apply } from './vec4.js';

export const PLANES = ['xy', 'xz', 'yz', 'xw', 'yw', 'zw'];
const AXIS = { x: 0, y: 1, z: 2, w: 3 };

export function isMaypole(plane) {
  return !plane.includes('w');
}

// Rotation by angleDeg in the given coordinate plane. Exact integer entries
// for multiples of 90 (this matters: rest orientations must hash exactly).
export function planeRotation(plane, angleDeg) {
  const a = AXIS[plane[0]];
  const b = AXIS[plane[1]];
  const t = (angleDeg * Math.PI) / 180;
  let c = Math.cos(t);
  let s = Math.sin(t);
  if (angleDeg % 90 === 0) {
    c = Math.round(c);
    s = Math.round(s);
  }
  const m = [...IDENTITY];
  m[a * 4 + a] = c;
  m[a * 4 + b] = -s;
  m[b * 4 + a] = s;
  m[b * 4 + b] = c;
  return m;
}

// A switch multiplies the building's orientation on the left: the authored
// plane is named in WORLD axes (what the player sees), regardless of how
// the building is currently turned.
export function applySwitch(R, plane, angleDeg, dir = 1) {
  return mul(planeRotation(plane, angleDeg * dir), R);
}

// Exact hash for rest orientations (integer matrices).
export function matKey(m) {
  return m.map((v) => Math.round(v)).join(',');
}

// BFS closure of a generator set: the reachable orientation group.
export function reachableGroup(generators) {
  const seen = new Map([[matKey(IDENTITY), [...IDENTITY]]]);
  const queue = [[...IDENTITY]];
  while (queue.length) {
    const R = queue.pop();
    for (const g of generators) {
      const next = mul(g, R);
      const key = matKey(next);
      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// Does R map the w=0 slice to itself? True for every maypole rest
// orientation; true for monkey-bar ones only at special angles (e.g. 180).
export function preservesSlice(R, eps = 1e-9) {
  // w-component of R*(x,y,z,0) must vanish for all x,y,z
  return (
    Math.abs(R[12]) < eps && Math.abs(R[13]) < eps && Math.abs(R[14]) < eps
  );
}

// For slice-preserving R: the induced 3x3 linear map on the slice, and its
// determinant. det = -1 is a handedness flip — unreachable by any maypole
// composition, the signature of a monkey-bar 180.
export function inducedSliceMap(R) {
  const m3 = [
    R[0], R[1], R[2],
    R[4], R[5], R[6],
    R[8], R[9], R[10],
  ];
  const det =
    m3[0] * (m3[4] * m3[8] - m3[5] * m3[7]) -
    m3[1] * (m3[3] * m3[8] - m3[5] * m3[6]) +
    m3[2] * (m3[3] * m3[7] - m3[4] * m3[6]);
  return { m3, det };
}

export { apply, mul, IDENTITY };
