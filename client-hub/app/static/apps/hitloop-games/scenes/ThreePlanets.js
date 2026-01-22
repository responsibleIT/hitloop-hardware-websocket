class ThreePlanets extends Scene {
  constructor(...a) {
    super(...a);
    // Three Big Hubs (blue left, red right, green top center)
    this.hubs = {
      blue: { cx: 0, cy: 0, baseR: 80, r: 80, targetR: 80, maxR: 200, growPerTap: 0.002 },
      red:  { cx: 0, cy: 0, baseR: 80, r: 80, targetR: 80, maxR: 200, growPerTap: 0.002 },
      green:{ cx: 0, cy: 0, baseR: 80, r: 80, targetR: 80, maxR: 200, growPerTap: 0.002 },
    };
    // Track per-device tap handling to avoid repeating the same tap in one frame
    this._tapHandled = new Map();
    // Device circle visuals
    this.deviceRadius = 40;
    this.deviceRingGap = 18; // distance between hub edge and device circle
    // Team assignment
    this._teamById = new Map();
    this._lastLedHexById = new Map();
    this.colors = {
      red: { name: 'red', rgb: [255, 0, 0], hex: 'ff0000' },
      blue: { name: 'blue', rgb: [0, 136, 255], hex: '0000ff' },
      green:{ name: 'green', rgb: [0, 255, 102], hex: '08ff0c' },
    };
    // Visual tap feedback ripples
    this.ripples = [];
    // Win/explosion state and device orbit
    this._state = 'normal'; // 'normal' | 'won'
    this._winner = null;    // 'blue' | 'red' | 'green'
    this._winFade = 0;      // 0..255 overlay
    this._orbitT = 0;       // flowing orbit time
  }

  setup() {
    // Initialize hub sizes with real canvas dimensions
    const minDim = Math.min(width, height);
    const leftX = width * 0.25;
    const rightX = width * 0.75;
    const cy = height / 2;
    const topX = width * 0.5;
    const topY = height * 0.28;
    for (const key of ['blue', 'red', 'green']) {
      const hub = this.hubs[key];
      if (key === 'blue') { hub.cx = leftX; hub.cy = cy; }
      else if (key === 'red') { hub.cx = rightX; hub.cy = cy; }
      else { hub.cx = topX; hub.cy = topY; }
      hub.baseR = minDim * 0.14;
      hub.r = hub.baseR;
      hub.targetR = hub.baseR;
      hub.maxR = minDim * 0.40;
      hub.growPerTap = minDim * 0.002;
      hub.minR = hub.baseR * 0.3;
      hub.decayPerSec = minDim * 0.003;
    }
    this._lastLedHexById.clear();
  }

  // Grow on tap helper
  _grow() {
    // Not used directly now; team-specific growth happens via _growTeam
  }

  _normAccel(v) {
    if (v == null) return 0;
    if (v >= -1.5 && v <= 1.5) return constrain(v, -1, 1);
    if (v >= -20 && v <= 20) return constrain(v / 9.81, -1, 1);
    if (v >= 0 && v <= 255) return constrain((v - 127.5) / 127.5, -1, 1);
    return constrain(v, -1, 1);
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

  _growTeam(teamKey) {
    const hub = this.hubs[teamKey];
    if (!hub) return;
    hub.targetR = Math.min(hub.maxR, hub.targetR + hub.growPerTap);
  }

  _syncControllerColors(devices) {
    // Clean up missing devices
    const present = new Set(devices.map((d) => d.getSensorData?.().id ?? d.id ?? d));
    for (const id of [...this._lastLedHexById.keys()]) {
      if (!present.has(id)) this._lastLedHexById.delete(id);
    }
    // Ensure each controller shows its team color
    for (const dev of devices) {
      const id = dev.getSensorData?.().id ?? dev.id ?? dev;
      const team = this._teamById.get(id) || 'blue';
      const color = this.colors[team];
      const last = this._lastLedHexById.get(id);
      if (!last || last.toLowerCase() !== color.hex.toLowerCase()) {
        try {
          this.deviceManager.sendCommandToDevice(id, 'led', color.hex);
        } catch (_) {}
        this._lastLedHexById.set(id, color.hex);
      }
    }
  }

  draw() {
    background(0);
    if (this._state === 'won') {
      this._drawWinFrame();
      return;
    }
    // Re-init hubs if needed (e.g., on resize)
    if (!this.hubs || !this.hubs.blue || !this.hubs.red || !this.hubs.green) {
      this.setup();
    } else {
      this.hubs.blue.cx = width * 0.25; this.hubs.blue.cy = height / 2;
      this.hubs.red.cx = width * 0.75; this.hubs.red.cy = height / 2;
      this.hubs.green.cx = width * 0.5; this.hubs.green.cy = height * 0.28;
      // keep other properties as-is
    }
    // Handle device taps: any device with d.tap grows the circle
    const dm = this.deviceManager;
    const devs = [...dm.getAllDevices().values()];
    // Maintain teams each frame to reflect joins/leaves
    this._assignTeamsEqual(devs);
    // Apply team LED colors to controllers (avoid resending same color)
    this._syncControllerColors(devs);
    const tappedThisFrame = new Set();
    for (const dev of devs) {
      const d = dev.getSensorData();
      const key = dev.id ?? dev.getId?.() ?? dev;
      const wasHandled = this._tapHandled.get(key) || false;
      const isTap = !!(d && d.tap);
      if (isTap && !wasHandled) {
        const team = this._teamById.get(key) || 'blue';
        this._growTeam(team);
        this._tapHandled.set(key, true);
        tappedThisFrame.add(key);
      } else if (!isTap && wasHandled) {
        this._tapHandled.set(key, false);
      }
    }

    // Continuous shrink toward minimum (per hub) and ease
    const dt = (typeof deltaTime === 'number' ? deltaTime : 16.666) / 1000;
    for (const key of ['blue', 'red', 'green']) {
      const hub = this.hubs[key];
      const minR = hub.minR ?? hub.baseR * 0.3;
      const decay = (hub.decayPerSec ?? Math.min(width, height) * 0.012) * dt;
      hub.targetR = Math.max(minR, hub.targetR - decay);
      hub.r += (hub.targetR - hub.r) * 0.15;
    }

    // Check for win condition
    for (const key of ['blue','red','green']) {
      const hub = this.hubs[key];
      if (hub.r >= hub.maxR * 0.98 || hub.targetR >= hub.maxR * 0.98) {
        this._state = 'won';
        this._winner = key;
        this._winFade = 0;
        break;
      }
    }

    // Draw the three hub circles using team colors
    noStroke();
    fill(...this.colors.blue.rgb);
    circle(this.hubs.blue.cx, this.hubs.blue.cy, this.hubs.blue.r * 2);
    fill(...this.colors.red.rgb);
    circle(this.hubs.red.cx, this.hubs.red.cy, this.hubs.red.r * 2);
    fill(...this.colors.green.rgb);
    circle(this.hubs.green.cx, this.hubs.green.cy, this.hubs.green.r * 2);

    // Draw device circles around their team's hub (with eyes; keep emoji colors)
    const byTeam = { blue: [], red: [], green: [] };
    for (let i = 0; i < devs.length; i++) {
      const dev = devs[i];
      const id = dev.getSensorData?.().id ?? dev.id ?? dev;
      const team = this._teamById.get(id) || 'blue';
      byTeam[team].push(dev);
    }
    for (const key of ['blue', 'red', 'green']) {
      const teamDevs = byTeam[key];
      if (teamDevs.length === 0) continue;
      const hub = this.hubs[key];
      let ringR = hub.r + this.deviceRadius + this.deviceRingGap;
      const safeR = Math.max(0, Math.min(
        hub.cx - this.deviceRadius,
        width - this.deviceRadius - hub.cx,
        hub.cy - this.deviceRadius,
        height - this.deviceRadius - hub.cy
      ));
      ringR = Math.min(ringR, safeR);
      for (let i = 0; i < teamDevs.length; i++) {
        const dev = teamDevs[i];
        const a = (i / teamDevs.length) * TWO_PI;
        const x = hub.cx + Math.cos(a) * ringR;
        const y = hub.cy + Math.sin(a) * ringR;
        // If this device tapped this frame, spawn a subtle ripple
        const id = dev.getSensorData?.().id ?? dev.id ?? dev;
        if (tappedThisFrame.has(id)) {
          this.ripples.push({
            x,
            y,
            r: this.deviceRadius,
            maxR: Math.min(0.22 * Math.min(width, height), 200),
            speed: 6,
            alpha: 160,
            stroke: 3,
          });
        }
        // body stays white (do not recolor emojis)
        fill(255);
        ellipse(x, y, this.deviceRadius * 2);
        // eyes (keep default colors: white and black)
        const d = dev.getSensorData();
        const ax = this._normAccel(d && (d.ax ?? d.aX ?? d.accX));
        const ay = this._normAccel(d && (d.ay ?? d.aY ?? d.accY));
        const az = this._normAccel(d && (d.az ?? d.aZ ?? d.accZ));
        const m = 12 * (1 + 0.15 * az);
        const ex = ay * m;
        const ey = -ax * m;
        // eyeballs
        fill(255);
        ellipse(x - 16, y - 10, 32, 32);
        ellipse(x + 16, y - 10, 32, 32);
        // pupils
        fill(0);
        ellipse(x - 16 + ex, y - 10 + ey, 12, 12);
        ellipse(x + 16 + ex, y - 10 + ey, 12, 12);
      }
    }

    // Draw and update ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const w = this.ripples[i];
      noFill();
      stroke(255, 255, 255, w.alpha);
      strokeWeight(w.stroke);
      ellipse(w.x, w.y, w.r * 2, w.r * 2);
      // faint second ring
      stroke(255, 255, 255, Math.max(0, w.alpha - 60));
      strokeWeight(Math.max(1, w.stroke - 1));
      if (w.r - 10 > 0) ellipse(w.x, w.y, (w.r - 10) * 2, (w.r - 10) * 2);
      // evolve & cull
      w.r += w.speed;
      w.alpha -= 10;
      w.stroke = Math.max(1, w.stroke - 0.15);
      if (w.r > w.maxR || w.alpha <= 0) this.ripples.splice(i, 1);
    }
  }

  _drawWinFrame() {
    const winner = this._winner || 'blue';
    const winHub = this.hubs[winner];
    const losers = ['blue','red','green'].filter(k => k !== winner);
    // Expand winner
    const targetBig = Math.hypot(width, height);
    winHub.r += (targetBig - winHub.r) * 0.06; // slower growth
    // Phase 1: fade background overlay
    this._winFade = Math.min(255, this._winFade + 4);
    // Phase 2: collapse losers after background filled
    if (this._winFade >= 255) {
      for (const lk of losers) {
        const L = this.hubs[lk];
        L.r += (0 - L.r) * 0.12;
      }
    }
    // Background flood behind all
    const col = this.colors[winner].rgb;
    noStroke();
    fill(col[0], col[1], col[2], this._winFade);
    rect(0,0,width,height);
    // Draw planets
    fill(...col);
    circle(winHub.cx, winHub.cy, winHub.r * 2);
    for (const lk of losers) {
      const L = this.hubs[lk];
      if (L.r > 1) { const lc = this.colors[lk].rgb; fill(...lc, 180); circle(L.cx, L.cy, L.r * 2); }
    }
    // Devices keep flowing around hubs; winner faster
    const dm = this.deviceManager; const devs = [...dm.getAllDevices().values()];
    const byTeam = { blue: [], red: [], green: [] };
    for (const dev of devs) { const id = dev.getSensorData?.().id ?? dev.id ?? dev; const team = this._teamById?.get?.(id) || 'blue'; byTeam[team].push(dev); }
    this._orbitT += 0.015;
    for (const key of ['blue','red','green']) {
      const teamDevs = byTeam[key] || []; const hub = this.hubs[key];
      let ringR = hub.r + this.deviceRadius + this.deviceRingGap;
      const safeR = Math.max(0, Math.min(hub.cx - this.deviceRadius, width - this.deviceRadius - hub.cx, hub.cy - this.deviceRadius, height - this.deviceRadius - hub.cy));
      ringR = Math.min(ringR, safeR);
      for (let i=0;i<teamDevs.length;i++) {
        const speed = key === winner ? 2.0 : 1.0;
        const a = (i/Math.max(1,teamDevs.length))*TWO_PI + this._orbitT * (key==='blue'?1:(key==='red'?-1:0.8)) * speed;
        const x = hub.cx + Math.cos(a)*ringR; const y = hub.cy + Math.sin(a)*ringR;
        fill(255); ellipse(x,y,this.deviceRadius*2);
        const d = teamDevs[i].getSensorData?.()||{}; const ax=this._normAccel(d.ax??d.aX??d.accX); const ay=this._normAccel(d.ay??d.aY??d.accY); const az=this._normAccel(d.az??d.aZ??d.accZ);
        const m=12*(1+0.15*az); const ex=ay*m; const ey=-ax*m; fill(255); ellipse(x-16,y-10,32,32); ellipse(x+16,y-10,32,32); fill(0); ellipse(x-16+ex,y-10+ey,12,12); ellipse(x+16+ex,y-10+ey,12,12);
      }
    }
    // Ripples
    for (let i=this.ripples.length-1;i>=0;i--){const w=this.ripples[i];noFill();stroke(255,255,255,w.alpha);strokeWeight(w.stroke);ellipse(w.x,w.y,w.r*2,w.r*2);stroke(255,255,255,Math.max(0,w.alpha-60));strokeWeight(Math.max(1,w.stroke-1));if(w.r-10>0)ellipse(w.x,w.y,(w.r-10)*2,(w.r-10)*2);w.r+=w.speed;w.alpha-=10;w.stroke=Math.max(1,w.stroke-0.15);if(w.r>w.maxR||w.alpha<=0)this.ripples.splice(i,1);}    
  }
}
