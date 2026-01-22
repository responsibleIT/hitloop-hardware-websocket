// Minimal sound loader that works with or without p5.sound
function _safeLoadSound(path, onLoad) {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.loadSound === "function"
    ) {
      // p5.sound is present – use it
      return window.loadSound(path, onLoad);
    }
  } catch (_) {}
  // Fallback: HTMLAudioElement shim with a tiny p5-like API we use later
  const audio = new Audio(path);
  // ensure callbacks fire once it's ready enough to play
  const ready = () => {
    if (onLoad) onLoad();
  };
  audio.addEventListener("canplaythrough", ready, { once: true });
  // p5-like helpers used in the scene
  audio.isLoaded = () => true;
  audio.isPlaying = () => !audio.paused;
  audio.setLoop = (b) => {
    audio.loop = !!b;
  };
  audio.setVolume = (v) => {
    audio.volume = Math.max(0, Math.min(1, v ?? 1));
  };
  audio.loop = () => {
    audio.play().catch(() => {});
  };
  return audio;
}
class PartialPhysicsWithGlowScene extends Scene {
  constructor(...a) {
    super(...a);
    this.dotSize = 4;
    this.targets = [];
    this.parts = [];
    this.play = false;
    this._k1 = false;
    this.mode = "default";
    this.t = 0;
    this.stars = [];
    this.starCap = 0;
    this.starLayer = null;
    this.obstacles = [];
    this._grid = null;
    this._cell = 48;
    this.bgSound = null;
    this._audioStarted = false;
    this.bgVol = 0.4;
    // --- Step 1: magnets (left & right centers)
    this.magnets = []; // [{x,y},{x,y}]
    this.magnetR = 16; // visual radius for debug
    this.showMagnets = true; // draw faint markers (can toggle later)
    this._k2 = false; // key '2' state (edge-trigger)
    this.starSplit = false; // when true: left stars = blue, right stars = red
    // Simplified magnet + random walk system for circles
    this._devState = new Map();
    this.magnetStrength = 0.01; // pull strength
    this.jitterStrength = 1.5; // random walk range
    this.deviceRadius = 40; // collision body radius for device circles
    this.collisionIterations = 4; // how many relaxation passes per frame
    this.magnetDampenFactor = 0.9; // 0..1, how strongly movement reduces magnet pull

    // WanderingAttractors-style motion params
    this.params = {
      maxSpeed: 2.0,
      maxForce: 0.08,
      wanderJitter: 0.05,
      baseAttraction: 0.16,
      edgePadding: 40,
    };
  }

  setup() {
    const pg = createGraphics(width, height);
    pg.pixelDensity(1);
    pg.background(255);
    pg.fill(0);
    pg.textAlign(CENTER, CENTER);
    pg.textStyle(BOLD);
    const fs = min(width, height) * 0.18;
    pg.textSize(fs);
    pg.text("Welcome", width / 2, height * 0.38);
    pg.text("to Hitloop", width / 2, height * 0.55);
    pg.loadPixels();

    const m = 40,
      g = 8,
      stepX = g,
      stepY = g * 0.866025403784;
    for (let y = m, row = 0; y < height - m; y += stepY, row++) {
      const xo = (row & 1) * (stepX * 0.5);
      for (let x = m + xo; x < width - m; x += stepX) {
        const i = 4 * (int(y) * width + int(x));
        if ((pg.pixels[i] + pg.pixels[i + 1] + pg.pixels[i + 2]) / 3 < 200)
          this.targets.push({ x, y });
      }
    }
    pg.remove();

    this.parts = this.targets.map((t) => ({
      x: random(width),
      y: random(height),
      tx: t.x,
      ty: t.y,
      vx: 0,
      vy: 0,
      dispersing: false,
      done: false,
    }));

    this.starLayer = createGraphics(width, height);
    this.starLayer.pixelDensity(1);
    this.starCap = width * 9;
    this.stars = new Array(this.starCap);

    // Load background sound (works with or without p5.sound)
    this.bgSound = _safeLoadSound("./sounds/rain.mp3", () => {
      try {
        if (this.bgSound && typeof this.bgSound.setLoop === "function")
          this.bgSound.setLoop(true);
        if (this.bgSound && typeof this.bgSound.setVolume === "function")
          this.bgSound.setVolume(this.bgVol);
      } catch (_) {}
      this._startBg();
    });

    this._updateMagnets();
  }

