// Shared ink: fat black lines (WebGL native line width is 1px on Windows,
// so all strokes go through three's screen-space fat-line addon) and the
// down-indicator used by both the level viewer and the rotation demo.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function makeInkMaterial(widthPx = 3, color = 0x000000) {
  const mat = new LineMaterial({ color, linewidth: widthPx });
  mat.resolution.set(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () =>
    mat.resolution.set(window.innerWidth, window.innerHeight)
  );
  return mat;
}

// flat [x1,y1,z1, x2,y2,z2, ...] segment-pair positions -> one stroke object
export function inkSegments(positions, mat) {
  const g = new LineSegmentsGeometry();
  g.setPositions(positions);
  return new LineSegments2(g, mat);
}

// [[x,y,z], ...] polyline -> segment-pair positions
export function polylineSegments(pts) {
  const seg = [];
  for (let i = 0; i + 1 < pts.length; i++) seg.push(...pts[i], ...pts[i + 1]);
  return seg;
}

export function circleSegments(r, n = 32, y = 0, flat = false) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push(flat ? [Math.cos(a) * r, y, Math.sin(a) * r] : [Math.cos(a) * r, Math.sin(a) * r, y]);
  }
  return polylineSegments(pts);
}

// --- the DOWN indicator ---
// A true 3-D line-art arrow: shaft, pyramid head, tail fletching ring, so
// pointing into/out of the screen reads through perspective foreshortening.
// When down leaves 3-space (a w component), no spatial direction exists to
// draw: it collapses to the circled mark — ⊙ ana / ⊗ kata.
export function buildDownIndicator(mat, camera) {
  const group = new THREE.Group();

  const arrow = new THREE.Group();
  const seg = [];
  seg.push(...polylineSegments([[0, 0.7, 0], [0, -0.7, 0]])); // shaft
  for (const [hx, hz] of [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]]) {
    seg.push(...polylineSegments([[0, -0.7, 0], [hx, -0.34, hz]])); // head (points -Y)
  }
  seg.push(...circleSegments(0.13, 24, 0.7, true)); // fletching ring at tail
  arrow.add(inkSegments(seg, mat));
  group.add(arrow);

  const mark = new THREE.Group();
  mark.add(inkSegments(circleSegments(0.32, 32, 0), mat)); // the circle
  const dot = inkSegments(circleSegments(0.045, 12, 0), mat); // ⊙ ana
  const d = 0.32 * Math.SQRT1_2;
  const cross = inkSegments(
    [...polylineSegments([[-d, -d, 0], [d, d, 0]]), ...polylineSegments([[-d, d, 0], [d, -d, 0]])],
    mat
  ); // ⊗ kata
  mark.add(dot, cross);
  mark.lookAt(camera.position); // billboard toward the viewer
  group.add(mark);

  const DOWN_MODEL = new THREE.Vector3(0, -1, 0); // arrow is modeled pointing -Y

  function update(gv) {
    const g3 = new THREE.Vector3(gv.g[0], gv.g[1], gv.g[2]);
    const spatial = g3.length();
    if (spatial > 0.05) {
      arrow.visible = true;
      mark.visible = false;
      arrow.quaternion.setFromUnitVectors(DOWN_MODEL, g3.normalize());
      arrow.scale.setScalar(0.7 + 0.9 * spatial); // shrinks as down slips into w
    } else {
      arrow.visible = false;
      mark.visible = true;
      dot.visible = gv.wash > 0;
      cross.visible = gv.wash <= 0;
    }
  }

  return { group, update };
}
