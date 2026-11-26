import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as THREE from 'three';

// ---------- constants ----------
const WORLD = 400;          // terrain size
const SEG = 160;            // terrain segments
const MAX_H = 46;           // max mountain height
const WATER_Y = -2.2;
const EYE = 1.7;
const GRAVITY = 26;
const JUMP = 8.5;
const WALK = 7.5;
const RUN = 14;

// ---------- noise ----------
const noise = new SimplexNoise();
const n2 = (x, z) => noise.noise3d(x, z, 0);
const seedA = n2(3.1, 7.7) * 1000;

function fbm(x, z, octaves, freq, lac, gain) {
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * n2(x * f + seedA, z * f - seedA);
    norm += amp; amp *= gain; f *= lac;
  }
  return sum / norm;
}

function terrainHeight(x, z) {
  const base = fbm(x, z, 5, 0.004, 2.1, 0.5);          // rolling hills
  const ridge = 1 - Math.abs(fbm(x, z, 4, 0.0022, 2.3, 0.55)); // ridged mountains
  const mask = Math.max(0, fbm(x * 0.5 + 50, z * 0.5 - 30, 2, 0.0016, 2, 0.5)); // where mountains live
  let h = base * 8 + ridge * ridge * 34 * mask;
  // flatten a valley near spawn so the player starts on gentle ground
  const d = Math.hypot(x, z);
  if (d < 30) h *= 0.25 + 0.75 * (d / 30);
  return h;
}

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfd4e0, 60, 320);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 10, 0);
scene.add(camera);

// sky dome
const skyGeo = new THREE.SphereGeometry(500, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { top: { value: new THREE.Color(0x5b8fd4) }, bottom: { value: new THREE.Color(0xd9c9a6) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float t = clamp(normalize(vP).y*0.8+0.35, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(t,0.8)), 1.0); }'
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// sun
const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
sun.position.set(120, 160, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 500;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8fa8c0, 0.7));

// ---------- terrain ----------
const terrainGeo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
terrainGeo.rotateX(-Math.PI / 2);
const pos = terrainGeo.attributes.position.array;
const colors = new Float32Array(pos.length);
const cGrass = new THREE.Color(0x5a8a3a), cGrass2 = new THREE.Color(0x6f9a4a);
const cRock = new THREE.Color(0x8a8578), cSnow = new THREE.Color(0xf2f4f8);
const cSand = new THREE.Color(0xc9b98a);
const tmp = new THREE.Color();

for (let i = 0; i < pos.length; i += 3) {
  const x = pos[i], z = pos[i + 2];
  const h = terrainHeight(x, z);
  pos[i + 1] = h;
  const slope = Math.min(1, Math.abs(fbm(x, z, 2, 0.05, 2, 0.5)) * 2.2);
  let c;
  if (h < WATER_Y + 0.6) c = tmp.copy(cSand);
  else if (h > 26) c = tmp.copy(cSnow).lerp(cRock, Math.max(0, 1 - (h - 26) / 12));
  else if (h > 14 || slope > 0.62) c = tmp.copy(cRock).lerp(cGrass2, Math.max(0, 1 - slope) * 0.5);
  else c = tmp.copy(cGrass).lerp(cGrass2, (fbm(x, z, 2, 0.08, 2, 0.5) + 1) * 0.5);
  colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b;
}
terrainGeo.computeVertexNormals();
terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
terrain.receiveShadow = true;
scene.add(terrain);

// water
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD * 2, WORLD * 2),
  new THREE.MeshStandardMaterial({ color: 0x2e6a8a, transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.1 })
);
water.rotation.x = -Math.PI / 2;
water.position.y = WATER_Y;
scene.add(water);

// ---------- scatter helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const inWorld = (x, z, margin) => Math.abs(x) < WORLD / 2 - margin && Math.abs(z) < WORLD / 2 - margin;

function slopeAt(x, z) {
  const e = 1.5;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  return Math.hypot(hL - hR, hD - hU) / (2 * e);
}

