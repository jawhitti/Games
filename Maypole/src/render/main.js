// Level viewer: strict black-and-white line art (Escher register).
// Hidden-line look: faces painted paper-white purely to OCCLUDE, edges inked
// as fat black strokes from the slicer's exact face polygons. No lights, no
// color, ever. The ana/kata wash is expressed inside the register: the paper
// darkens/grays and the ink inverts — that is what a gray screen means:
// gravity has acquired a w component and down has left visible space.

import * as THREE from 'three';
import levelData from '../../levels/3-01-sealed-vault.json';
import { loadLevel } from '../core/level.js';
import { sliceBuilding } from '../core/slice.js';
import { planeRotation, mul, matKey, IDENTITY } from '../core/so4.js';
import { resolveGravity } from '../core/gravity.js';
import { apply } from '../core/vec4.js';
import {
  makeInkMaterial, inkSegments, polylineSegments, circleSegments, buildDownIndicator,
} from './ink.js';

const level = loadLevel(levelData);

// ---- three.js scaffolding ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 11);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const faceMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 2,
  polygonOffsetUnits: 2,
});
const inkMat = makeInkMaterial(3);
const world = new THREE.Group();
scene.add(world);

// down indicator, pinned upper-left of the scene
const indicatorMat = makeInkMaterial(4.5);
const indicator = buildDownIndicator(indicatorMat, camera);
indicator.group.position.set(-3.6, 2.4, 0);
scene.add(indicator.group);

// ---- orientation state: exact rest matrix + eased swing ----
let Rbase = [...IDENTITY];
let anim = null; // { plane, angle, t0, dur }

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); // ease-in-out
}

function currentR(nowMs) {
  if (!anim) return Rbase;
  const t = Math.min(1, (nowMs - anim.t0) / anim.dur);
  const R = mul(planeRotation(anim.plane, anim.angle * ease(t)), Rbase);
  if (t >= 1) {
    Rbase = mul(planeRotation(anim.plane, anim.angle), Rbase).map(Math.round);
    anim = null;
    return Rbase;
  }
  return R;
}

function fireSwitch(s) {
  if (anim) return;
  anim = { plane: s.plane, angle: s.angle * s.dir, t0: performance.now(), dur: 1400 };
}

window.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= level.switches.length) fireSwitch(level.switches[n - 1]);
  if (e.key === '0' && !anim) Rbase = [...IDENTITY];
});

// ---- geometry rebuild (every frame mid-swing: the slice IS the world) ----
function clearWorld() {
  for (const child of [...world.children]) {
    world.remove(child);
    child.geometry?.dispose();
  }
}

function buildSlice(R) {
  clearWorld();
  const slices = sliceBuilding(level.cells, R);
  for (const poly of slices) {
    const positions = [];
    for (const face of poly.faces) {
      const a = poly.vertices[face[0]];
      for (let i = 1; i + 1 < face.length; i++) {
        positions.push(...a, ...poly.vertices[face[i]], ...poly.vertices[face[i + 1]]);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    world.add(new THREE.Mesh(fg, faceMat));

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

  // markers: small inked rings, only when near the slice. The goal marker
  // therefore stays invisible until its sealed room is cut into view.
  for (const [p, radius] of [[level.goal, 0.22], [level.start, 0.12]]) {
    const wp = apply(R, p);
    if (Math.abs(wp[3]) > 0.45) continue;
    const ring = inkSegments(circleSegments(radius, 32, 0), inkMat);
    ring.position.set(wp[0], wp[1], wp[2]);
    world.add(ring);
  }
  for (const s of level.switches) {
    const wp = apply(R, s.trigger);
    if (Math.abs(wp[3]) > 0.45) continue;
    const r = 0.16;
    const sq = inkSegments(
      polylineSegments([[-r, -r, 0], [r, -r, 0], [r, r, 0], [-r, r, 0], [-r, -r, 0]]),
      inkMat
    );
    sq.position.set(wp[0], wp[1], wp[2]);
    world.add(sq);
  }
}

// ---- camera policy: settle in-plane gravity to screen-bottom ----
const upCur = new THREE.Vector3(0, 1, 0);

function settleCamera(gv) {
  const [gx, gy] = gv.screenDown;
  const inPlane = Math.hypot(gx, gy);
  if (inPlane > 1e-6) {
    const target = new THREE.Vector3(-gx / inPlane, -gy / inPlane, 0);
    upCur.lerp(target, 0.08).normalize();
  }
  camera.up.copy(upCur);
  camera.lookAt(0, 0, 0);
}

// ---- the wash: B/W register only — paper grays/darkens, ink inverts ----
function applyWash(gv) {
  // kata (wash<0) pulls the paper toward black; ana toward a pale gray
  const v = gv.wash < 0 ? 1 - 0.88 * -gv.wash : 1 - 0.22 * gv.wash;
  scene.background = new THREE.Color(v, v, v);
  const ink = v > 0.5 ? 0x000000 : 0xffffff;
  inkMat.color.setHex(ink);
  indicatorMat.color.setHex(ink);
  faceMat.color.setRGB(v, v, v);
  hud.style.color = v > 0.5 ? '#000' : '#fff';
}

// ---- HUD: sparse. Switches are anonymous — the w-switch must look
// identical to every switch before it. ----
const hud = document.getElementById('hud');

function updateHud(gv) {
  const sw = level.switches.map((s, i) => `[${i + 1}] switch`).join('   ');
  const washNote =
    Math.abs(gv.wash) > 0.05 ? `\ndown has left space (${gv.wash > 0 ? 'ana' : 'kata'})` : '';
  const loomNote = gv.loom > 0.5 ? '\nLOOM' : '';
  hud.textContent = `${level.id}\n${sw}   [0] reset${washNote}${loomNote}`;
}

// ---- frame loop ----
let lastKey = '';

function frame(now) {
  const R = currentR(now);
  const key = anim ? 'anim' + now : matKey(R);
  if (key !== lastKey) {
    buildSlice(R);
    lastKey = key;
  }
  const gv = resolveGravity(R);
  settleCamera(gv);
  applyWash(gv);
  indicator.update(gv);
  updateHud(gv);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
