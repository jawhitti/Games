// MAYPOLE — milestone 0 demo: a glass room (six wall slabs, no w-walls),
// a true 4-sphere ball inside it, and the six rotation planes.
//
// Gravity is THE SUN: a large body far away in 4-D space, pulling in one
// constant direction. Rotating the building never moves it — so a maypole
// turn drops a wall into the floor position and the ball tumbles onto it,
// exactly as intuition demands. A w-turn rotates the floor OUT of the
// slice: support ceases to exist and the ball falls through the sealed box.
// The camera is fixed; screen-down is down.
//
// Ink register: white paper, fat black strokes, glass walls, nothing else.

import * as THREE from 'three';
import { PLANES, planeRotation, isMaypole, mul, IDENTITY } from '../core/so4.js';
import { sliceCell } from '../core/slice.js';
import { resolveGravity } from '../core/gravity.js';
import { apply, transpose, dot, sub, add, scale } from '../core/vec4.js';
import { makeInkMaterial, inkSegments, circleSegments, buildDownIndicator } from './ink.js';

// THE ROOM: six wall slabs enclosing an interior in x/y/z. There are no
// w-walls — a room airtight in three dimensions is open in the fourth.
const X = 1.5, Y = 1, Z = 0.6, W = 0.35, T = 0.18;
const WALLS = [
  { min: [-X - T, -Y - T, -Z - T, -W], max: [X + T, -Y, Z + T, W] }, // floor
  { min: [-X - T, Y, -Z - T, -W], max: [X + T, Y + T, Z + T, W] }, // ceiling
  { min: [-X - T, -Y, -Z - T, -W], max: [-X, Y, Z + T, W] }, // west
  { min: [X, -Y, -Z - T, -W], max: [X + T, Y, Z + T, W] }, // east
  { min: [-X, -Y, -Z - T, -W], max: [X, Y, -Z, W] }, // back
  { min: [-X, -Y, Z, -W], max: [X, Y, Z + T, W] }, // front
];
// phased away at rest (w ∈ [0.55, 1.45]); swings INTO the room mid-w-turn
const GHOST = { min: [-0.6, -1, -0.5, 0.55], max: [0.6, 0.2, 0.5, 1.45] };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5.5, 4, 8);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// GLASS: no occluding faces — pure ink wireframe, ball always visible.
const inkMat = makeInkMaterial(3.5);
const world = new THREE.Group();
scene.add(world);

const indicatorMat = makeInkMaterial(4.5);
const indicator = buildDownIndicator(indicatorMat, camera);
indicator.group.position.set(-2.9, 2.1, 0);
scene.add(indicator.group);

// ---- orientation: exact rest matrix + one eased 90-degree swing at a time
// (the game's verb), plus an optional continuous-spin mode for pipeline
// gawking ----
let Rbase = [...IDENTITY];
let anim = null; // { plane, angle, t0 }
const SWING_MS = 1400;
let spin = false;
let spinPlane = 'xw';
let spinAngle = 0;
let spinSpeed = 40; // deg/s

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

function currentR(nowMs, dt) {
  if (spin) {
    spinAngle = (spinAngle + spinSpeed * dt) % 360;
    return mul(planeRotation(spinPlane, spinAngle), Rbase);
  }
  if (!anim) return Rbase;
  const t = Math.min(1, (nowMs - anim.t0) / SWING_MS);
  const R = mul(planeRotation(anim.plane, anim.angle * ease(t)), Rbase);
  if (t >= 1) {
    Rbase = mul(planeRotation(anim.plane, anim.angle), Rbase).map(Math.round);
    anim = null;
    return Rbase;
  }
  return R;
}

// ---- the ball: a TRUE 4-sphere. Visible form = its w=0 cross-section,
// radius sqrt(r^2 - w^2): leaving the slice, it shrinks to a point. ----
const BALL_R = 0.28;
const BALL_SPAWN = [0, 0.4, 0, 0];
const GRAV = 8;
const ball = { p: [...BALL_SPAWN], v: [0, 0, 0, 0] };
let showGhost = false;

const ballGroup = new THREE.Group();
const ballSilhouette = new THREE.Group();
ballSilhouette.add(inkSegments(circleSegments(1, 40, 0), inkMat));
const ballEquator = inkSegments(circleSegments(1, 40, 0, true), inkMat);
ballGroup.add(ballSilhouette, ballEquator);
scene.add(ballGroup);

function respawnBall() {
  ball.p = [...BALL_SPAWN];
  ball.v = [0, 0, 0, 0];
}