// ---------- grass ----------
const grassCount = 11000;
const blade = new THREE.PlaneGeometry(0.14, 0.55, 1, 2);
blade.translate(0, 0.275, 0);
const grassMat = new THREE.MeshBasicMaterial({ color: 0x77aa44, side: THREE.DoubleSide });
const grass = new THREE.InstancedMesh(blade, grassMat, grassCount * 2);
grass.castShadow = false; grass.receiveShadow = false;
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < grassCount; i++) {
    const x = rand(-WORLD / 2 + 4, WORLD / 2 - 4), z = rand(-WORLD / 2 + 4, WORLD / 2 - 4);
    const h = terrainHeight(x, z);
    if (h < WATER_Y + 0.4 || h > 24 || slopeAt(x, z) > 0.55) { i--; continue; }
    const sc = rand(0.6, 1.5);
    // two crossed blades
    for (let k = 0; k < 2; k++) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI * 2));
      s.set(sc, sc * rand(0.8, 1.4), sc);
      m.compose(p.set(x, h - 0.03, z), q, s);
      grass.setMatrixAt(i * 2 + k, m);
    }
  }
}
scene.add(grass);

// ---------- trees ----------
const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.2, 6);
trunkGeo.translate(0, 1.1, 0);
const leafGeo = new THREE.ConeGeometry(1.5, 3.4, 7);
leafGeo.translate(0, 3.4, 0);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 });
const treeCount = 420;
const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeCount);
trunks.castShadow = leaves.castShadow = true;
trunks.receiveShadow = leaves.receiveShadow = true;
const treeSpots = [];
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed = 0;
  while (placed < treeCount) {
    const x = rand(-WORLD / 2 + 8, WORLD / 2 - 8), z = rand(-WORLD / 2 + 8, WORLD / 2 - 8);
    const h = terrainHeight(x, z);
    if (h < WATER_Y + 1 || h > 22 || slopeAt(x, z) > 0.5) continue;
    if (Math.hypot(x, z) < 8) continue;
    const sc = rand(0.7, 1.6);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI * 2));
    s.set(sc, sc * rand(0.85, 1.25), sc);
    m.compose(p.set(x, h - 0.15, z), q, s);
    trunks.setMatrixAt(placed, m);
    leaves.setMatrixAt(placed, m);
    treeSpots.push([x, z]);
    placed++;
  }
}
scene.add(trunks, leaves);

// ---------- rocks ----------
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
rockGeo.scale(1, 0.7, 1);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7d78, roughness: 0.9, flatShading: true });
const rockCount = 300;
const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
rocks.castShadow = false; rocks.receiveShadow = true;
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const p = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < rockCount; i++) {
    const x = rand(-WORLD / 2 + 5, WORLD / 2 - 5), z = rand(-WORLD / 2 + 5, WORLD / 2 - 5);
    const h = terrainHeight(x, z);
    if (h < WATER_Y - 0.5) continue;
    const sc = rand(0.35, 1.6);
    e.set(rand(0, Math.PI), rand(0, Math.PI * 2), rand(0, Math.PI));
    q.setFromEuler(e);
    s.set(sc * rand(0.8, 1.3), sc, sc * rand(0.8, 1.3));
    m.compose(p.set(x, h - sc * 0.25, z), q, s);
    rocks.setMatrixAt(i, m);
  }
}
scene.add(rocks);

// ---------- emoji animals ----------
function emojiTexture(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '96px serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const ANIMAL_TYPES = [
  { emoji: '🦊', speed: 2.6, size: 1.1 },
  { emoji: '🐇', speed: 3.4, size: 0.8 },
  { emoji: '🦌', speed: 2.2, size: 1.5 },
  { emoji: '🐺', speed: 2.4, size: 1.3 },
  { emoji: '🐤', speed: 1.6, size: 0.6 },
  { emoji: '🐼', speed: 1.4, size: 1.4 }
];

const animals = [];
const animalCount = 26;
for (let i = 0; i < animalCount; i++) {
  const type = ANIMAL_TYPES[i % ANIMAL_TYPES.length];
  const x = rand(-WORLD / 2 + 20, WORLD / 2 - 20), z = rand(-WORLD / 2 + 20, WORLD / 2 - 20);
  const h = terrainHeight(x, z);
  if (h < WATER_Y + 0.5) { i--; continue; }
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(type.emoji), transparent: true }));
  spr.scale.set(type.size, type.size, 1);
  spr.position.set(x, h + type.size * 0.5, z);
  scene.add(spr);
  animals.push({
    mesh: spr, type, x, z, h,
    heading: rand(0, Math.PI * 2),
    timer: rand(1, 5),
    bob: rand(0, Math.PI * 2)
  });
}

// ---------- controls ----------
const controls = new PointerLockControls(camera, renderer.domElement);

const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

let locked = false;
renderer.domElement.addEventListener('click', () => {
  if (!locked) { controls.lock(); locked = true; }
});

