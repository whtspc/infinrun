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
const mathbar = document.getElementById("mathbar");
const targetEl = document.getElementById("target");
const exprEl = document.getElementById("expr");

// ---------------------------------------------------------------------------
// Constants / world layout
// ---------------------------------------------------------------------------
const LANES = 3;
const LANE_X = [-2.4, 0, 2.4]; // x position of each lane
const SHIP_Z = -3.5; // ship sits a bit down the track so side lanes stay on-screen
const SHIP_Y = 0.6;
const FLOOR_Y = -0.2;
const SPAWN_Z = -150; // tokens appear this far ahead
const DESPAWN_Z = 8; // ...and are recycled once they pass the camera

const BASE_SPEED = 22; // world units / second
const MAX_SPEED = 50; // capped lower than the dodger — you need time to read tokens

// Track curvature (purely visual). bend() returns a sideways offset that is
// ~0 at the ship's depth and grows with distance ahead, so the road appears
// to wind in the distance while gameplay lanes stay logically straight.
const CURVE_AMP = 6.0; // max lateral sway, world units
const CURVE_FREQ = 0.02; // spatial frequency → long, gentle curves

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

// ---------------------------------------------------------------------------
// Track curvature — one bend function shared by the shader (floor/rails) and
// the CPU (asteroids, camera) so everything curves together.
// ---------------------------------------------------------------------------
let traveled = 0; // distance scrolled so far; drives the traveling curve
const bendUniforms = {
  uTraveled: { value: 0 },
  uCurveAmp: { value: CURVE_AMP },
  uCurveFreq: { value: CURVE_FREQ },
  uShipZ: { value: SHIP_Z },
};

// JS mirror of the GLSL bend (must stay in sync with the shader below)
function bendX(z) {
  const ahead = SHIP_Z - z;
  return (
    CURVE_AMP *
    (Math.sin((traveled + ahead) * CURVE_FREQ) - Math.sin(traveled * CURVE_FREQ))
  );
}

// Make any material bend its geometry horizontally by world-Z. Works for the
// floor (rotated about X) and rails (no rotation) because neither rotates
// about Y/Z, so an object-space X offset equals a world-space X offset.
function makeBendable(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTraveled = bendUniforms.uTraveled;
    shader.uniforms.uCurveAmp = bendUniforms.uCurveAmp;
    shader.uniforms.uCurveFreq = bendUniforms.uCurveFreq;
    shader.uniforms.uShipZ = bendUniforms.uShipZ;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTraveled; uniform float uCurveAmp;
         uniform float uCurveFreq; uniform float uShipZ;
         float infinrunBendX(float z) {
           float ahead = uShipZ - z;
           return uCurveAmp *
             (sin((uTraveled + ahead) * uCurveFreq) - sin(uTraveled * uCurveFreq));
         }`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec4 infinrunWP = modelMatrix * vec4(position, 1.0);
         transformed.x += infinrunBendX(infinrunWP.z);`
      );
  };
  return material;
}

const gridTex = makeGridTexture();
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(LANE_X[2] - LANE_X[0] + 2.4, 400, 1, 240),
  makeBendable(new THREE.MeshBasicMaterial({ map: gridTex }))
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, FLOOR_Y, -190);
scene.add(floor);

// soft glowing edges along the track (segmented so they bend smoothly)
const edgeMat = makeBendable(new THREE.MeshBasicMaterial({ color: CYAN }));
for (const x of [LANE_X[0] - 1.2, LANE_X[2] + 1.2]) {
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 400, 1, 1, 240), edgeMat);
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
// Math tokens (digits + operators) — billboard glyph panels, pooled
// ---------------------------------------------------------------------------
const OP_SYMBOL = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const tokenGeo = new THREE.PlaneGeometry(1.5, 1.5);
const glyphCache = new Map(); // label -> CanvasTexture

