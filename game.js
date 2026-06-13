/* InfinRun 3D — a 3-lane spaceship infinite runner, Subway-Surfers style.
   Real WebGL 3D via Three.js. Portrait / mobile-first, no build step. */
import * as THREE from "three";

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const canvas = document.getElementById("game");
const hud = document.getElementById("hud");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const startScreen = document.getElementById("start");
const gameoverScreen = document.getElementById("gameover");
const finalScoreEl = document.getElementById("final-score");
const finalBestEl = document.getElementById("final-best");
const newBestEl = document.getElementById("new-best");

// ---------------------------------------------------------------------------
// Constants / world layout
// ---------------------------------------------------------------------------
const LANES = 3;
const LANE_X = [-2.4, 0, 2.4]; // x position of each lane
const SHIP_Z = -3.5; // ship sits a bit down the track so side lanes stay on-screen
const SHIP_Y = 0.6;
const FLOOR_Y = -0.2;
const SPAWN_Z = -150; // obstacles appear this far ahead
const DESPAWN_Z = 8; // ...and are recycled once they pass the camera

const BASE_SPEED = 26; // world units / second
const MAX_SPEED = 78;

const BG = 0x05060f;
const CYAN = 0x36e0ff;
const PINK = 0xff4d8d;

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(BG, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 35, 145);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
const CAM_BASE = new THREE.Vector3(0, 3.0, 6.5);
camera.position.copy(CAM_BASE);
camera.lookAt(0, 0.9, -16);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x88aaff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(3, 10, 4);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(CYAN, 0.6);
rimLight.position.set(-4, 3, -6);
scene.add(rimLight);

// ---------------------------------------------------------------------------
// Floor — a long plane with a scrolling neon-grid texture
// ---------------------------------------------------------------------------
function makeGridTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#05060f";
  g.fillRect(0, 0, 128, 128);
  // transverse line (scrolls toward the camera, selling forward motion)
  g.strokeStyle = "rgba(54,224,255,0.55)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 2);
  g.lineTo(128, 2);
  g.stroke();
  // bright lane dividers (vertical = along depth, stay fixed on screen)
  g.strokeStyle = "rgba(54,224,255,0.85)";
  g.lineWidth = 4;
  for (const x of [128 / 3, (128 / 3) * 2]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 60);
  return tex;
}

const gridTex = makeGridTexture();
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(LANE_X[2] - LANE_X[0] + 2.4, 400),
  new THREE.MeshBasicMaterial({ map: gridTex })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, FLOOR_Y, -190);
scene.add(floor);

// soft glowing edges along the track
const edgeMat = new THREE.MeshBasicMaterial({ color: CYAN });
for (const x of [LANE_X[0] - 1.2, LANE_X[2] + 1.2]) {
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 400), edgeMat);
  edge.position.set(x, FLOOR_Y + 0.06, -190);
  scene.add(edge);
}

// ---------------------------------------------------------------------------
// Starfield (warp streaks)
// ---------------------------------------------------------------------------
const STAR_COUNT = 500;
const starPos = new Float32Array(STAR_COUNT * 3);
function placeStar(i, far) {
  starPos[i * 3] = (Math.random() - 0.5) * 80;
  starPos[i * 3 + 1] = Math.random() * 45 + 1;
  starPos[i * 3 + 2] = far ? -Math.random() * 200 : SPAWN_Z - Math.random() * 60;
}
for (let i = 0; i < STAR_COUNT; i++) placeStar(i, true);
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0xbfe9ff, size: 0.35, sizeAttenuation: true })
);
stars.frustumCulled = false;
scene.add(stars);

// ---------------------------------------------------------------------------
// Ship (built from primitives)
// ---------------------------------------------------------------------------
function buildShip() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xeaf6ff,
    metalness: 0.5,
    roughness: 0.3,
    emissive: 0x0a2233,
    emissiveIntensity: 0.4,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: CYAN,
    metalness: 0.4,
    roughness: 0.4,
    emissive: CYAN,
    emissiveIntensity: 0.5,
  });

  // nose cone (points toward -z, the direction of travel)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.7, 18), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -0.35;
  group.add(nose);

  // fuselage
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 1.2, 18), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.7;
  group.add(body);

  // wings
  const wings = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.09, 0.8), accentMat);
  wings.position.set(0, -0.05, 0.65);
  group.add(wings);
  // tail fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.6), accentMat);
  fin.position.set(0, 0.3, 1.0);
  group.add(fin);

  // cockpit
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0x0a2233, metalness: 0.7, roughness: 0.1 })
  );
  cockpit.position.set(0, 0.2, 0.05);
  cockpit.scale.set(1, 0.7, 1.5);
  group.add(cockpit);

  // engine glow
  const engine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 0.3, 14),
    new THREE.MeshBasicMaterial({ color: PINK })
  );
  engine.rotation.x = Math.PI / 2;
  engine.position.z = 1.35;
  group.add(engine);

  const thruster = new THREE.PointLight(PINK, 6, 8);
  thruster.position.set(0, 0, 1.6);
  group.add(thruster);
  group.userData.engine = engine;

  return group;
}

