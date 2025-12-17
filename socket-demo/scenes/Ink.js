class Ink extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    this.t = 0;
    this.W = 720;
    this.particles = [];
    
    // Device state management
    this.deviceRadius = 40;
    this._state = new Map(); // id -> {x, y, vx, vy}
    this._colors = new Map();
    this._lastLedHex = new Map();
    
    // Target colors for corners
    this.colors = {
      NW: [0, 0, 255],     // Blue
      NE: [255, 0, 0],     // Red
      SE: [0, 255, 0],     // Green
      SW: [255, 165, 0]    // Orange
    };
    
    this.inkLayer = null;
  }

  setup() {
    this.t = 0;
    this.particles = [];
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
    
    // Create off-screen graphics buffer for ink
    // This allows us to persist the ink trails without smearing the devices
    this.inkLayer = createGraphics(width, height);
    this.inkLayer.background(0); // Start black
  }

  draw() {
    if (!this.inkLayer || this.inkLayer.width !== width || this.inkLayer.height !== height) {
        this.inkLayer = createGraphics(width, height);
        this.inkLayer.background(0);
    }
    
    this.t++;
    
    // --- 1. Draw to Ink Layer ---
    this.inkLayer.push();
    // Fade the ink layer (trail effect)
    this.inkLayer.noStroke();
    this.inkLayer.fill(0, 50); // Stronger fade (was 20) to keep ink contained
    this.inkLayer.rect(0, 0, width, height);
    
    this.inkLayer.noStroke();
    
    // Manage Devices (Physics only) & Spawn Particles
    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();
    const renderList = [];

    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data);

      const col = this._getColor(state, id);
      renderList.push({ state, col, id });
      
      // Spawn Ink Particle
      // Reduced spawn rate and spread for "little ink"
      if (random(1) < 0.2) {
        this.particles.push({
          x: state.x + random(-5, 5), // Tight spawn area
          y: state.y + random(-5, 5),
          s: 0.1 // Start slightly later in lifecycle (smaller initial radius)
        });
      }
    }

    // Draw Particles to inkLayer
    // Iterate backwards to allow removal
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.s += 0.02; // Faster lifecycle
      
      // Remove particle if it gets too old/small
      if (p.s > 1.5) {
        this.particles.splice(i, 1);
        continue;
      }

      let T = Math.tan(p.s) * 19;
      if (Math.abs(T) < 0.01) T = 0.01;
      
      this.inkLayer.fill(255, Math.min(255, Math.abs(T)));
      
      // Motion
      // Reduced noise scale and speed for less spread
      let A = noise(p.x / 360, p.y / 99, this.t / this.W) * 20;
      
      p.x += Math.cos(A) * 1; // Reduced speed (was 3)
      p.y += Math.sin(A) * 1;
      
      // Circle
      let r = 360 / T;
      r = Math.min(Math.abs(r), 200); // Cap max radius (was 1000)
      
      this.inkLayer.circle(p.x, p.y, r);
    }
    
    // Limit total particles just in case
    const maxParticles = 500; // Reduced max count
    if (this.particles.length > maxParticles) {
      this.particles.splice(0, this.particles.length - maxParticles);
    }
    
    // Apply Filter to inkLayer (Posterize effect on the ink)
    // Applying filter to a graphics buffer is supported in recent p5.js
    try {
       this.inkLayer.filter(POSTERIZE, 3);
    } catch(e) {}
    
    this.inkLayer.pop();
    
    // --- 2. Draw to Main Canvas ---
    
    // Draw the Ink Layer
    image(this.inkLayer, 0, 0);
    
    // Draw Devices on top (crisp, no trails)
    this._separateOverlaps(renderList.map((r) => r.state));

    for (const { state, col, id } of renderList) {
      this._drawFace(state, col);

      // Keep device LED in sync
      const hex = this._rgbToHex(col);
      const last = this._lastLedHex.get(id);
      if (hex !== last) {
        try {
          this.deviceManager.sendCommandToDevice?.(id, 'led', hex);
          this._lastLedHex.set(id, hex);
        } catch (_) {}
      }
    }

    // Cleanup missing
    for (const key of [...this._state.keys()]) {
      if (!present.has(key)) this._state.delete(key);
    }
    for (const key of [...this._colors.keys()]) {
      if (!present.has(key)) this._colors.delete(key);
    }
  }

  // --- HELPER METHODS (Copied from ControlTheBall) ---

  _getState(id) {
    let s = this._state.get(id);
    if (!s) {
      s = {
        x: random(this.deviceRadius * 1.5, width - this.deviceRadius * 1.5),
        y: random(this.deviceRadius * 1.5, height - this.deviceRadius * 1.5),
        vx: 0,
        vy: 0,
      };
      this._state.set(id, s);
    }
    return s;
  }

  _getColor(state, id) {
    const isLeft = state.x < width / 2;
    const isTop = state.y < height / 2;

    let target;
    if (isTop && isLeft) target = this.colors.NW;      
    else if (isTop && !isLeft) target = this.colors.NE; 
    else if (!isTop && !isLeft) target = this.colors.SE; 
    else target = this.colors.SW;                        

    // Transition Logic
    const current = this._colors.get(id);
    if (!current) {
      this._colors.set(id, target);
      return target;
    }

    // Smooth transition
    const k = 0.05; 
    const r = current[0] + (target[0] - current[0]) * k;
    const g = current[1] + (target[1] - current[1]) * k;
    const b = current[2] + (target[2] - current[2]) * k;

    const nextColor = [r, g, b];
    this._colors.set(id, nextColor);
    
    return nextColor;
  }

  _updateMotion(state, data) {
    const d1 = Number(data?.dNW ?? data?.d1 ?? 0);
    const d2 = Number(data?.dNE ?? data?.d2 ?? 0);
    const d3 = Number(data?.dSE ?? data?.d3 ?? 0);
    const d4 = Number(data?.dSW ?? data?.d4 ?? 0);

    const dxRaw = (d2 + d3) - (d1 + d4);
    const dyRaw = (d4 + d3) - (d1 + d2);

    const ax = constrain(dxRaw / 255, -1, 1) * 1.0;
    const ay = constrain(dyRaw / 255, -1, 1) * 1.0;

    state.vx = (state.vx + ax) * 0.90;
    state.vy = (state.vy + ay) * 0.90;

    state.x += state.vx;
    state.y += state.vy;
    this._clampState(state);
  }

  _clampState(state) {
    const r = this.deviceRadius;
    state.x = constrain(state.x, r, width - r);
    state.y = constrain(state.y, r, height - r);
  }

  _separateOverlaps(states) {
    const r = this.deviceRadius;
    const minDist = r * 2;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
          const a = states[i];
          const b = states[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist === 0) dist = 0.001;
          if (dist < minDist) {
            const overlap = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            this._clampState(a);
            this._clampState(b);
          }
        }
      }
    }
  }

  _drawFace(state, faceColor) {
    const r = this.deviceRadius;
    stroke(0);
    strokeWeight(2);
    fill(faceColor[0], faceColor[1], faceColor[2]);
    circle(state.x, state.y, r * 2);

    // Eyes
    const eyeOffsetX = r * 0.35;
    const eyeOffsetY = r * 0.22;
    const eyeSize = r * 0.16;
    fill(0);
    noStroke();
    circle(state.x - eyeOffsetX, state.y - eyeOffsetY, eyeSize);
    circle(state.x + eyeOffsetX, state.y - eyeOffsetY, eyeSize);

    // Mouth
    stroke(0);
    strokeWeight(3);
    line(state.x - r * 0.45, state.y + r * 0.28, state.x + r * 0.45, state.y + r * 0.28);
  }

  _rgbToHex([r, g, b]) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
    return [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  }
}
