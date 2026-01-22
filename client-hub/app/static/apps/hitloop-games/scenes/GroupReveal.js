  class GroupReveal extends Scene {
    constructor(...a) {
      super(...a);
      this.dotSize = 4;
      this.targets = [];
      this.parts = [];
      this.play = false;
      this._k1 = false;
      this.mode = "default";
      this.t = 0;
      // --- Step 1: magnets (left & right centers)
      this.magnets = []; // [{x,y},{x,y}]
      this.magnetR = 16; // visual radius for debug
      this.showMagnets = false; // draw faint markers (can toggle later)
      // Simplified magnet + random walk system for circles
      this._devState = new Map();
      this.magnetStrength = 0.01; // pull strength
      this.jitterStrength = 1.5; // random walk range
      this.deviceRadius = 28; // collision body radius for device circles (smaller)
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
      // --- Three Planets (controllers) ---
      this.hubs = {
        blue: { cx: 0, cy: 0, baseR: 80, r: 80, targetR: 80, maxR: 200, growPerTap: 0.002 },
        red:  { cx: 0, cy: 0, baseR: 80, r: 80, targetR: 80, maxR: 200, growPerTap: 0.002 },
        green:{ cx: 0, cy: 0, baseR: 80, r: 80, targetR: 80, maxR: 200, growPerTap: 0.002 },
      };
      this._teamById = new Map();
      this._lastLedHexById = new Map();
      this.colors = {
        red: { name: 'red', rgb: [255, 0, 0], hex: 'ff0000' },
        blue: { name: 'blue', rgb: [0, 136, 255], hex: '0000ff' },
        green:{ name: 'green', rgb: [0, 255, 102], hex: '08ff0c' },
      };
      this.deviceRadius = 28; // reuse for device emoji size
      this._hubMotion = {
        blue: { vx: 0, vy: 0 },
        red: { vx: 0, vy: 0 },
        green: { vx: 0, vy: 0 },
      };
      // --- Scratch & Reveal layer (circle cover)
      this.bgImg = null;         // image behind the cover dots
      this.coverDots = [];       // grid of small circles that hide the image
      this.coverR = 10;           // radius of each cover dot (smaller)
      this.coverSpacing = 15;     // very tight spacing (slight overlap so no BG shows)
      this.coverFriction = 0.98; // for explode motion
      this.coverGravity = 0.40;  // for fall/explode
      this.coverBlastR = 100;     // tap blast radius
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
  

      // Load background image (shown under the cover dots)
      try {
        this.bgImg = loadImage("./images/starry-night.jpg");
      } catch (_) {
        this.bgImg = null; // fallback handled in draw()
      }
      // Build the initial cover dot grid
      this._initCoverDots();


      this._updateMagnets();

      // Initialize three planets positions/sizes
      const minDim = Math.min(width, height);
      const leftX = width * 0.25;
      const rightX = width * 0.75;
      const cy = height * 0.62;
      const topX = width * 0.5;
      const topY = height * 0.28;
      for (const key of ['blue', 'red', 'green']) {
        const hub = this.hubs[key];
        if (key === 'blue') { hub.cx = leftX; hub.cy = cy; }
        else if (key === 'red') { hub.cx = rightX; hub.cy = cy; }
        else { hub.cx = topX; hub.cy = topY; }
        hub.baseR = minDim * 0.085; // slightly smaller planet
        hub.r = hub.baseR;
        hub.targetR = hub.baseR;
        hub.maxR = minDim * 0.40;
        hub.growPerTap = minDim * 0.002;
        hub.minR = hub.baseR * 0.3;
        hub.decayPerSec = minDim * 0.003;
      }
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

    // --- Scratch & Reveal (cover dots) -------------------------------------
    _initCoverDots() {
      this.coverDots.length = 0;
      const r = this.coverR;
      const s = this.coverSpacing || r * 2 + 2;
      // compute how many columns/rows are needed to cover the full canvas
      const cols = Math.max(1, Math.ceil((width - 2 * r) / s) + 1);
      const rows = Math.max(1, Math.ceil((height - 2 * r) / s) + 1);
      for (let row = 0; row < rows; row++) {
        const y = Math.min(r + row * s, height - r); // clamp last row to bottom edge
        for (let col = 0; col < cols; col++) {
          const x = Math.min(r + col * s, width - r); // clamp last col to right edge
          this.coverDots.push({ x, y, vx: 0, vy: 0, state: "idle" });
        }
      }
    }

    _blastDots(cx, cy, R = this.coverBlastR) {
      const R2 = R * R;
      for (const d of this.coverDots) {
        if (d.state === "gone") continue;
        const dx = d.x - cx;
        const dy = d.y - cy;
        if (dx * dx + dy * dy <= R2) {
          if (Math.random() < 0.5) {
            // fall
            d.state = "fall";
            d.vx = 0;
            d.vy = Math.random() * 1.5 + 0.5;
          } else {
            // explode outward from tap center
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = 3 + Math.random() * 4;
            d.state = "explode";
            d.vx = (dx / dist) * speed;
            d.vy = (dy / dist) * speed * 0.8 - 0.5; // slight upward kick
          }
        }
      }
    }

    _updateCoverDots() {
      const g = this.coverGravity;
      const fr = this.coverFriction;
      for (const d of this.coverDots) {
        if (d.state === "idle") continue;
        if (d.state === "fall") {
          d.vy += g;
        } else if (d.state === "explode") {
          d.vy += g * 0.6;
          d.vx *= fr;
          d.vy *= fr;
        }
        d.x += d.vx;
        d.y += d.vy;
        if (d.y - this.coverR > height + 40 || d.x < -40 || d.x > width + 40) {
          d.state = "gone";
        }
      }
    }

    _drawCoverDots() {
      push();
      noStroke();
      // Softer blue #AAC8E1 (lower contrast)
      const nr = 170, ng = 200, nb = 225;
      fill(nr, ng, nb);
      for (const d of this.coverDots) {
        if (d.state === "gone") continue;
        circle(d.x, d.y, this.coverR * 2);
      }
      pop();
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
  
    _assignTeamsEqual(devices) {
      const ids = devices.map((d) => d.getSensorData?.().id ?? d.id ?? d);
      const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
      const n = sorted.length;
      const t1 = Math.ceil(n / 3);
      const t2 = Math.ceil((2 * n) / 3);
      const blueSet = new Set(sorted.slice(0, t1));
      const redSet = new Set(sorted.slice(t1, t2));
      for (const id of sorted) {
        const team = blueSet.has(id) ? 'blue' : redSet.has(id) ? 'red' : 'green';
        this._teamById.set(id, team);
      }
    }

    _syncControllerColors(devices) {
      const present = new Set(devices.map((d) => d.getSensorData?.().id ?? d.id ?? d));
      for (const id of [...this._lastLedHexById.keys()]) {
        if (!present.has(id)) this._lastLedHexById.delete(id);
      }
      for (const dev of devices) {
        const id = dev.getSensorData?.().id ?? dev.id ?? dev;
        const team = this._teamById.get(id) || 'blue';
        const color = this.colors[team];
        const last = this._lastLedHexById.get(id);
        if (!last || last.toLowerCase() !== color.hex.toLowerCase()) {
          try { this.deviceManager.sendCommandToDevice(id, 'led', color.hex); } catch (_) {}
          this._lastLedHexById.set(id, color.hex);
        }
      }
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
      // (star toggle and obstacles removed)
      const dm = this.deviceManager,
        count = dm.getDeviceCount();
      const devs = [...dm.getAllDevices().values()];
      // Teams + controller colors
      this._assignTeamsEqual(devs);
      this._syncControllerColors(devs);
      // Arrange devices inside their team's planet (ring inside hub)
      const byTeam = { blue: [], red: [], green: [] };
      const tapPositions = [];
      for (const dev of devs) {
        const id = dev.getSensorData?.().id ?? dev.id ?? dev;
        const team = this._teamById.get(id) || 'blue';
        byTeam[team].push(dev);
      }
      // Planet motion: move hubs by average team tilt
      const motionGain = 3.0; // responsiveness
      const damping = 0.90;
      const maxSpeed = 12;
      // keep planets inside screen by their radius
      for (const key of ['blue', 'red', 'green']) {
        const teamDevs = byTeam[key];
        if (teamDevs.length) {
          let sumAx = 0, sumAy = 0;
          for (const dev of teamDevs) {
            const d = dev.getSensorData?.() || {};
            sumAx += this._normAccel(d.ax ?? d.aX ?? d.accX);
            sumAy += this._normAccel(d.ay ?? d.aY ?? d.accY);
          }
          const ax = sumAx / teamDevs.length;
          const ay = sumAy / teamDevs.length;
          const m = this._hubMotion[key];
          m.vx += ay * motionGain;   // ay>0 -> move right
          m.vy += -ax * motionGain;  // ax>0 -> move up
          // clamp speed
          m.vx = Math.max(-maxSpeed, Math.min(maxSpeed, m.vx));
          m.vy = Math.max(-maxSpeed, Math.min(maxSpeed, m.vy));
          // integrate
          this.hubs[key].cx += m.vx;
          this.hubs[key].cy += m.vy;
          // bounds (account for radius)
          const rBound = this.hubs[key].r;
          this.hubs[key].cx = constrain(this.hubs[key].cx, rBound, width - rBound);
          this.hubs[key].cy = constrain(this.hubs[key].cy, rBound, height - rBound);
          // decay velocity
          m.vx *= damping;
          m.vy *= damping;
        }
      }

      // Prevent planets from overlapping: pairwise separation
      const pairs = [['blue','red'], ['blue','green'], ['red','green']];
      for (const [ak, bk] of pairs) {
        const A = this.hubs[ak], B = this.hubs[bk];
        const dx = B.cx - A.cx, dy = B.cy - A.cy;
        let dist = Math.hypot(dx, dy);
        if (dist === 0) dist = 0.0001;
        const minDist = A.r + B.r + 12; // small gap
        if (dist < minDist) {
          const nx = dx / dist, ny = dy / dist;
          const push = (minDist - dist) * 0.5;
          A.cx -= nx * push; A.cy -= ny * push;
          B.cx += nx * push; B.cy += ny * push;
          // re-clamp to screen
          A.cx = constrain(A.cx, A.r, width - A.r);
          A.cy = constrain(A.cy, A.r, height - A.r);
          B.cx = constrain(B.cx, B.r, width - B.r);
          B.cy = constrain(B.cy, B.r, height - B.r);
        }
      }
  
      // Draw planets behind
      noStroke();
      fill(...this.colors.blue.rgb);
      circle(this.hubs.blue.cx, this.hubs.blue.cy, this.hubs.blue.r * 2);
      fill(...this.colors.red.rgb);
      circle(this.hubs.red.cx, this.hubs.red.cy, this.hubs.red.r * 2);
      fill(...this.colors.green.rgb);
      circle(this.hubs.green.cx, this.hubs.green.cy, this.hubs.green.r * 2);
  
      // --- Update ripple waves (visual only) ---
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const w = this.ripples[i];
        push();
        noFill();
        const a1 = 255, a2 = 210, a3 = 130;
        // inner ring
        stroke(w.colR, w.colG, w.colB, a2);
        strokeWeight(2);
        if (w.r - 10 > 0) ellipse(w.x, w.y, (w.r - 10) * 2, (w.r - 10) * 2);
        // main ring
        stroke(w.colR, w.colG, w.colB, a1);
        strokeWeight(4);
        ellipse(w.x, w.y, w.r * 2, w.r * 2);
        // outer ring
        stroke(w.colR, w.colG, w.colB, a3);
        strokeWeight(2);
        ellipse(w.x, w.y, (w.r + 10) * 2, (w.r + 10) * 2);
        pop();
        // Evolve wave
        w.r += w.speed;
        // Remove finished wave
        if (w.r > w.maxR || w.alpha <= 0) {
          this.ripples.splice(i, 1);
        }
      }
  
      // (color mode and star drawing removed)
      this._drawWord();

      // --- Background image shown under the cover dots ---
      if (this.bgImg && this.bgImg.width) {
        image(this.bgImg, 0, 0, width, height);
      } else {
        // simple fallback gradient
        for (let y = 0; y < height; y += 4) {
          const a = map(y, 0, height, 30, 90);
          stroke(40, a);
          line(0, y, width, y);
        }
        noStroke();
      }
      // Update and draw the cover dots (white disks that hide the image)
      this._updateCoverDots();
      this._drawCoverDots();

      // Draw simple planets (no shading)
      noStroke();
      fill(...this.colors.blue.rgb);
      circle(this.hubs.blue.cx, this.hubs.blue.cy, this.hubs.blue.r * 2);
      fill(...this.colors.red.rgb);
      circle(this.hubs.red.cx, this.hubs.red.cy, this.hubs.red.r * 2);
      fill(...this.colors.green.rgb);
      circle(this.hubs.green.cx, this.hubs.green.cy, this.hubs.green.r * 2);
  
      fill(255);
      noStroke();
      // text(`Devices: ${count}`, 10, 20);
  
      // Draw devices inside their team planet
      for (const key of ['blue', 'red', 'green']) {
        const teamDevs = byTeam[key];
        if (teamDevs.length === 0) continue;
        const hub = this.hubs[key];
        const innerR = Math.max(hub.r - this.deviceRadius - 6, this.deviceRadius + 2);
        for (let i = 0; i < teamDevs.length; i++) {
          const dev = teamDevs[i];
          const d = dev.getSensorData();
          const a = (i / teamDevs.length) * TWO_PI;
          const x = hub.cx + Math.cos(a) * innerR;
          const y = hub.cy + Math.sin(a) * innerR;
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
            // defer scratching; only scratch if everyone taps together
            tapPositions.push({ x, y });
          d._tapHandled = true; // mark handled until tap releases
        } else if (d && !d.tap) {
          d._tapHandled = false;
        }
        noStroke();
        fill(255);
        ellipse(x, y, this.deviceRadius * 2);
        // devices have no eyes
        }
      }

      // Scratch only if all devices in a team tapped; scratch the planet area
      const teamAllTapped = (teamKey) => {
        const teamDevs = byTeam[teamKey];
        if (!teamDevs.length) return false;
        for (const dev of teamDevs) {
          const sd = dev.getSensorData?.() || {};
          if (!sd.tap) return false;
        }
        return true;
      };
      for (const team of ['blue','red','green']) {
        if (teamAllTapped(team)) {
          const hub = this.hubs[team];
          // Scratch slightly larger than the planet's disk
          this._blastDots(hub.cx, hub.cy, hub.r * 1.1);
        }
      }
    }
  }
  