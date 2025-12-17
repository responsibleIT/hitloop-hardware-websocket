class ControlTheBall extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    this.t = 0;
    this.P = [];
    
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
  }

  setup() {
    this.t = 0;
    this.P = [];
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
  }

  draw() {
    // 1. Calculate Ball Color based on devices
    // We'll use the average color of all active devices
    let avgR = 0, avgG = 0, avgB = 0;
    let count = 0;

    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();
    const renderList = [];

    // Process devices to update physics and get their colors
    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data);

      const col = this._getColor(state, id);
      renderList.push({ state, col, id });

      avgR += col[0];
      avgG += col[1];
      avgB += col[2];
      count++;
    }

    // Default to white if no devices
    let ballColor = [255, 255, 255];
    if (count > 0) {
      ballColor = [avgR / count, avgG / count, avgB / count];
    }

    // 2. Draw Ball Animation
    // background(0, 9); // Fade effect
    noStroke();
    fill(0, 9);
    rect(0, 0, width, height);

    // Ball Logic Adapted
    // Original: stroke(W, 20) -> White with alpha
    // We use ballColor with low alpha (approx 20/255 ~ 0.08)
    stroke(ballColor[0], ballColor[1], ballColor[2], 20);
    strokeWeight(1);

    // Spawn particles
    // The original code: for(i=99;i--;)P.push({x:360,y:360,r:t++/9,l:99})
    // It spawns 99 particles per frame? Let's reduce it if it's too heavy, but try to match.
    // Also center is 360,360. We use center of screen.
    const cx = width / 2;
    const cy = height / 2;
    const W = 720; // Keeping the scale factor for noise consistent

    for (let i = 0; i < 50; i++) { // Reduced count slightly for performance, original was 99
      this.P.push({
        x: cx,
        y: cy,
        r: (this.t++) / 9,
        l: 99 // life
      });
    }

    // Update and Draw Particles
    // P=P.filter(e=>e.l--)
    this.P = this.P.filter(e => {
      e.l--;
      return e.l > 0;
    });

    if (this.P.length > 0) {
      // Chain drawing
      // X=P[0].x,Y=P[0].y
      let X = this.P[0].x;
      let Y = this.P[0].y;

      // P.forEach(e=>line(X,Y,X=(e.x+=cos(e.r)*(D=(noise(X/99,Y/99,t/W)**4*25+1))),Y=(e.y+=sin(e.r)*D)))
      for (let e of this.P) {
        // Update position
        // D=(noise(X/99,Y/99,t/W)**4*25+1)
        // Note: 't' in original was global incrementing. 'this.t' is already incremented in spawn loop.
        // But for noise we might want a slower changing value or just use this.t
        // In original t is incremented 99 times per frame.
        // Let's use the particle's own 'r' or global 'this.t'? 
        // Original: t/W in noise. t is incremented in the spawn loop. 
        // So t grows very fast.
        
        // Wait, in original code: r: t++/9. t is used for initial angle.
        // And noise uses t/W. 
        // We need to match that 't' is effectively the total particle count spawned so far.
        
        const noiseScale = 99;
        const noiseVal = noise(X / noiseScale, Y / noiseScale, this.t / W);
        const D = Math.pow(noiseVal, 4) * 25 + 1;
        
        const nextX = e.x + cos(e.r) * D;
        const nextY = e.y + sin(e.r) * D;
        
        line(X, Y, nextX, nextY);
        
        e.x = nextX;
        e.y = nextY;
        
        X = nextX;
        Y = nextY;
      }
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

  _getColor(state, id) {
    // Determine target color based on position (quadrants)
    // NW: Blue, NE: Red, SE: Green, SW: Orange
    
    // Simple quadrant check
    const isLeft = state.x < width / 2;
    const isTop = state.y < height / 2;

    let target;
    if (isTop && isLeft) target = this.colors.NW;      // NW
    else if (isTop && !isLeft) target = this.colors.NE; // NE
    else if (!isTop && !isLeft) target = this.colors.SE; // SE
    else target = this.colors.SW;                        // SW

    // Transition Logic
    if (!this._colors.has(id)) {
      this._colors.set(id, target);
      return target;
    }

    const nextColor = target;
    this._colors.set(id, nextColor);
    
    return nextColor;
  }

  _updateMotion(state, data) {
    // Move based on four beacons: d1=dNW, d2=dNE, d3=dSE, d4=dSW
    // Copied from MusicVisualizer
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

