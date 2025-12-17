class Fountain extends Scene {
    constructor(deviceManager) {
      super(deviceManager);
      this.t = 0;
      this.particles = [];
      this.fountainLayer = null;
      // We'll manage the particle buffer manually to match the ring buffer logic
      this.P = new Array(5000); 
      this.t_counter = 0; // Separate counter for the logic
      
      // Device state for circles
      this.deviceRadius = 40;
      this._state = new Map();
      this._colors = new Map();
      this._lastLedHex = new Map();
      this.colors = {
        UP: [255, 255, 255],    // White
        RIGHT: [255, 0, 0],     // Red
        DOWN: [0, 0, 255],      // Blue
        LEFT: [0, 255, 0]       // Green
      };
    }
  
    setup() {
      this.t = 0;
      this.t_counter = 0;
      this.P = new Array(5000); 
      this._state.clear();
      this._colors.clear();
      this._lastLedHex.clear();
      
      this.fountainLayer = createGraphics(width, height);
      this.fountainLayer.background(0);
    }
  
    draw() {
      if (!this.fountainLayer || this.fountainLayer.width !== width || this.fountainLayer.height !== height) {
          this.fountainLayer = createGraphics(width, height);
          this.fountainLayer.background(0);
      }
      
      // --- 1. Draw Fountains to Layer ---
      this.fountainLayer.push();
      this.fountainLayer.noStroke();
      this.fountainLayer.fill(0, 9); 
      this.fountainLayer.rect(0, 0, width, height);
      
      this.fountainLayer.strokeWeight(1);
      
      try {
         this.fountainLayer.filter(BLUR, 3);
      } catch(e) {}
      
      const W = 720; 
      const N = noise;
      const scaleX = width / 720;
      const scaleY = height / 720;
      
      // --- Calculate Collective Color Distribution ---
      // Map user colors to RGB buckets or maintain a list of active colors
      const userColors = [];
      for (const col of this._colors.values()) {
          userColors.push(col);
      }
      
      // Default to white if no users
      if (userColors.length === 0) {
          userColors.push([255, 255, 255]);
      }
      
      // Assign colors to fountains based on distribution
      // We have 10 fountains (T=1..10).
      // If we have N users, we map the user list to the 10 fountains.
      // E.g. 50% blue, 50% red -> first 5 blue, last 5 red? 
      // Or interleaved? "5 fountains with blue water and 5 with red water" implies grouping.
      // Let's sort colors to group them visually.
      // Sorting arrays of [r,g,b] is tricky, let's just sort by sum or hue?
      userColors.sort((a, b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2])); 
      
      const fountainColors = [];
      for(let i=0; i<10; i++) {
          // Map range 0..9 to 0..userColors.length
          let index = Math.floor(i * userColors.length / 10);
          fountainColors[i] = userColors[index];
      }
      
      // Sequential Splash Logic
      const cycleSpeed = 20;
      let activeFountain = Math.floor(this.t / cycleSpeed) % 10 + 1;
      let count = 29;
      
      for(let i = count; i > 0; i--) {
          let idx = this.t_counter % 5000;
          this.t_counter++;
          
          let t_val = this.t_counter; 
          let T = activeFountain;
          
          // Store color for this particle!
          // We need to extend the particle object to store color
          // We can't easily change the P structure if it's reused, 
          // but we redraw every frame from P. 
          // Wait, P is a buffer. If we change color of active fountain NOW, 
          // old particles in buffer from previous fountains retain their old drawing color?
          // No, the drawing loop below sets stroke ONCE for the layer.
          // The requested effect "water will be blue" implies per-particle or per-fountain color.
          // To support multi-colored fountains simultaneously, we must store color in P.
          
          let col = fountainColors[T-1];
          
          let S = t_val / 2000.0;
          let term1 = N(S, T) * 5;
          let term2 = random(1);
          let R = 1.7 + term1 + term2;
          
          let noiseCheck = 9; 
          let b_val = (Math.sin(R) * 4 - N(S, T, 9) * noiseCheck) * 1.3;
          
          if (b_val > -5) b_val -= 5; 
          
          this.P[idx] = {
              x: T * (720 / 11),
              y: W,
              a: Math.cos(R),
              b: b_val,
              c: col // Store color [r,g,b]
          };
      }
      
      for(let k = 0; k < this.P.length; k++) {
          let e = this.P[k];
          if (!e) continue;
          
          e.b += 0.1;
          e.x += e.a;
          e.y += e.b;
          
          let sx = e.x * scaleX;
          let sy = e.y * scaleY;
          
          // Set stroke color per particle
          let c = e.c || [255, 255, 255];
          this.fountainLayer.stroke(c[0], c[1], c[2]);
          this.fountainLayer.point(sx, sy);
      }
      
      this.fountainLayer.pop();
      image(this.fountainLayer, 0, 0);
      
      // --- 2. Draw Participants (Circles) ---
      // Copied logic from InkColor.js
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
      }

      this._separateOverlaps(renderList.map((r) => r.state));

      for (const { state, col, id } of renderList) {
        this._drawFace(state, col);
        
        // Update device LED color
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
      
      this.t++;
    }

    // --- HELPER METHODS (Copied from InkColor.js) ---

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
      // Use sensors for movement as well
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