  _resetStars() {
    this.t = 0;
    this.stars.fill(undefined);
    this.starLayer.clear();
  }

  _startWord() {
    for (const p of this.parts) {
      p.x = random(width);
      p.y = random(height);
      p.vx = p.vy = 0;
      p.dispersing = false;
      p.done = false;
    }
    this.play = true;
    this.mode = "text";
  }

  _clearWord() {
    for (const p of this.parts) {
      p.done = true;
      p.dispersing = false;
    }
    this.mode = "default";
  }

  // Compute magnet positions for current canvas size
  _updateMagnets() {
    this.magnets = [
      { x: 0 + this.magnetR, y: height * 0.5 }, // left edge middle
      { x: width - this.magnetR, y: height * 0.5 }, // right edge middle
    ];
  }

  // (Debug) draw magnets so we can see them while building
  _drawMagnets() {
    if (!this.showMagnets) return;
    push();
    noFill();
    stroke(255, 90);
    strokeWeight(2);
    for (const m of this.magnets) {
      circle(m.x, m.y, this.magnetR * 2);
      // crosshair
      line(m.x - this.magnetR * 0.7, m.y, m.x + this.magnetR * 0.7, m.y);
      line(m.x, m.y - this.magnetR * 0.7, m.x, m.y + this.magnetR * 0.7);
    }
    pop();
  }

  // Wandering + left/right attraction (WanderingAttractors-style), circles only
  _wanderAndAttract(devKey, sensor) {
    let p = this._devState.get(devKey);
    if (!p) {
      p = {
        x: random(60, width - 60),
        y: random(60, height - 60),
        vx: random(-1, 1),
        vy: random(-1, 1),
      };
      this._devState.set(devKey, p);
    }

    // --- Wander: small random steering force
    const jitter = this.params.wanderJitter;
    p.vx += random(-jitter, jitter);
    p.vy += random(-jitter, jitter);

    // --- Attraction weights from NE/NW distance (inverse distance as proxy for strength)
    const eps = 1e-4;
    const invNW = 1.0 / max(eps, sensor.dNW || 0);
    const invNE = 1.0 / max(eps, sensor.dNE || 0);
    const sumInv = invNW + invNE + eps;
    const wLeft = invNW / sumInv; // left magnet maps to NW
    const wRight = invNE / sumInv; // right magnet maps to NE

    // --- Movement-based damping from accel
    const ax = this._normAccel(sensor.ax ?? sensor.aX ?? sensor.accX);
    const ay = this._normAccel(sensor.ay ?? sensor.aY ?? sensor.accY);
    const az = this._normAccel(sensor.az ?? sensor.aZ ?? sensor.accZ);
    const movement = Math.min(1, Math.sqrt(ax * ax + ay * ay + az * az));
    const attractBase =
      this.params.baseAttraction * (1 - movement * this.magnetDampenFactor);

    // --- Forces toward left/right attractors
    const left = this.magnets[0];
    const right = this.magnets[1];

    let lx = left.x - p.x,
        ly = left.y - p.y;
    let lm = Math.sqrt(lx * lx + ly * ly) || 1;
    lx /= lm;
    // horizontal-only magnet: zero vertical component
    p.vx += lx * (attractBase * wLeft);
    // no vertical magnet influence on vy

    let rx = right.x - p.x,
        ry = right.y - p.y;
    let rm = Math.sqrt(rx * rx + ry * ry) || 1;
    rx /= rm;
    // horizontal-only magnet: zero vertical component
    p.vx += rx * (attractBase * wRight);
    // no vertical magnet influence on vy

    // --- Limit velocity & integrate position
    const maxS = this.params.maxSpeed;
    const v2 = p.vx * p.vx + p.vy * p.vy;
    if (v2 > maxS * maxS) {
      const v = Math.sqrt(v2);
      p.vx = (p.vx / v) * maxS;
      p.vy = (p.vy / v) * maxS;
    }

    p.x += p.vx;
    p.y += p.vy;

    // Keep inside bounds (accounting for circle radius)
    const pad = this.deviceRadius;
    p.x = constrain(p.x, pad, width - pad);
    p.y = constrain(p.y, pad, height - pad);

    return { x: p.x, y: p.y };
  }

