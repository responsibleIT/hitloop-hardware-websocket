class Flower extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    this.deviceRadius = 40;
    this._state = new Map(); // id -> {x, y, vx, vy}
    this._colors = new Map();
    this._lastLedHex = new Map();
    
    // Flower state
    this.flowerT = 0;
    
    // Fixed Flower Positions
    // Will be set in setup/draw based on width/height
    this.flowerPositions = [];
    
    // Target colors
    this.colorBlue = [0, 0, 255];
    this.colorRed = [255, 0, 0];
  }

  setup() {
    this.flowerT = 0;
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
    
    // Initialize fixed positions (updated in draw for responsiveness)
    this._updateFlowerPositions();
  }
  
  _updateFlowerPositions() {
      // 4 flowers: 2 Left, 2 Right
      const qW = width / 4;
      const hH = height / 3;
      
      this.flowerPositions = [
          // Left Group (controlled by d1+d2)
          { x: qW, y: hH, group: 'left' },
          { x: qW, y: hH * 2, group: 'left' },
          
          // Right Group (controlled by d3+d4)
          { x: width - qW, y: hH, group: 'right' },
          { x: width - qW, y: hH * 2, group: 'right' }
      ];
  }

  draw() {
    this._updateFlowerPositions(); // Handle resize dynamically
    
    // 1. Device Management & Grouping
    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();
    const renderList = [];
    
    let leftGroupActivity = 0;
    let rightGroupActivity = 0;
    let leftCount = 0;
    let rightCount = 0;

    // Process devices
    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data); // Keep physics for device movement on screen

      // Determine Group based on signal strength
      // d1, d2 -> Left
      // d3, d4 -> Right
      const d1 = Number(data?.dNW ?? data?.d1 ?? 0);
      const d2 = Number(data?.dNE ?? data?.d2 ?? 0);
      const d3 = Number(data?.dSE ?? data?.d3 ?? 0);
      const d4 = Number(data?.dSW ?? data?.d4 ?? 0);
      
      const scoreLeft = d1 + d2;
      const scoreRight = d3 + d4;
      
      let targetColor;
      let group = '';
      
      // Default to the stronger signal side, or random if 0
      if (scoreLeft >= scoreRight) {
          group = 'left';
          targetColor = this.colorBlue;
          leftCount++;
          // Activity based on signal strength (0-510)
          leftGroupActivity += scoreLeft; 
      } else {
          group = 'right';
          targetColor = this.colorRed;
          rightCount++;
          rightGroupActivity += scoreRight;
      }

      // Smooth color transition for device LED/Fill
      const col = this._getSmoothedColor(id, targetColor);
      renderList.push({ state, col, id, group });
    }
    
    // Normalize activity (0.0 to 1.0 approx)
    // Max signal sum per device is 255*2 = 510.
    const leftIntensity = leftCount > 0 ? constrain(leftGroupActivity / (leftCount * 255), 0, 2) : 0;
    const rightIntensity = rightCount > 0 ? constrain(rightGroupActivity / (rightCount * 255), 0, 2) : 0;

    // 2. Draw Background & Flowers
    noStroke();
    fill(0, 20); // Dark background with alpha for trails
    rect(0, 0, width, height);

    this.flowerT++;

    for (const flower of this.flowerPositions) {
        let intensity = 0;
        let baseHue = 0;
        
        if (flower.group === 'left') {
            intensity = leftIntensity;
            baseHue = 240; // Blue
        } else {
            intensity = rightIntensity;
            baseHue = 360; // Red (0 or 360)
        }
        
        // Always draw flower, but maybe size/speed depends on intensity?
        // User said "they can control the two flowers". 
        // If no one controls (intensity 0), maybe it sleeps or moves slow.
        // Let's keep it alive but use intensity for visual flair.
        
        // Pass intensity to modify the flower
        this._drawFlowerPattern(flower.x, flower.y, baseHue, intensity);
    }

    // 3. Render Devices (Overlay)
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

  _drawFlowerPattern(cx, cy, baseHue, intensity) {
    push();
    colorMode(HSB);
    noStroke();
    
    // If intensity is high, flower moves faster or is bigger/brighter?
    // Let's use intensity to modulate speed 't' or size.
    
    const W = 720;
    // Speed factor: default 1, up to 2x with intensity
    // We use global flowerT, but maybe we add an offset or scale.
    // For noise continuity we should use continuous time. 
    // We can just modulate the visual parameters.
    
    const t = this.flowerT;
    let F = 0.5; 
    
    translate(cx, cy);
    
    // Scale flower based on intensity?
    // base scale 0.8 + intensity * 0.4
    const scaleFactor = 0.5 + (intensity * 0.3); 
    scale(scaleFactor);

    // Adapted loop
    for (let r = 0; r < TAU; r += PI / 16) {
        let X = 0; 
        let Y = 0; 
        F++; 
        
        for (let d = 0; d < 180; d++) {
             // Color Logic
             // Original: fill(360-d*2, d, W) -> Rainbow
             // New: fixed hue range.
             // Vary saturation/brightness with 'd' to keep texture.
             
             // baseHue is 240 (Blue) or 360 (Red)
             // Let's allow some variation around baseHue
             // e.g. baseHue + (d/10) to create gradient
             
             const h = (baseHue + (d * 0.2)) % 360;
             const s = Math.min(d + 50, 100); // Saturation
             const b = 100; // Brightness
             
             fill(h, s, b); 
             
             // Noise calculation
             let noiseVal = noise(d / 99 - t / 99);
             let A = t / W + r + ((F % 8) - 4) * (noiseVal - 0.5) * d * d / W / 4;
             
             // Intensity influence on spread?
             // Maybe 'A' is affected by intensity to make it more chaotic?
             // For now just kept standard motion.
             
             X += cos(A) * 2;
             Y += sin(A) * 2;
             
             circle(X, Y, 5 - d / 45);
        }
    }
    pop();
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

  _getSmoothedColor(id, target) {
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
    // Keep device physics independent of flower control for movement on screen
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
          let distVal = Math.hypot(dx, dy);
          if (distVal === 0) distVal = 0.001;
          if (distVal < minDist) {
            const overlap = (minDist - distVal) * 0.5;
            const nx = dx / distVal;
            const ny = dy / distVal;
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
