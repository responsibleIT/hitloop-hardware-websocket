class HatsScene extends Scene {
  constructor(...a) {
    super(...a);
    this.dotSize = 4;
    this.targets = [];
    this.parts = [];
    this.play = false;
    this._k1 = false;
    this.mode = "default";
    this.t = 0;
    this.obstacles = [];
    // --- Step 1: magnets (left & right centers)
    this.magnets = []; // [{x,y},{x,y}]
    this.magnetR = 16; // visual radius for debug
    this.showMagnets = false; // draw faint markers (can toggle later)
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
      verticalGain: 3.0,
      verticalDeadzone: 0.05,
      horizontalGain: 3.0,
      horizontalDeadzone: 0.05,
    };
    this.ripples = [];
    // --- Hats (rendered above each device)
    this.hatImgs = [];
    this.hatByDevice = new Map(); // devKey -> p5.Image
    this.hatScale = 1.0; // relative scale to device circle size
    // Cooldown to avoid rapid-fire hat swaps on continuous contact
    this._hatSwapCooldown = new Map(); // pairKey -> frames remaining
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


    // Load hat images from ./images/hats/icon1.png ... icon10.png
    this.hatImgs.length = 0;
    try {
      for (let i = 1; i <= 10; i++) {
        const path = `./images/hats/icon${i}.png`;
        const img = loadImage(path);
        this.hatImgs.push(img);
      }
    } catch (_) {
      // ignore; we'll fallback to a simple shape if none load
    }

    this._updateMagnets();
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
    // remove horizontal wander; vertical is sensor-driven
    // (no random added to vx/vy)

    // --- Movement-based damping from accel
    const ax = this._normAccel(sensor.ax ?? sensor.aX ?? sensor.accX);
    const ay = this._normAccel(sensor.ay ?? sensor.aY ?? sensor.accY);
    const az = this._normAccel(sensor.az ?? sensor.aZ ?? sensor.accZ);
    // Horizontal movement: use ay only (ay>0 -> right, ay<0 -> left)
    const hCombo = ay;
    const hDead = this.params.horizontalDeadzone ?? 0.05;
    if (Math.abs(hCombo) > hDead) {
      p.vx += hCombo * (this.params.horizontalGain ?? 3.0);
    }
    // --- Vertical movement: use ax only
    // ax > 0 -> move up (negative vy); ax < 0 -> move down
    const combo = ax; // direct use of ax
    const dead = this.params.verticalDeadzone ?? 0.05;
    if (Math.abs(combo) > dead) {
      p.vy += -combo * (this.params.verticalGain ?? 3.0);
    }

    // --- Limit velocity per-axis (keep horizontal independent of vertical)
    const maxS = this.params.maxSpeed;
    p.vx = Math.max(-maxS, Math.min(maxS, p.vx));
    p.vy = Math.max(-maxS, Math.min(maxS, p.vy));

    p.x += p.vx;
    p.y += p.vy;

    // Keep inside bounds (accounting for circle radius)
    const pad = this.deviceRadius;
    p.x = constrain(p.x, pad, width - pad);
    p.y = constrain(p.y, pad, height - pad);

    return { x: p.x, y: p.y };
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

    const k1 = keyIsDown(49);
    if (k1 && !this._k1) {
      this.mode === "default" ? this._startWord() : this._clearWord();
    }
    this._k1 = k1;

    this.obstacles.length = 0;
    const dm = this.deviceManager,
      count = dm.getDeviceCount();
    const devs = [...dm.getAllDevices().values()],
      devPositions = [];
    const taps = [];
    for (const dev of devs) {
      const d = dev.getSensorData();
      const key = dev.id ?? dev.getId?.() ?? dev;

      // WanderingAttractors-style integration (smooth + weighted edge magnets)
      const pos = this._wanderAndAttract(key, d);

      devPositions.push({ x: pos.x, y: pos.y, d, key });
      if (d && d.tap && !d._tapHandled) {
        taps.push({ x: pos.x, y: pos.y, key });
      }
      // obstacles added after collision resolution
    }

    // Apply push impulses from taps (so you can push others away to prevent swaps)
    if (taps.length) {
      const influenceMax = Math.min(0.35 * Math.min(width, height), 280);
      const posKickMax = this.deviceRadius * 1.25;  // px positional kick at center
      const velKickMax = 4.0;                       // velocity impulse cap
      const pad = this.deviceRadius;

      for (const tEvt of taps) {
        for (const other of devPositions) {
          if (other.key === tEvt.key) continue;
          const dx = other.x - tEvt.x;
          const dy = other.y - tEvt.y;
          const dist = Math.hypot(dx, dy);
          if (!dist || dist > influenceMax) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          const falloff = 1 - dist / influenceMax; // 0..1
          const posKick = posKickMax * falloff;
          const velKick = velKickMax * falloff + 1.0; // ensure there's always a nudge

          // Nudge the working positions for this frame
          other.x += nx * posKick;
          other.y += ny * posKick;
          other.x = constrain(other.x, pad, width - pad);
          other.y = constrain(other.y, pad, height - pad);

          // Persist the push into device state so it carries across frames
          const p = this._devState.get(other.key);
          if (p) {
            p.x += nx * posKick;
            p.y += ny * posKick;
            p.x = constrain(p.x, pad, width - pad);
            p.y = constrain(p.y, pad, height - pad);
            p.vx += nx * velKick;
            p.vy += ny * velKick;
          }
        }
      }
    }

    // Decay hat-swap cooldowns each frame
    if (this._hatSwapCooldown && this._hatSwapCooldown.size) {
      for (const [k, v] of this._hatSwapCooldown) {
        const nv = v - 1;
        if (nv <= 0) this._hatSwapCooldown.delete(k);
        else this._hatSwapCooldown.set(k, nv);
      }
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

            // Swap hats on contact (with cooldown so it doesn't flicker-swap)
            if (a.key != null && b.key != null) {
              const pairKey = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
              if (!this._hatSwapCooldown.has(pairKey)) {
                const ha = this.hatByDevice.get(a.key);
                const hb = this.hatByDevice.get(b.key);
                this.hatByDevice.set(a.key, hb);
                this.hatByDevice.set(b.key, ha);
                // ~20 frames cooldown to prevent repeated swaps while overlapping
                this._hatSwapCooldown.set(pairKey, 20);
              }
            }
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


    // --- Update ripple waves (visual only) ---
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const w = this.ripples[i];
      push();
      blendMode(ADD);
      // soft outer glows
      noStroke();
      fill(255, 255, 255, 12);
      ellipse(w.x, w.y, (w.r + 18) * 2, (w.r + 18) * 2);
      fill(255, 255, 255, 16);
      ellipse(w.x, w.y, (w.r + 10) * 2, (w.r + 10) * 2);
      // hot rings
      noFill();
      stroke(255, 255, 255, 90); // main hot ring
      strokeWeight(4);
      ellipse(w.x, w.y, w.r * 2, w.r * 2);
      stroke(255, 255, 255, 60); // inner ring
      strokeWeight(2);
      if (w.r - 12 > 0) ellipse(w.x, w.y, (w.r - 12) * 2, (w.r - 12) * 2);
      stroke(255, 255, 255, 50); // outer ring
      strokeWeight(2);
      ellipse(w.x, w.y, (w.r + 12) * 2, (w.r + 12) * 2);
      pop();
      // evolve & cull
      w.r += w.speed;
      if (w.r > w.maxR || w.alpha <= 0) this.ripples.splice(i, 1);
    }

    // (star color mode and star drawing removed)
    this._drawWord();

    fill(255);
    noStroke();
    // text(`Devices: ${count}`, 10, 20);

    for (const { x, y, d, key } of devPositions) {
      // Spawn a one-shot ripple when tap goes from false -> true
      if (d && d.tap && !d._tapHandled) {
        this.ripples.push({
          x,
          y,
          r: this.deviceRadius,                        // start at device edge
          maxR: Math.min(0.22 * Math.min(width, height), 200),        // smaller visual radius
          influenceMax: Math.min(0.18 * Math.min(width, height), 160), // tighter physics radius
          band: 10,                                     // slightly wider ring so more nearby rain is affected
          speed: 7,                                     // keep visual speed
          strength: 50,                                // stronger base push
          impulseCap: 3.50,                             // allow a harder per-frame impulse (still capped)
          alpha: 255,                                   // fade-out alpha
          colR: 220,
          colG: 220,
          colB: 255,
        });
        d._tapHandled = true; // mark handled until tap releases
      } else if (d && !d.tap) {
        d._tapHandled = false;
      }
      noStroke();
      fill(255);
      ellipse(x, y, this.deviceRadius * 2);
      const ax = this._normAccel(d.ax ?? d.aX ?? d.accX);
      const ay = this._normAccel(d.ay ?? d.aY ?? d.accY);
      const az = this._normAccel(d.az ?? d.aZ ?? d.accZ);
      const m = 12 * (1 + 0.15 * az);
      const ex = ay * m;   // ay>0 -> right, ay<0 -> left
      const ey = -ax * m;  // ax>0 -> up, ax<0 -> down
      fill(255);
      ellipse(x - 16, y - 10, 32, 32);
      ellipse(x + 16, y - 10, 32, 32);
      fill(0);
      ellipse(x - 16 + ex, y - 10 + ey, 12, 12);
      ellipse(x + 16 + ex, y - 10 + ey, 12, 12);

      // Draw a random hat above this device circle (one-time assignment per device)
      if (!this.hatByDevice.has(key)) {
        const pool = this.hatImgs.filter(im => im && im.width);
        const chosen = pool.length ? pool[int(random(pool.length))] : null;
        this.hatByDevice.set(key, chosen);
      }
      const hatImg = this.hatByDevice.get(key);
      if (hatImg && hatImg.width) {
        push();
        imageMode(CENTER);
        const w = this.deviceRadius * 2 * this.hatScale;
        const h = (hatImg.height / hatImg.width) * w;
        image(hatImg, x, y - this.deviceRadius * 1.15, w, h);
        pop();
      }
    }
  }
}
