// Slicing: (R * cell) ∩ {w = 0} -> convex polyhedron (or null).
//
// A cell is an axis-aligned 4-box in the building's rest frame. Rotated by
// R, membership is: min_i <= (R^T p)_i <= max_i for each rest axis i.
// Restricted to the slice p = (x,y,z,0), each constraint becomes a 3-D
// half-space n·v <= d with n = the first three rows of column i of R.
// The slice is the intersection of (up to) 8 half-spaces: we enumerate
// vertices from plane triples, then group hull faces by supporting plane.
//
// This is the continuous slicer — it must be exact at rest orientations
// AND smooth mid-swing, because "a wall that is solid before and gone
// after is, mid-swing, a shrinking gap" is core gameplay.

const VEPS = 1e-7;

// half-spaces for (R*cell) ∩ {w=0}; null if trivially empty
function halfSpaces(cell, R) {
  const planes = [];
  for (let i = 0; i < 4; i++) {
    const n = [R[i], R[4 + i], R[8 + i]]; // column i, rows x,y,z
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) {
      // this rest axis is aligned with w: the constraint reads
      // min_i <= 0 <= max_i and involves no slice coordinates at all
      if (cell.min[i] > VEPS || cell.max[i] < -VEPS) return null;
      continue;
    }
    planes.push({ n, d: cell.max[i] });
    planes.push({ n: [-n[0], -n[1], -n[2]], d: -cell.min[i] });
  }
  return planes;
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function solve3(p1, p2, p3) {
  // intersection point of three planes n·v = d (Cramer's rule)
  const det = dot3(p1.n, cross(p2.n, p3.n));
  if (Math.abs(det) < 1e-9) return null;
  const v = [0, 0, 0];
  const c23 = cross(p2.n, p3.n);
  const c31 = cross(p3.n, p1.n);
  const c12 = cross(p1.n, p2.n);
  for (let k = 0; k < 3; k++) {
    v[k] = (p1.d * c23[k] + p2.d * c31[k] + p3.d * c12[k]) / det;
  }
  return v;
}

function enumerateVertices(planes) {
  const verts = [];
  const keys = new Set();
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const v = solve3(planes[i], planes[j], planes[k]);
        if (!v) continue;
        let inside = true;
        for (const p of planes) {
          if (dot3(p.n, v) > p.d + VEPS) {
            inside = false;
            break;
          }
        }
        if (!inside) continue;
        const key = v.map((x) => x.toFixed(6)).join(',');
        if (!keys.has(key)) {
          keys.add(key);
          verts.push(v);
        }
      }
    }
  }
  return verts;
}

function buildFaces(planes, verts) {
  const faces = [];
  for (const p of planes) {
    const onPlane = [];
    for (let i = 0; i < verts.length; i++) {
      if (Math.abs(dot3(p.n, verts[i]) - p.d) < 1e-5) onPlane.push(i);
    }
    if (onPlane.length < 3) continue;
    // order vertices around the face centroid, CCW seen from outside (+n)
    const len = Math.hypot(p.n[0], p.n[1], p.n[2]);
    const nh = [p.n[0] / len, p.n[1] / len, p.n[2] / len];
    const ref = Math.abs(nh[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u0 = cross(nh, ref);
    const ul = Math.hypot(u0[0], u0[1], u0[2]);
    const u = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
    const v2 = cross(nh, u);
    const cx = onPlane.reduce((s, i) => s + verts[i][0], 0) / onPlane.length;
    const cy = onPlane.reduce((s, i) => s + verts[i][1], 0) / onPlane.length;
    const cz = onPlane.reduce((s, i) => s + verts[i][2], 0) / onPlane.length;
    const angle = (i) => {
      const d = [verts[i][0] - cx, verts[i][1] - cy, verts[i][2] - cz];
      return Math.atan2(dot3(d, v2), dot3(d, u));
    };
    onPlane.sort((a, b) => angle(a) - angle(b));
    // ensure winding is CCW around +n (outward)
    if (onPlane.length >= 3) {
      const a = verts[onPlane[0]], b = verts[onPlane[1]], c = verts[onPlane[2]];
      const w = cross(
        [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
        [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      );
      if (dot3(w, nh) < 0) onPlane.reverse();
    }
    faces.push(onPlane);
  }
  return faces;
}

export function polyVolume(poly) {
  // divergence theorem over outward-wound triangle fans
  let six = 0;
  for (const face of poly.faces) {
    const a = poly.vertices[face[0]];
    for (let i = 1; i + 1 < face.length; i++) {
      const b = poly.vertices[face[i]];
      const c = poly.vertices[face[i + 1]];
      six += dot3(a, cross(b, c));
    }
  }
  return six / 6;
}

// The main entry: slice one cell at orientation R.
// Returns { vertices, faces, volume } or null if the slice is empty
// (or has vanishing volume — a wall that has thinned to nothing).
export function sliceCell(cell, R) {
  const planes = halfSpaces(cell, R);
  if (!planes) return null;
  const vertices = enumerateVertices(planes);
  if (vertices.length < 4) return null;
  const faces = buildFaces(planes, vertices);
  const poly = { vertices, faces };
  const volume = polyVolume(poly);
  if (volume < 1e-9) return null;
  poly.volume = volume;
  return poly;
}

// Slice every cell of a building; skips empties. Each entry keeps its
// source cell index so renderer/collision can map back.
export function sliceBuilding(cells, R) {
  const out = [];
  for (let i = 0; i < cells.length; i++) {
    const poly = sliceCell(cells[i], R);
    if (poly) out.push({ cellIndex: i, ...poly });
  }
  return out;
}
