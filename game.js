/* InfinRun — a 3-lane spaceship infinite runner.
   Vanilla Canvas, no dependencies. Portrait / mobile-first. */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // --- DOM ---
  const hud = document.getElementById("hud");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const startScreen = document.getElementById("start");
  const gameoverScreen = document.getElementById("gameover");
  const finalScoreEl = document.getElementById("final-score");
  const finalBestEl = document.getElementById("final-best");
  const newBestEl = document.getElementById("new-best");

  // --- World sizing (logical pixels) ---
  let W = 0;
  let H = 0;
  let dpr = 1;
  const LANES = 3;
  let laneX = []; // centre x of each lane
  let laneW = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    laneW = W / LANES;
    laneX = [];
    for (let i = 0; i < LANES; i++) laneX.push(laneW * (i + 0.5));
  }
  window.addEventListener("resize", resize);
  resize();

  // --- High score ---
  const BEST_KEY = "infinrun_best";
  let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
  bestEl.textContent = best;

  // --- Game state ---
  const STATE = { MENU: 0, PLAY: 1, OVER: 2 };
  let state = STATE.MENU;

  const ship = {
    lane: 1,
    x: 0, // current pixel x (eased toward target lane)
    targetX: 0,
    y: 0,
    w: 0,
    h: 0,
  };

  let obstacles = [];
  let stars = [];
  let score = 0;
  let speed = 0; // world scroll speed in px/sec
  let spawnTimer = 0;
  let spawnInterval = 0;
  let elapsed = 0;
  let shake = 0;
  let particles = [];

  const BASE_SPEED = 340;
  const MAX_SPEED = 900;

  function shipSize() {
    const s = Math.min(laneW * 0.62, 90);
    return { w: s, h: s * 1.25 };
  }

  function initStars() {
    stars = [];
    const count = Math.round((W * H) / 9000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: Math.random() * 0.8 + 0.2, // depth → speed & size
      });
    }
  }

  function reset() {
    const sz = shipSize();
    ship.w = sz.w;
    ship.h = sz.h;
    ship.lane = 1;
    ship.x = laneX[1];
    ship.targetX = laneX[1];
    ship.y = H - ship.h - Math.max(40, H * 0.08);
    obstacles = [];
    particles = [];
    score = 0;
    speed = BASE_SPEED;
    elapsed = 0;
    spawnInterval = 0.95;
    spawnTimer = 0.4;
    shake = 0;
    initStars();
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
    shake = 16;
    spawnExplosion(ship.x, ship.y + ship.h * 0.4);
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
    // brief delay so the explosion is visible before the overlay
    setTimeout(() => {
      hud.classList.add("hidden");
      gameoverScreen.classList.remove("hidden");
    }, 650);
  }

  // --- Controls ---
  function moveLane(dir) {
    if (state !== STATE.PLAY) return;
    const next = Math.max(0, Math.min(LANES - 1, ship.lane + dir));
    if (next !== ship.lane) {
      ship.lane = next;
      ship.targetX = laneX[next];
    }
  }

  // Keyboard (desktop testing)
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") moveLane(-1);
    else if (e.key === "ArrowRight" || e.key === "d") moveLane(1);
    else if ((e.key === " " || e.key === "Enter") && state !== STATE.PLAY) {
      state === STATE.MENU ? startGame() : startGame();
    }
  });

  // Touch / pointer: swipe to move, or tap a screen half
  let touchStartX = null;
  let touchStartY = null;
  let touchStartT = 0;
  const SWIPE_MIN = 28;

  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartT = performance.now();
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
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX > SWIPE_MIN && absX > absY) {
        moveLane(dx > 0 ? 1 : -1);
      } else if (absX < SWIPE_MIN && absY < SWIPE_MIN) {
        // treat as a tap on the left/right half
        moveLane(t.clientX < W / 2 ? -1 : 1);
      }
      touchStartX = null;
    },
    { passive: true }
  );

  // Mouse fallback (desktop): click a screen half
  canvas.addEventListener("mousedown", (e) => {
    if (state === STATE.PLAY) moveLane(e.clientX < W / 2 ? -1 : 1);
  });

  document.getElementById("play-btn").addEventListener("click", startGame);
  document.getElementById("retry-btn").addEventListener("click", startGame);

  // --- Spawning ---
  function spawnObstacle() {
    // Pick 1 (sometimes 2) lanes to block, never all 3 at once —
    // there must always be an open lane to escape into.
    const lanes = [0, 1, 2];
    const first = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
    const blocked = [first];
    if (Math.random() < 0.28) {
      const second = lanes[Math.floor(Math.random() * lanes.length)];
      blocked.push(second);
    }
    const sz = Math.min(laneW * 0.6, 86);
    blocked.forEach((lane) => {
      obstacles.push({
        lane,
        x: laneX[lane],
        y: -sz,
        r: sz / 2,
        spin: (Math.random() - 0.5) * 4,
        rot: Math.random() * Math.PI * 2,
        shape: makeAsteroidShape(),
      });
    });
  }

  function makeAsteroidShape() {
    const points = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      points.push(0.78 + Math.random() * 0.32);
    }
    return points;
  }

  function spawnExplosion(x, y) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 320;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.4,
        max: 1,
        size: 2 + Math.random() * 4,
        hue: Math.random() < 0.5 ? "#36e0ff" : "#ff4d8d",
      });
    }
  }

  // --- Update ---
  function update(dt) {
    // stars always drift
    const starSpeed = state === STATE.PLAY ? speed : BASE_SPEED * 0.5;
    for (const s of stars) {
      s.y += starSpeed * s.z * dt;
      if (s.y > H) {
        s.y = -2;
        s.x = Math.random() * W;
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 60);

    if (state !== STATE.PLAY) return;

    elapsed += dt;
    score += dt * 10 + (speed / BASE_SPEED) * dt * 4;
    scoreEl.textContent = Math.floor(score);

    // ramp difficulty
    speed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * 18);
    spawnInterval = Math.max(0.42, 0.95 - elapsed * 0.012);

    // ease ship toward target lane
    ship.x += (ship.targetX - ship.x) * Math.min(1, dt * 14);

    // spawn
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = spawnInterval;
    }

    // move obstacles + collision
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y += speed * dt;
      o.rot += o.spin * dt;
      if (o.y - o.r > H) {
        obstacles.splice(i, 1);
        continue;
      }
      if (hit(o)) {
        gameOver();
        return;
      }
    }
  }

  function hit(o) {
    // circle (obstacle) vs the ship's tighter hit-box
    const hbW = ship.w * 0.62;
    const hbH = ship.h * 0.72;
    const left = ship.x - hbW / 2;
    const right = ship.x + hbW / 2;
    const top = ship.y + (ship.h - hbH) / 2;
    const bottom = top + hbH;
    const cx = Math.max(left, Math.min(o.x, right));
    const cy = Math.max(top, Math.min(o.y, bottom));
    const dx = o.x - cx;
    const dy = o.y - cy;
    return dx * dx + dy * dy < o.r * 0.82 * (o.r * 0.82);
  }

  // --- Render ---
  function draw() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    // background
    ctx.fillStyle = "#05060f";
    ctx.fillRect(-30, -30, W + 60, H + 60);

    drawLanes();
    drawStars();

    for (const o of obstacles) drawAsteroid(o);

    if (state === STATE.PLAY || state === STATE.MENU) drawShip();

    drawParticles();

    ctx.restore();
  }

  function drawLanes() {
    ctx.save();
    ctx.strokeStyle = "rgba(54,224,255,0.10)";
    ctx.lineWidth = 2;
    for (let i = 1; i < LANES; i++) {
      const x = laneW * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    // soft glow at the player row
    const grad = ctx.createLinearGradient(0, H, 0, H * 0.6);
    grad.addColorStop(0, "rgba(54,224,255,0.08)");
    grad.addColorStop(1, "rgba(54,224,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);
    ctx.restore();
  }

  function drawStars() {
    for (const s of stars) {
      const size = s.z * 2.2;
      ctx.fillStyle = `rgba(255,255,255,${0.25 + s.z * 0.6})`;
      ctx.fillRect(s.x, s.y, size, size + s.z * 4);
    }
  }

  function drawShip() {
    const { x, y, w, h } = ship;
    ctx.save();
    ctx.translate(x, y + h / 2);

    // thruster flame
    const flame = 14 + Math.sin(performance.now() / 40) * 6;
    const fg = ctx.createLinearGradient(0, h / 2, 0, h / 2 + flame + 18);
    fg.addColorStop(0, "rgba(255,210,80,0.9)");
    fg.addColorStop(1, "rgba(255,77,141,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-w * 0.18, h * 0.45);
    ctx.lineTo(0, h * 0.45 + flame + 18);
    ctx.lineTo(w * 0.18, h * 0.45);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = "#dff6ff";
    ctx.strokeStyle = "#36e0ff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2); // nose
    ctx.quadraticCurveTo(w * 0.5, h * 0.1, w * 0.3, h * 0.42);
    ctx.lineTo(-w * 0.3, h * 0.42);
    ctx.quadraticCurveTo(-w * 0.5, h * 0.1, 0, -h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // wings
    ctx.fillStyle = "#36e0ff";
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h * 0.12);
    ctx.lineTo(w * 0.52, h * 0.42);
    ctx.lineTo(w * 0.26, h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, h * 0.12);
    ctx.lineTo(-w * 0.52, h * 0.42);
    ctx.lineTo(-w * 0.26, h * 0.4);
    ctx.closePath();
    ctx.fill();

    // cockpit
    ctx.fillStyle = "#0a2233";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.06, w * 0.13, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawAsteroid(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    ctx.beginPath();
    const n = o.shape.length;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const rr = o.r * o.shape[i];
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#6b5e74";
    ctx.fill();
    ctx.strokeStyle = "#ff4d8d";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // crater detail
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(o.r * 0.2, -o.r * 0.15, o.r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.hue;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // --- Loop ---
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp after tab switches
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // make sure ship has a sane initial position for the menu preview
  reset();
  state = STATE.MENU;
  requestAnimationFrame(frame);
})();