  _startBg() {
    // Try to resume WebAudio (if available)
    try {
      if (typeof getAudioContext === "function") {
        const ctx = getAudioContext();
        if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
      }
    } catch (_) {
      /* no-op */
    }

    // Try to start immediately
    try {
      if (
        this.bgSound &&
        typeof this.bgSound.isLoaded === "function" &&
        !this.bgSound.isPlaying()
      ) {
        if (typeof this.bgSound.loop === "function") this.bgSound.loop();
        if (typeof this.bgSound.setVolume === "function")
          this.bgSound.setVolume(this.bgVol);
      } else if (
        this.bgSound &&
        this.bgSound instanceof Audio &&
        this.bgSound.paused
      ) {
        this.bgSound.loop = true;
        this.bgSound.volume = this.bgVol;
        this.bgSound.play().catch(() => {});
      }
    } catch (_) {
      /* no-op */
    }

    // Also start on ANY user action (helps with autoplay policies)
    const startOnce = () => {
      try {
        if (typeof userStartAudio === "function") userStartAudio();
      } catch (_) {
        /* no-op */
      }
      try {
        if (
          this.bgSound &&
          typeof this.bgSound.isLoaded === "function" &&
          !this.bgSound.isPlaying()
        ) {
          if (typeof this.bgSound.loop === "function") this.bgSound.loop();
          if (typeof this.bgSound.setVolume === "function")
            this.bgSound.setVolume(this.bgVol);
        } else if (
          this.bgSound &&
          this.bgSound instanceof Audio &&
          this.bgSound.paused
        ) {
          this.bgSound.loop = true;
          this.bgSound.volume = this.bgVol;
          this.bgSound.play().catch(() => {});
        }
      } catch (_) {
        /* no-op */
      }
      window.removeEventListener("pointerdown", startOnce);
      window.removeEventListener("touchstart", startOnce);
      window.removeEventListener("keydown", startOnce);
    };
    window.addEventListener("pointerdown", startOnce, { once: true });
    window.addEventListener("touchstart", startOnce, { once: true });
    window.addEventListener("keydown", startOnce, { once: true });
  }