// exact 4-D sphere vs axis-aligned 4-box, in the building's rest frame
function collideBall(cell, R, Rt) {
  const q = apply(Rt, ball.p);
  const nearest = q.map((qi, i) => Math.min(Math.max(qi, cell.min[i]), cell.max[i]));
  const dvec = sub(q, nearest);
  const d2 = dot(dvec, dvec);
  if (d2 >= BALL_R * BALL_R) return;
  let dirRest, depth;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    dirRest = scale(dvec, 1 / d);
    depth = BALL_R - d;
  } else {
    let best = Infinity, axis = 1, sign = 1;
    for (let i = 0; i < 4; i++) {
      const lo = q[i] - cell.min[i];
      const hi = cell.max[i] - q[i];
      if (lo < best) { best = lo; axis = i; sign = -1; }
      if (hi < best) { best = hi; axis = i; sign = 1; }
    }
    dirRest = [0, 0, 0, 0];
    dirRest[axis] = sign;
    depth = best + BALL_R;
  }
  const dir = apply(R, dirRest);
  ball.p = add(ball.p, scale(dir, depth));
  const vn = dot(ball.v, dir);
  if (vn < 0) {
    const vt = sub(ball.v, scale(dir, vn));
    ball.v = add(scale(vt, 0.985), scale(dir, -vn * 0.25));
  }
}

function stepBall(dt, R, g) {
  const Rt = transpose(R);
  const steps = 3;
  const h = Math.min(dt / steps, 1 / 90);
  for (let s = 0; s < steps; s++) {
    ball.v = add(ball.v, scale(g, GRAV * h));
    ball.p = add(ball.p, scale(ball.v, h));
    for (const wall of WALLS) collideBall(wall, R, Rt);
    if (showGhost) collideBall(GHOST, R, Rt);
  }
  if (Math.hypot(...ball.p) > 12) respawnBall();
}

// ---- input ----
let paused = false;
window.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= 6) {
    if (spin) {
      spinPlane = PLANES[n - 1];
      spinAngle = 0;
    } else if (!anim) {
      anim = { plane: PLANES[n - 1], angle: 90, t0: performance.now() };
    }
  } else if (e.key === ' ') {
    paused = !paused;
    e.preventDefault();
  } else if (e.key === 's') {
    spin = !spin;
    spinAngle = 0;
    anim = null;
  } else if (e.key === 'b') showGhost = !showGhost;
  else if (e.key === 'r') respawnBall();
  else if (e.key === '0' && !anim && !spin) Rbase = [...IDENTITY];
  else if (e.key === '[') spinSpeed = Math.max(5, spinSpeed / 2);
  else if (e.key === ']') spinSpeed = Math.min(160, spinSpeed * 2);
});

function addPoly(poly) {
  const linePos = [];
  for (const face of poly.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = poly.vertices[face[i]];
      const b = poly.vertices[face[(i + 1) % face.length]];
      linePos.push(...a, ...b);
    }
  }
  world.add(inkSegments(linePos, inkMat));
}

const hud = document.getElementById('hud');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const R = paused ? currentR(last, 0) : currentR(now, dt);

  for (const child of [...world.children]) {
    world.remove(child);
    child.geometry.dispose();
  }
  let totalVolume = 0;
  for (const wall of WALLS) {
    const poly = sliceCell(wall, R);
    if (poly) {
      addPoly(poly);
      totalVolume += poly.volume;
    }
  }
  let ghostPoly = null;
  if (showGhost) {
    ghostPoly = sliceCell(GHOST, R);
    if (ghostPoly) addPoly(ghostPoly);
  }

  const gv = resolveGravity(R);
  indicator.update(gv);
  ballSilhouette.quaternion.copy(camera.quaternion); // silhouette faces the camera

  if (!paused) stepBall(dt, R, gv.g);
  const wOff = ball.p[3];
  const rVis = Math.sqrt(Math.max(0, BALL_R * BALL_R - wOff * wOff));
  ballGroup.visible = rVis > 0.02;
  if (ballGroup.visible) {
    ballGroup.position.set(ball.p[0], ball.p[1], ball.p[2]);
    ballGroup.scale.setScalar(rVis);
  }

  const activePlane = spin ? spinPlane : anim ? anim.plane : null;
  const kindNote = activePlane
    ? `${activePlane}  (${isMaypole(activePlane) ? 'maypole' : 'monkey-bar'})`
    : 'at rest';
  const spatial = Math.hypot(gv.g[0], gv.g[1], gv.g[2]);
  const downTxt =
    spatial > 0.05
      ? `down (${gv.g[0].toFixed(2)}, ${gv.g[1].toFixed(2)}, ${gv.g[2].toFixed(2)})` +
        (Math.abs(gv.wash) > 0.05 ? `  +w ${gv.wash.toFixed(2)}` : '')
      : `down has left space: ${gv.wash > 0 ? 'ana ⊙' : 'kata ⊗'}`;
  hud.textContent =
    `MAYPOLE — rotation demo\n` +
    `${spin ? `spinning ${kindNote} at ${spinSpeed}°/s` : `swing: ${kindNote}`}\n` +
    `walls volume ${totalVolume > 0 ? totalVolume.toFixed(3) : '—'}   (sun is fixed; down never moves)\n` +
    downTxt +
    (ball.p[1] < -Y - 2
      ? `\nball fell out — its floor rotated away`
      : '') +
    (showGhost ? `\nghost volume ${ghostPoly ? ghostPoly.volume.toFixed(3) : '— (phased away)'}` : '') +
    `\n\n[1]xy [2]xz [3]yz [4]xw [5]yw [6]zw = 90° swing   [s]pin mode\n` +
    `[b]ghost   [r]eset ball   [0]reset world   [space]pause   [ ]spin speed`;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