const vel = new THREE.Vector3();
const dir = new THREE.Vector3();
let grounded = true;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- HUD ----------
const hud = document.createElement('div');
hud.id = 'hud';
document.body.appendChild(hud);
const hudLeft = document.createElement('span');
const hudRight = document.createElement('span');
hud.appendChild(hudLeft); hud.appendChild(hudRight);
const compass = document.createElement('div');
compass.id = 'compass';
document.body.appendChild(compass);
const title = document.createElement('div');
title.id = 'title';
title.innerHTML = 'WILDLANDS<small>click to look around · WASD move · SHIFT run · SPACE jump</small>';
document.body.appendChild(title);

// ---------- loop ----------
let lastT = performance.now();
let spotted = 0;
const seen = new Set();
let won = false;

function animate() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  // movement
  if (locked) {
    const speed = (keys.ShiftLeft || keys.ShiftRight) ? RUN : WALK;
    dir.set(0, 0, 0);
    if (keys.KeyW) dir.z -= 1;
    if (keys.KeyArrowUp) dir.z -= 1;
    if (keys.KeyS || keys.KeyArrowDown) dir.z += 1;
    if (keys.KeyLeft || keys.KeyArrowLeft) dir.x -= 1;
    if (keys.KeyRight || keys.KeyArrowRight) dir.x += 1;
    dir.normalize().multiplyScalar(speed);
    controls.moveRight(dir.x * dt);
    controls.moveForward(-dir.z * dt);

    // keep inside world
    const p = camera.position;
    const lim = WORLD / 2 - 4;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));

    // gravity + terrain follow
    const ground = terrainHeight(p.x, p.z) + EYE;
    if (p.y - ground < 0.05) { grounded = true; vel.y = 0; }
    if (keys.Space && grounded) { vel.y = JUMP; grounded = false; }
    vel.y -= GRAVITY * dt;
    p.y += vel.y * dt;
    if (p.y < ground) { p.y = ground; vel.y = 0; grounded = true; }
    if (p.y < WATER_Y + EYE) p.y = WATER_Y + EYE; // wade, don't sink
  }

  // animals wander
  for (const a of animals) {
    a.timer -= dt;
    if (a.timer <= 0) { a.heading = rand(0, Math.PI * 2); a.timer = rand(2, 6); }
    const nx = a.x + Math.cos(a.heading) * a.type.speed * dt;
    const nz = a.z + Math.sin(a.heading) * a.type.speed * dt;
    if (inWorld(nx, nz, 15)) { a.x = nx; a.z = nz; } else a.heading += Math.PI;
    for (const [tx, tz] of treeSpots) {
      if ((a.x - tx) ** 2 + (a.z - tz) ** 2 < 1.6) { a.heading += Math.PI; a.timer = rand(1, 3); break; }
    }
    const th = terrainHeight(a.x, a.z);
    if (th < WATER_Y + 0.4) { a.heading += Math.PI; }
    else {
      a.h += (th - a.h) * Math.min(1, dt * 6);
      a.bob += dt * 6;
      a.mesh.position.set(a.x, a.h + a.type.size * 0.5 + Math.abs(Math.sin(a.bob)) * 0.12, a.z);
    }
    const d = camera.position.distanceTo(a.mesh.position);
    if (d < 22 && !seen.has(a)) { seen.add(a); spotted++; }
  }

  // HUD
  const p = camera.position;
  hudLeft.textContent = `pos ${p.x.toFixed(0)}, ${p.z.toFixed(0)} · elev ${p.y.toFixed(0)}m`;
  hudRight.textContent = `animals spotted ${spotted}/${animals.length}`;

  // compass to nearest unseen animal
  let nearest = null, nd = Infinity;
  for (const a of animals) {
    if (seen.has(a)) continue;
    const d = (a.x - p.x) ** 2 + (a.z - p.z) ** 2;
    if (d < nd) { nd = d; nearest = a; }
  }
  if (nearest) {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const fwd = Math.atan2(camDir.x, camDir.z);
    const to = Math.atan2(nearest.x - p.x, nearest.z - p.z);
    let rel = to - fwd;
    compass.style.left = `${50 + Math.max(-38, Math.min(38, (rel / Math.PI) * 38))}%`;
    compass.style.top = '46%';
    compass.textContent = '▶';
  } else {
    compass.textContent = '';
  }

  if (spotted >= animals.length && !won) {
    won = true;
    title.innerHTML = 'ALL CREATURES FOUND!';
    title.style.color = '#ffe97a';
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