function glyphTexture(label, isOp) {
  const key = (isOp ? "op:" : "n:") + label;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 192;
  const g = c.getContext("2d");
  const accent = isOp ? "#ffd84d" : "#36e0ff";
  // rounded neon panel
  const r = 34;
  g.lineWidth = 9;
  g.strokeStyle = accent;
  g.fillStyle = "rgba(8,14,28,0.82)";
  g.beginPath();
  g.moveTo(24 + r, 24);
  g.arcTo(168, 24, 168, 168, r);
  g.arcTo(168, 168, 24, 168, r);
  g.arcTo(24, 168, 24, 24, r);
  g.arcTo(24, 24, 168, 24, r);
  g.closePath();
  g.fill();
  g.stroke();
  // glyph
  g.fillStyle = accent;
  g.font = "bold 120px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = accent;
  g.shadowBlur = 18;
  g.fillText(label, 96, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  glyphCache.set(key, tex);
  return tex;
}

const tokens = [];
const tokenPool = [];

function getToken() {
  let m = tokenPool.pop();
  if (!m) {
    m = new THREE.Mesh(
      tokenGeo,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
    );
  }
  scene.add(m);
  return m;
}
function releaseToken(m) {
  scene.remove(m);
  tokenPool.push(m);
}

// ---------------------------------------------------------------------------
// Explosion particles
// ---------------------------------------------------------------------------
let explosion = null;
function spawnExplosion(pos, colorA = CYAN, colorB = PINK) {
  const N = 60;
  const pos32 = new Float32Array(N * 3);
  const col32 = new Float32Array(N * 3);
  const vel = [];
  const ca = new THREE.Color(colorA);
  const cb = new THREE.Color(colorB);
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
    const c = Math.random() < 0.5 ? ca : cb;
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
let spawnInterval = 1.2;
let shake = 0;
let solves = 0;
let target = 0;

const BEST_KEY = "infinrun_best";
let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
bestEl.textContent = best;

// --- Expression engine: a live, left-to-right calculator (no precedence) ---
// total: committed result; op: pending operator; building: number being typed
const expr = { total: null, op: null, building: null };

function applyOp(a, op, b) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return a / b;
  return b;
}

// the value the player is currently "holding" (includes the un-committed number)
function liveValue() {
  if (expr.building === null) return expr.total;
  if (expr.total === null) return expr.building;
  return applyOp(expr.total, expr.op, expr.building);
}

function resetExpr() {
  expr.total = null;
  expr.op = null;
  expr.building = null;
}

function pickTarget() {
  const max = Math.min(99, 12 + solves * 4);
  target = 2 + Math.floor(Math.random() * (max - 1));
  if (targetEl) targetEl.textContent = target;
}

function flashExpr(bad) {
  if (!exprEl) return;
  exprEl.classList.remove("flash-bad", "flash-good");
  void exprEl.offsetWidth; // restart the animation
  exprEl.classList.add(bad ? "flash-bad" : "flash-good");
}

function updateMathHud() {
  if (!exprEl) return;
  let s = "";
  if (expr.total !== null) s += expr.total;
  if (expr.op !== null) s += " " + OP_SYMBOL[expr.op] + " ";
  if (expr.building !== null) s += expr.building;
  const v = liveValue();
  if (s === "") s = "·";
  else if (v !== null) s += "  =  " + v;
  exprEl.textContent = s;
}

function onTargetHit() {
  solves += 1;
  score += 100 + Math.floor(elapsed); // small time bonus
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = best;
  }
  spawnExplosion(ship.position, CYAN, 0xffd84d);
  flashExpr(false);
  resetExpr();
  pickTarget();
  updateMathHud();
}

function afterCollect() {
  updateMathHud();
  const v = liveValue();
  if (v !== null && Number.isInteger(v) && v === target) onTargetHit();
}

function collectDigit(d) {
  expr.building = expr.building === null ? d : Math.min(expr.building * 10 + d, 9999);
  afterCollect();
}

