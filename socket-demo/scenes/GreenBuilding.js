class GreenBuilding extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    this.t = 0;
    
    // Progress for 4 walls
    this.progress = {
      NW: 0,
      NE: 0,
      SE: 0,
      SW: 0
    };
    
    // Device state
    this.deviceRadius = 40;
    this._state = new Map();
    this._colors = new Map();
    this._lastLedHex = new Map();
    this._tapHandled = new Map();

    // Zone Config
    this.zones = {
      NW: { col: [0, 0, 255],    name: 'Blue',   xRange: [0, 0.5], yRange: [0, 0.5] }, // Top-Left
      NE: { col: [255, 0, 0],    name: 'Red',    xRange: [0.5, 1], yRange: [0, 0.5] }, // Top-Right
      SE: { col: [0, 255, 0],    name: 'Green',  xRange: [0.5, 1], yRange: [0.5, 1] }, // Bottom-Right
      SW: { col: [255, 165, 0],  name: 'Orange', xRange: [0, 0.5], yRange: [0.5, 1] }  // Bottom-Left
    };
  }

  setup() {
    this.t = 0;
    this.progress = { NW: 0, NE: 0, SE: 0, SW: 0 };
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
    this._tapHandled.clear();
  }

  draw() {
    // 1. Update Devices & Tap Detection
    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();
    const renderList = [];

    // Track taps per zone
    let taps = { NW: 0, NE: 0, SE: 0, SW: 0 };

    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data);
      
      // DETERMINE ZONE
      let zoneKey = 'NW';
      let xPct = state.x / width;
      let yPct = state.y / height;
      
      if (xPct < 0.5 && yPct < 0.5) zoneKey = 'NW';
      else if (xPct >= 0.5 && yPct < 0.5) zoneKey = 'NE';
      else if (xPct >= 0.5 && yPct >= 0.5) zoneKey = 'SE';
      else zoneKey = 'SW';
      
      // Get Color
      const zone = this.zones[zoneKey];
      const col = zone.col;
      
      renderList.push({ state, col, id });

      // LED UPDATE (Zone Color)
      const hex = this._rgbToHex(col);
      const last = this._lastLedHex.get(id);
      if (hex !== last) {
        try {
          this.deviceManager.sendCommandToDevice?.(id, 'led', hex);
          this._lastLedHex.set(id, hex);
        } catch (_) {}
      }

      // TAP DETECTION
      const isTap = !!(data && data.tap);
      const wasHandled = this._tapHandled.get(id) || false;

      if (isTap && !wasHandled) {
         taps[zoneKey]++;
         this._tapHandled.set(id, true);
         
         // Flash White on tap? Or just stay zone color?
         // User said "assign colors to ... controllers when they enter that zone"
         // I'll keep it simple: keep zone color. Maybe bump brightness if we could.
         
      } else if (!isTap && wasHandled) {
         this._tapHandled.set(id, false);
      }
    }

    // Update Progress per Wall
    for (let k in taps) {
        if (taps[k] > 0) {
            this.progress[k] += 0.05 * taps[k];
            this.progress[k] = Math.min(this.progress[k], 1.0);
        }
    }

    // 2. Draw Effect (4 Walls)
    
    this.t += 0.01;
    let W = 720;
    let N = noise;
    
    // Background
    noStroke();
    fill(0, 9);
    rect(0, 0, width, height);

    // Draw each wall in its quadrant
    // We'll center the wall in the quadrant horizontally.
    // It grows from bottom of the screen? Or bottom of the quadrant?
    // "create a building... 4 walls"
    // Usually buildings stand on the ground. Let's make them all grow from the bottom of the screen (height),
    // but positioned horizontally in their respective columns.
    // Wait, quadrants are NW/SW (Left) and NE/SE (Right).
    // If we have NW and SW, and both grow from bottom, they overlap?
    // Maybe NW grows from middle? Or SW grows from bottom, NW grows from top?
    // "Every quarter... has blue... build that wall"
    // Let's place them in the center of their quadrants.
    // NW/NE grow from vertical center? Or ceiling?
    // Simpler visual: 4 vertical strips side-by-side?
    // "every quarter... NW has blue" implies 2D layout.
    // Let's draw them in their actual 2D quadrants.
    // SW/SE grow from bottom (y=height) up to middle (y=height/2).
    // NW/NE grow from middle (y=height/2) up to top (y=0)? Or from middle down?
    // Let's have them all grow UPWARDS from the bottom of their respective quadrant box.
    
    // NW box: 0,0 to w/2, h/2. Ground is h/2. Grows up to 0.
    // SW box: 0, h/2 to w/2, h. Ground is h. Grows up to h/2.
    // NE box: w/2, 0 to w, h/2. Ground is h/2. Grows up to 0.
    // SE box: w/2, h/2 to w, h. Ground is h. Grows up to h/2.
    
    const zoneKeys = ['NW', 'NE', 'SW', 'SE'];
    
    for (let key of zoneKeys) {
        let prog = this.progress[key];
        let zone = this.zones[key];
        let zCol = zone.col;
        
        // Define Bounds
        let rangeX = zone.xRange; // e.g. [0, 0.5]
        let rangeY = zone.yRange; // e.g. [0, 0.5] for NW (Top)
        
        let areaX = width * rangeX[0];
        let areaW = width * (rangeX[1] - rangeX[0]);
        let areaY = height * rangeY[0];
        let areaH = height * (rangeY[1] - rangeY[0]);
        
        // Building Base/Ground
        // If it's top row (NW, NE), base is areaY + areaH (the middle line).
        // If it's bottom row (SW, SE), base is areaY + areaH (the bottom line).
        let groundY = areaY + areaH;
        
        // Max height of building is the full height of the quadrant
        let currentH = areaH * prog;
        
        // Drawing bounds
        // Wall width: Full quadrant width to "fit the screen" exactly
        let wallW = areaW;
        let wallX = areaX;
        
        // Align to grid
        wallX = Math.floor(wallX / 9) * 9;
        let wallEndX = wallX + wallW;
        
        let startY = groundY - currentH;
        startY = Math.floor(startY / 9) * 9;
        
        // Loop
        for (let y = startY; y < groundY; y += 9) {
            for (let x = wallX; x < wallEndX; x += 9) {
                
                // Logic adapted
                // We shift x,y for noise to avoid identical patterns if symmetric
                let nx = x + (key === 'NE' || key === 'SE' ? 1000 : 0);
                let ny = y + (key === 'SW' || key === 'SE' ? 1000 : 0);

                let A = N(nx/99, ny/99, 9 + this.t/9) * 9;
                let R_val = N(nx/200 + cos(A), ny/200 + sin(A), this.t) * 9;
                let R = R_val;
                
                let alpha = Math.pow(R, 3) * 2;
                
                // Apply Zone Color with some noise variation
                // zCol is [r, g, b]
                // We mix it with noise brightness
                let bright = N(nx, ny) * 1.5 + 0.5; // 0.5 to 2.0
                
                let r = zCol[0] * bright;
                let g = zCol[1] * bright;
                let b = zCol[2] * bright;
                
                // Clamp
                r = Math.min(255, r);
                g = Math.min(255, g);
                b = Math.min(255, b);

                stroke(r, g, b, alpha);
                strokeWeight(2);
                
                let D = ((x/2 + y/2 + this.t*20) % 9) * 4;
                
                let px = x + cos(R) * D;
                let py = y + sin(R) * D;
                
                point(px, py);
            }
        }
    }

    // 3. Render Devices (Overlay)
    this._separateOverlaps(renderList.map((r) => r.state));

    for (const { state, col, id } of renderList) {
      this._drawFace(state, col);
    }

    // Cleanup
    for (const key of [...this._state.keys()]) {
      if (!present.has(key)) this._state.delete(key);
    }
  }

  // --- HELPERS ---
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

  _rgbToHex([r, g, b]) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
    return [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  }
}