const ship = buildShip();
ship.scale.setScalar(1.15); // keep it readable now that it sits further away
ship.position.set(LANE_X[1], SHIP_Y, SHIP_Z);
scene.add(ship);

const shipState = {
  lane: 1,
  x: LANE_X[1],
  targetX: LANE_X[1],
};

// ---------------------------------------------------------------------------
// Obstacles (shared geometry/material, simple pool)
// ---------------------------------------------------------------------------
const astGeo = new THREE.IcosahedronGeometry(0.95, 0);
const astMat = new THREE.MeshStandardMaterial({
  color: 0x8a7d96,
  flatShading: true,
  roughness: 0.9,
  metalness: 0.1,
  emissive: PINK,
  emissiveIntensity: 0.12,
});
const obstacles = [];
const obstaclePool = [];

function getObstacle() {
  let m = obstaclePool.pop();
  if (!m) {
    m = new THREE.Mesh(astGeo, astMat);
    m.userData.spin = new THREE.Vector3();
  }
  scene.add(m);
  return m;
}
function releaseObstacle(m) {
  scene.remove(m);
  obstaclePool.push(m);
}

// ---------------------------------------------------------------------------
// Explosion particles
// ---------------------------------------------------------------------------
let explosion = null;
function spawnExplosion(pos) {
  const N = 60;
  const pos32 = new Float32Array(N * 3);
  const col32 = new Float32Array(N * 3);
  const vel = [];
  const cyan = new THREE.Color(CYAN);
  const pink = new THREE.Color(PINK);
  for (let i = 0; i < N; i++) {
    pos32[i * 3] = pos.x;
    pos32[i * 3 + 1] = pos.y;
    pos32[i * 3 + 2] = pos.z;
    const dir = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize().multiplyScalar(4 + Math.random() * 10);
    vel.push(dir);
    const c = Math.random() < 0.5 ? cyan : pink;
    col32[i * 3] = c.r;
    col32[i * 3 + 1] = c.g;
    col32[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos32, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col32, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.35,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  explosion = { points, vel, life: 1, N };
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const STATE = { MENU: 0, PLAY: 1, OVER: 2 };
let state = STATE.MENU;
let score = 0;
let speed = BASE_SPEED;
let elapsed = 0;
let spawnTimer = 0;
let spawnInterval = 1.0;
let shake = 0;

const BEST_KEY = "infinrun_best";
let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
bestEl.textContent = best;

function reset() {
  for (const o of obstacles) releaseObstacle(o);
  obstacles.length = 0;
  if (explosion) {
    scene.remove(explosion.points);
    explosion = null;
  }
  shipState.lane = 1;
  shipState.x = LANE_X[1];
  shipState.targetX = LANE_X[1];
  ship.position.set(LANE_X[1], SHIP_Y, SHIP_Z);
  ship.visible = true;
  score = 0;
  speed = BASE_SPEED;
  elapsed = 0;
  spawnInterval = 1.0;
  spawnTimer = 0.5;
  shake = 0;
}

function startGame() {
  reset();
  state = STATE.PLAY;
  startScreen.classList.add("hidden");
  gameoverScreen.classList.add("hidden");
  hud.classList.remove("hidden");
}

function gameOver() {
  state = STATE.OVER;
  shake = 0.6;
  ship.visible = false;
  spawnExplosion(ship.position);
  const finalScore = Math.floor(score);
  const isBest = finalScore > best;
  if (isBest) {
    best = finalScore;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = best;
  }
  finalScoreEl.textContent = finalScore;
  finalBestEl.textContent = best;
  newBestEl.classList.toggle("hidden", !isBest);
  setTimeout(() => {
    hud.classList.add("hidden");
    gameoverScreen.classList.remove("hidden");
  }, 750);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function moveLane(dir) {
  if (state !== STATE.PLAY) return;
  const next = Math.max(0, Math.min(LANES - 1, shipState.lane + dir));
  if (next !== shipState.lane) {
    shipState.lane = next;
    shipState.targetX = LANE_X[next];
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a") moveLane(-1);
  else if (e.key === "ArrowRight" || e.key === "d") moveLane(1);
  else if ((e.key === " " || e.key === "Enter") && state !== STATE.PLAY) startGame();
});

let touchStartX = null;
let touchStartY = null;
const SWIPE_MIN = 28;

canvas.addEventListener(
  "touchstart",
  (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  },
  { passive: true }
);
canvas.addEventListener(
  "touchend",
  (e) => {
    if (touchStartX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      moveLane(dx > 0 ? 1 : -1);
    } else if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) {
      moveLane(t.clientX < window.innerWidth / 2 ? -1 : 1);
    }
    touchStartX = null;
  },
  { passive: true }
);
canvas.addEventListener("mousedown", (e) => {
  if (state === STATE.PLAY) moveLane(e.clientX < window.innerWidth / 2 ? -1 : 1);
});

document.getElementById("play-btn").addEventListener("click", startGame);
document.getElementById("retry-btn").addEventListener("click", startGame);

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------
function spawnObstacles() {
  // pick 1 (sometimes 2) lanes, never all 3 — always leave an escape route
  const lanes = [0, 1, 2];
  const first = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
  const chosen = [first];
  if (Math.random() < 0.3) chosen.push(lanes[Math.floor(Math.random() * lanes.length)]);

  for (const lane of chosen) {
    const m = getObstacle();
    const s = 0.7 + Math.random() * 0.7;
    m.scale.setScalar(s);
    m.position.set(LANE_X[lane], 0.9, SPAWN_Z);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.userData.spin.set(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    m.userData.radius = 0.95 * s;
    obstacles.push(m);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  const moveSpeed = state === STATE.PLAY ? speed : BASE_SPEED * 0.6;

  // scroll the track texture + starfield for a sense of motion
  gridTex.offset.y -= moveSpeed * dt * 0.05;
  const sp = stars.geometry.attributes.position.array;
  for (let i = 0; i < STAR_COUNT; i++) {
    sp[i * 3 + 2] += moveSpeed * dt;
    if (sp[i * 3 + 2] > DESPAWN_Z) placeStar(i, false);
  }
  stars.geometry.attributes.position.needsUpdate = true;

  // engine flicker
  const eng = ship.userData.engine;
  eng.scale.z = 1 + Math.sin(performance.now() / 50) * 0.35;

  if (explosion) {
    explosion.life -= dt;
    const ep = explosion.points.geometry.attributes.position.array;
    for (let i = 0; i < explosion.N; i++) {
      ep[i * 3] += explosion.vel[i].x * dt;
      ep[i * 3 + 1] += explosion.vel[i].y * dt;
      ep[i * 3 + 2] += explosion.vel[i].z * dt;
    }
    explosion.points.geometry.attributes.position.needsUpdate = true;
    explosion.points.material.opacity = Math.max(0, explosion.life);
    if (explosion.life <= 0) {
      scene.remove(explosion.points);
      explosion = null;
    }
  }

  // camera shake decay
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.set(
      CAM_BASE.x + (Math.random() - 0.5) * shake,
      CAM_BASE.y + (Math.random() - 0.5) * shake,
      CAM_BASE.z
    );
  } else {
    camera.position.copy(CAM_BASE);
  }

  if (state === STATE.PLAY) {
    elapsed += dt;
    score += dt * 10 + (speed / BASE_SPEED) * dt * 4;
    scoreEl.textContent = Math.floor(score);

    speed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * 1.6);
    spawnInterval = Math.max(0.45, 1.0 - elapsed * 0.012);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacles();
      spawnTimer = spawnInterval;
    }
  }

  // ease ship toward target lane + bank into the turn
  shipState.x += (shipState.targetX - shipState.x) * Math.min(1, dt * 12);
  ship.position.x = shipState.x;
  ship.position.y = SHIP_Y + Math.sin(performance.now() / 350) * 0.06;
  const drift = shipState.targetX - shipState.x;
  ship.rotation.z = THREE.MathUtils.clamp(-drift * 0.5, -0.6, 0.6);
  ship.rotation.y = THREE.MathUtils.clamp(-drift * 0.12, -0.2, 0.2);

  // move obstacles toward the camera + collision
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.position.z += moveSpeed * dt;
    o.rotation.x += o.userData.spin.x * dt;
    o.rotation.y += o.userData.spin.y * dt;
    o.rotation.z += o.userData.spin.z * dt;

    if (o.position.z > DESPAWN_Z) {
      releaseObstacle(o);
      obstacles.splice(i, 1);
      continue;
    }
    if (state === STATE.PLAY) {
      const dx = Math.abs(o.position.x - ship.position.x);
      const dz = Math.abs(o.position.z - SHIP_Z);
      if (dz < 0.9 + o.userData.radius && dx < 0.9 + o.userData.radius * 0.5) {
        gameOver();
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Resize + loop
// ---------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
function frame() {
  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05; // clamp after tab switches
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// signal to index.html that the 3D engine loaded successfully
window.__INFINRUN_READY = true;