  _buildObstacleGrid() {
    const cell = this._cell,
      g = new Map();
    for (const o of this.obstacles) {
      const minCx = Math.floor((o.x - o.r) / cell),
        maxCx = Math.floor((o.x + o.r) / cell);
      const minCy = Math.floor((o.y - o.r) / cell),
        maxCy = Math.floor((o.y + o.r) / cell);
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const key = cx + "," + cy;
          let arr = g.get(key);
          if (!arr) {
            arr = [];
            g.set(key, arr);
          }
          arr.push(o);
        }
      }
    }
    this._grid = g;
  }

  _forEachNearbyOb(x, y, cb) {
    const cell = this._cell;
    const cx = Math.floor(x / cell),
      cy = Math.floor(y / cell);
    if (!this._grid) {
      for (const o of this.obstacles) {
        if (cb(o)) break;
      }
      return;
    }
    for (let iy = -1; iy <= 1; iy++) {
      for (let ix = -1; ix <= 1; ix++) {
        const arr = this._grid.get(cx + ix + "," + (cy + iy));
        if (!arr) continue;
        for (const o of arr) {
          if (cb(o)) return;
        }
      }
    }
  }

  _spawnStars(n = 9) {
    for (let i = 0; i < n; i++) {
      const idx = this.t % this.starCap;
      this.stars[idx] = {
        x: (this.t * 99) % width,
        y: 0,
        vx: random(-0.6, 0.6),
        vy: 0.5,
        s: 3,
      };
      this.t++;
    }
  }

  _moveStar(p) {
    const N = noise(p.x / width, p.y / 9, this.t / width);
    N > 0.4
      ? (p.vy += 0.28)
      : ((p.vx += N % 0.1 > 0.05 ? 0.03 : -0.03), (p.vy += 0.02));
    p.vx = constrain(p.vx, -2, 2);
    p.vy = constrain(p.vy, -4, 4);
    let nx = p.x + p.vx,
      ny = p.y + p.vy;
    this._forEachNearbyOb(nx, ny, (o) => {
      const dx = nx - o.x,
        dy = ny - o.y,
        d = sqrt(dx * dx + dy * dy);
      if (d < o.r + 0.5) {
        const nX = dx / (d || 1),
          nY = dy / (d || 1),
          dot = p.vx * nX + p.vy * nY;
        nx = o.x + nX * (o.r + 0.5);
        ny = o.y + nY * (o.r + 0.5);
        p.vx -= 2 * dot * nX;
        p.vy -= 2 * dot * nY;
        p.vx *= 0.6;
        p.vy *= 0.6;
        return true; // stop after first collision
      }
      return false;
    });
    p.x = nx;
    p.y = ny;
    p.s *= 0.997;
  }

  _drawStars(colorMode = "white") {
    this._spawnStars(9);
    const L = this.starLayer;
    L.push();
    L.noFill();
    let tint, blur, bgAlpha;
    switch (colorMode) {
      case "green":
        tint = color(80, 255, 160);
        blur = 2;
        bgAlpha = 6;
        break;
      case "red":
        tint = color(255, 100, 100);
        blur = 2;
        bgAlpha = 6;
        break;
      case "yellow":
        tint = color(255, 230, 120);
        blur = 2;
        bgAlpha = 6;
        break;
      case "orange":
        tint = color(255, 170, 80);
        blur = 2;
        bgAlpha = 6;
        break;
      default:
        tint = color(255);
        blur = 1;
        bgAlpha = 9;
    }
    L.background(0, bgAlpha);
    L.filter(BLUR, blur);
    // First move all stars (no drawing). Keeps cost constant across modes.
    for (const p of this.stars) {
      if (!p) continue;
      this._moveStar(p);
    }

    if (!this.starSplit) {
      // Single-pass draw
      L.stroke(tint);
      for (const p of this.stars) {
        if (!p) continue;
        L.strokeWeight(p.s);
        L.point(p.x, p.y);
      }
    } else {
      // Split mode: draw in two passes to avoid per-point state changes
      // Left half (blue)
      L.stroke(80, 180, 255);
      for (const p of this.stars) {
        if (!p || p.x >= width * 0.5) continue;
        L.strokeWeight(p.s);
        L.point(p.x, p.y);
      }
      // Right half (red)
      L.stroke(255, 100, 100);
      for (const p of this.stars) {
        if (!p || p.x < width * 0.5) continue;
        L.strokeWeight(p.s);
        L.point(p.x, p.y);
      }
    }
    L.pop();
    image(L, 0, 0);
  }

  _drawWord() {
    if (this.mode !== "text") return;
    noStroke();
    fill(255);
    let moving = false;
    for (const p of this.parts) {
      if (this.play) {
        p.x += (p.tx - p.x) / 30;
        p.y += (p.ty - p.y) / 30;
      }
      if (abs(p.tx - p.x) > 0.15 || abs(p.ty - p.y) > 0.15) moving = true;
      circle(p.x, p.y, this.dotSize);
    }
    if (this.play && !moving) this.play = false;
  }

  _normAccel(v) {
    if (v == null) return 0;
    if (v >= -1.5 && v <= 1.5) return constrain(v, -1, 1);
    if (v >= -20 && v <= 20) return constrain(v / 9.81, -1, 1);
    if (v >= 0 && v <= 255) return constrain((v - 127.5) / 127.5, -1, 1);
    return constrain(v, -1, 1);
  }

  draw() {
    background(0);
    this._updateMagnets();

    const k1 = keyIsDown(49);
    if (k1 && !this._k1) {
      this.mode === "default" ? this._startWord() : this._clearWord();
    }
    this._k1 = k1;
    const k2 = keyIsDown(50); // '2'
    if (k2 && !this._k2) {
      this.starSplit = !this.starSplit;
    }
    this._k2 = k2;

    this.obstacles.length = 0;
    const dm = this.deviceManager,
      count = dm.getDeviceCount();
    const devs = [...dm.getAllDevices().values()],
      devPositions = [];
    for (const dev of devs) {
      const d = dev.getSensorData();
      const key = dev.id ?? dev.getId?.() ?? dev;

      // WanderingAttractors-style integration (smooth + weighted edge magnets)
      const pos = this._wanderAndAttract(key, d);

      devPositions.push({ x: pos.x, y: pos.y, d });
      // obstacles added after collision resolution
    }

    // --- Resolve collisions between device circles (simple relaxation) ---
    const R = this.deviceRadius;
    const minDist = R * 2;
    for (let it = 0; it < this.collisionIterations; it++) {
      for (let i = 0; i < devPositions.length; i++) {
        for (let j = i + 1; j < devPositions.length; j++) {
          const a = devPositions[i];
          const b = devPositions[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist === 0) dist = 0.0001;
          if (dist < minDist) {
            const overlap = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            // keep inside bounds
            a.x = constrain(a.x, R, width - R);
            a.y = constrain(a.y, R, height - R);
            b.x = constrain(b.x, R, width - R);
            b.y = constrain(b.y, R, height - R);
          }
        }
      }
    }

    // Rebuild obstacles from resolved device positions
    for (const p of devPositions) {
      this.obstacles.push({ x: p.x, y: p.y, r: R });
    }

    if (this.mode === "text")
      for (const p of this.parts)
        this.obstacles.push({ x: p.x, y: p.y, r: this.dotSize * 0.6 });

    this._buildObstacleGrid();

    let colorMode = "white";
    if (devPositions.length) {
      const inQuad = (fx, fy) => devPositions.every((p) => fx(p.x) && fy(p.y));
      if (
        inQuad(
          (x) => x < width / 2,
          (y) => y < height / 2
        )
      )
        colorMode = "green";
      else if (
        inQuad(
          (x) => x > width / 2,
          (y) => y < height / 2
        )
      )
        colorMode = "red";
      else if (
        inQuad(
          (x) => x < width / 2,
          (y) => y > height / 2
        )
      )
        colorMode = "yellow";
      else if (
        inQuad(
          (x) => x > width / 2,
          (y) => y > height / 2
        )
      )
        colorMode = "orange";
    }

    this._drawStars(colorMode);
    this._drawWord();
    this._drawMagnets();


    for (const { x, y, d } of devPositions) {
      noStroke();
      fill(...d.color);
      ellipse(x, y, this.deviceRadius * 2);
      const ax = this._normAccel(d.ax ?? d.aX ?? d.accX);
      const ay = this._normAccel(d.ay ?? d.aY ?? d.accY);
      const az = this._normAccel(d.az ?? d.aZ ?? d.accZ);
      const m = 12 * (1 + 0.15 * az),
        ex = ax * m,
        ey = -ay * m;
      fill(255);
      ellipse(x - 16, y - 10, 32, 32);
      ellipse(x + 16, y - 10, 32, 32);
      fill(0);
      ellipse(x - 16 + ex, y - 10 + ey, 12, 12);
      ellipse(x + 16 + ex, y - 10 + ey, 12, 12);
    }
  }
  
  drawDebugText() {
    blendMode(BLEND);
    fill(255);
    textAlign(LEFT, TOP);
    textSize(16);
    text(`Devices: ${this.deviceManager.getDeviceCount()}`, 10, 20);
    text('Press D to toggle debug info', 10, height - 20);
  }
}
