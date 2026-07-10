// Milestone 1: render the real Kenney City Kit models on our iso grid.
// Proves the 3D art path in-engine (no sim yet). Serve via `npm run dev` and open /iso3d.html.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc0e0');

// isometric orthographic camera
let D = 16;
const aspect = () => innerWidth / innerHeight;
const camera = new THREE.OrthographicCamera(-D * aspect(), D * aspect(), D, -D, 0.1, 500);
camera.position.set(40, 34, 40);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

// lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x54607a, 1.15));
const sun = new THREE.DirectionalLight(0xfff2df, 2.4);
sun.position.set(28, 44, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const s = 46;
sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0004;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);

// ground + grid
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: '#6f8f4a', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(80, 80, 0x2a3a20, 0x3a4d2a);
grid.material.opacity = 0.35; grid.material.transparent = true;
grid.position.y = 0.01;
scene.add(grid);

// models: 20 buildings, tank, 4 chimneys
const NAMES = [
  ...'abcdefghijklmnopqrst'.split('').map(c => 'building-' + c),
  'detail-tank', 'chimney-basic', 'chimney-small', 'chimney-medium', 'chimney-large',
];

const loader = new GLTFLoader();
const COLS = 6, SP = 5;                // grid spacing between showcase cells
let placed = 0;

function place(root, idx) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // sit on the ground and center on the cell
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const gx = ((idx % COLS) - (COLS - 1) / 2) * SP;
  const gz = (Math.floor(idx / COLS) - 2) * SP;
  root.position.x += gx - center.x;
  root.position.z += gz - center.z;
  root.position.y += -box.min.y;
  scene.add(root);
}

NAMES.forEach((name, idx) => {
  loader.load(`/kenney/${name}.glb`, (gltf) => {
    place(gltf.scene, idx);
    placed++;
  }, undefined, (err) => console.error('failed to load', name, err));
});

addEventListener('resize', () => {
  camera.left = -D * aspect(); camera.right = D * aspect();
  camera.top = D; camera.bottom = -D; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
