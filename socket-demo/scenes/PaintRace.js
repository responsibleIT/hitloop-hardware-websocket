class PaintRace extends Scene {
    constructor(deviceManager) {
      super(deviceManager);
      this.t = 0;
      this.particles = [];
      
      // Device state management
      this.deviceRadius = 40;
      this._state = new Map(); // id -> {x, y, vx, vy}
      this._colors = new Map();
      this._lastLedHex = new Map();
      
      // Target colors for tilt directions
      this.colors = {
        UP: [255, 255, 255],    // White
        RIGHT: [255, 0, 0],     // Red
        DOWN: [0, 0, 255],      // Blue
        LEFT: [0, 255, 0]       // Green
      };
      
      this.inkLayer = null;
    }
  
    setup() {
      this.t = 0;
      this._state.clear();
      this._colors.clear();
      this._lastLedHex.clear();
      
      // Create off-screen graphics buffer for paint
      this.inkLayer = createGraphics(width, height);
      this.inkLayer.colorMode(RGB);
      this.inkLayer.background(0); 
    }
  
    draw() {
      if (!this.inkLayer || this.inkLayer.width !== width || this.inkLayer.height !== height) {
          this.inkLayer = createGraphics(width, height);
          this.inkLayer.background(0);
      }
      
      this.t++;
      
      // --- 1. Draw to Paint Layer ---
      this.inkLayer.push();
      
      // Apply the feedback effect (smear/shift down)
      this.inkLayer.copy(this.inkLayer, 0, 0, width, height, 0, 1, width, height);
      
      try {
         this.inkLayer.filter(BLUR, 1);
      } catch(e) {}
      
      this.inkLayer.noStroke();
      
      // Manage Devices and Draw Paint
      const devices = [...this.deviceManager.getAllDevices().values()];
      const present = new Set();
      const renderList = [];
  
      for (const dev of devices) {
        const data = dev.getSensorData?.() ?? {};
        const id = data.id ?? dev.id ?? dev;
        present.add(id);
  
        const state = this._getState(id);
        const tilt = this._getTilt(data);
        
        this._updateMotion(state, data);
        const col = this._getColor(state, id, tilt);
        renderList.push({ state, col, id });
        
        // Draw Paint at device position with "Texture"
        this.inkLayer.fill(col[0], col[1], col[2]);
        
        // Use a consistent pseudo-random seed per device for the "i" variation
        // But we want the "texture" to be rich, so we iterate `i` locally
        // like the snippet does globally.
        // To mimic the snippet's look, we need multiple overlapping arcs per frame.
        
        const numShapes = 10; // Increase count for richer texture
        
        // Unique numeric seed from ID
        const idVal = (id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % 100;

        for (let k = 0; k < numShapes; k++) {
            // "i" in the snippet is the loop index (0..38).
            // We'll map k to a range that gives good variation.
            // Offset i by idVal so users have different "brush signatures"
            let i = k * 3 + idVal; 
            
            // Formula from snippet:
            // S = 30 * sin(A=t/99+i)**2 + 3
            // A = t/99 + i
            // start = A * i/4 * (i%2*2-1)
            // stop = start + i/9
            
            let A = this.t / 99.0 + i;
            let S = 30 * Math.sin(A) ** 2 + 3;
            
            // Recalculate A for rotation as per snippet logic?
            // Snippet: A=A*i/4*(i%2*2-1)
            let rotationA = A * i / 4.0 * (i % 2 * 2 - 1);
            
            let start = rotationA;
            let stop = rotationA + i / 9.0;
            
            // Position in snippet: noise(t/W, i, 9)*W
            // Here: user position + noise offset
            // We use noise based on t and i to create the "jitter" texture
            let ox = (noise(this.t * 0.01, i, 100) - 0.5) * 60; // Spread out a bit
            let oy = (noise(this.t * 0.01, i, 200) - 0.5) * 60;
            
            this.inkLayer.arc(state.x + ox, state.y + oy, S, S, start, stop, CHORD);
        }
      }
      
      this.inkLayer.pop();
      
      // --- 2. Draw to Main Canvas ---
      image(this.inkLayer, 0, 0);
      
      // Draw Devices on top
      this._separateOverlaps(renderList.map((r) => r.state));
  
      for (const { state, col, id } of renderList) {
        this._drawFace(state, col);
  
        const hex = this._rgbToHex(col);
        const last = this._lastLedHex.get(id);
        if (hex !== last) {
          try {
            this.deviceManager.sendCommandToDevice?.(id, 'led', hex);
            this._lastLedHex.set(id, hex);
          } catch (_) {}
        }
      }
  
      // Cleanup
      for (const key of [...this._state.keys()]) {
        if (!present.has(key)) this._state.delete(key);
      }
      for (const key of [...this._colors.keys()]) {
        if (!present.has(key)) this._colors.delete(key);
      }
    }
  
    // --- HELPER METHODS ---
  
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
  
    _getTilt(data) {
      if (data.ax !== undefined || data.aX !== undefined || data.accX !== undefined) {
          const rawX = Number(data.ax ?? data.aX ?? data.accX ?? 128);
          const rawY = Number(data.ay ?? data.aY ?? data.accY ?? 128);
          let ax, ay;
          if (Math.abs(rawX) > 2 || Math.abs(rawY) > 2) {
              ax = (rawX / 255.0) * 4.0 - 2.0;
              ay = (rawY / 255.0) * 4.0 - 2.0;
          } else {
              ax = rawX;
              ay = rawY;
          }
          return { ax: constrain(ax, -1, 1), ay: constrain(ay, -1, 1) };
      }
      const d1 = Number(data?.dNW ?? data?.d1 ?? 0);
      const d2 = Number(data?.dNE ?? data?.d2 ?? 0);
      const d3 = Number(data?.dSE ?? data?.d3 ?? 0);
      const d4 = Number(data?.dSW ?? data?.d4 ?? 0);
      if (d1 || d2 || d3 || d4) {
          const dxRaw = (d2 + d3) - (d1 + d4);
          const dyRaw = (d4 + d3) - (d1 + d2);
          const ax = constrain(dxRaw / 255, -1, 1) * 1.0;
          const ay = constrain(dyRaw / 255, -1, 1) * 1.0;
          return { ax, ay };
      }
      return { ax: 0, ay: 0 };
    }
  
    _getColor(state, id, tilt) {
      let target = this.colors.UP;
      const { ax, ay } = tilt;
      if (Math.abs(ax) > Math.abs(ay)) {
         target = ax > 0 ? this.colors.RIGHT : this.colors.LEFT;
      } else {
         target = ay > 0 ? this.colors.DOWN : this.colors.UP;
      }
      const current = this._colors.get(id);
      if (!current) {
        this._colors.set(id, target);
        return target;
      }
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
      const eyeOffsetX = r * 0.35;
      const eyeOffsetY = r * 0.22;
      const eyeSize = r * 0.16;
      fill(0);
      noStroke();
      circle(state.x - eyeOffsetX, state.y - eyeOffsetY, eyeSize);
      circle(state.x + eyeOffsetX, state.y - eyeOffsetY, eyeSize);
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