function collectOperator(op) {
  // commit the number being typed using the previously-pending operator
  if (expr.building !== null) {
    if (expr.total === null) {
      expr.total = expr.building;
    } else if (expr.op === "/") {
      if (expr.building === 0 || expr.total % expr.building !== 0) {
        // illegal division → reset the expression (forgiving), with a cue
        resetExpr();
        flashExpr(true);
        shake = Math.max(shake, 0.25);
        updateMathHud();
        return;
      }
      expr.total = expr.total / expr.building;
    } else {
      expr.total = applyOp(expr.total, expr.op, expr.building);
    }
    expr.building = null;
  }
  // a leading operator (no number yet) is ignored
  if (expr.total !== null) expr.op = op;
  afterCollect();
}

function collectToken(data) {
  if (data.isOp) collectOperator(data.op);
  else collectDigit(data.digit);
}

function reset() {
  for (const t of tokens) releaseToken(t);
  tokens.length = 0;
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
  scoreEl.textContent = 0;
  speed = BASE_SPEED;
  elapsed = 0;
  traveled = 0;
  solves = 0;
  spawnInterval = 1.2;
  spawnTimer = 0.6;
  shake = 0;
  resetExpr();
  pickTarget();
  updateMathHud();
}

function startGame() {
  reset();
  state = STATE.PLAY;
  startScreen.classList.add("hidden");
  gameoverScreen.classList.add("hidden");
  hud.classList.remove("hidden");
  mathbar.classList.remove("hidden");
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
    mathbar.classList.add("hidden");
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
function randomTokenData() {
  // ~60% digit, ~40% operator
  if (Math.random() < 0.6) {
    return { isOp: false, digit: Math.floor(Math.random() * 10), label: null };
  }
  const ops = ["+", "-", "*", "/"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  return { isOp: true, op, label: OP_SYMBOL[op] };
}

function spawnTokens() {
  // pick 1 (sometimes 2) lanes, never all 3 — always leave a lane to skip into
  const lanes = [0, 1, 2];
  const first = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
  const chosen = [first];
  if (Math.random() < 0.55) chosen.push(lanes[Math.floor(Math.random() * lanes.length)]);

  for (const lane of chosen) {
    const data = randomTokenData();
    const label = data.isOp ? data.label : String(data.digit);
    const m = getToken();
    m.material.map = glyphTexture(label, data.isOp);
    m.material.needsUpdate = true;
    m.userData.lane = lane;
    m.userData.data = data;
    m.userData.done = false;
    m.position.set(LANE_X[lane] + bendX(SPAWN_Z), 0.95, SPAWN_Z);
    tokens.push(m);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  const moveSpeed = state === STATE.PLAY ? speed : BASE_SPEED * 0.6;

  // advance the traveling curve (drives the bend shader + CPU bend)
  traveled += moveSpeed * dt;
  bendUniforms.uTraveled.value = traveled;

  // scroll the track texture + starfield for a sense of motion
  gridTex.offset.y += moveSpeed * dt * 0.05;
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

  // aim the chase camera into the curve ahead, with a subtle roll
  const lookX = bendX(SHIP_Z - 55) * 0.45;
  camera.lookAt(lookX, 0.9, -16);
  camera.rotation.z = -lookX * 0.015;

  if (state === STATE.PLAY) {
    elapsed += dt;
    score += dt * 10 + (speed / BASE_SPEED) * dt * 4;
    scoreEl.textContent = Math.floor(score);

    speed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * 0.9);
    spawnInterval = Math.max(0.7, 1.2 - elapsed * 0.006);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTokens();
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

  // move tokens toward the camera; collect the one in the ship's lane
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    t.position.z += moveSpeed * dt;
    t.position.x = LANE_X[t.userData.lane] + bendX(t.position.z);
    t.quaternion.copy(camera.quaternion); // billboard toward the camera

    // resolve once as the token reaches the ship's depth
    if (!t.userData.done && t.position.z >= SHIP_Z) {
      t.userData.done = true;
      if (state === STATE.PLAY && t.userData.lane === shipState.lane) {
        collectToken(t.userData.data);
        releaseToken(t);
        tokens.splice(i, 1);
        continue;
      }
    }
    if (t.position.z > DESPAWN_Z) {
      releaseToken(t);
      tokens.splice(i, 1);
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
