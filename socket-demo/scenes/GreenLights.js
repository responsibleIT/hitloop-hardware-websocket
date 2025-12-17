class GreenLights extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    this.t = 0;
    this.P = [];
    
    // Device state management
    this.deviceRadius = 40;
    this._state = new Map(); // id -> {x, y, vx, vy}
    this._colors = new Map();
    this._lastLedHex = new Map();
  }

  setup() {
    this.t = 0;
    this.P = [];
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
  }

  draw() {
    // 1. Update Devices
    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();
    const renderList = [];

    // Process devices to update physics and get their positions
    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data);

      // Color logic: Always Green for this scene?
      // Or we reuse the color logic? User said "get the circles back from ControlTheBall"
      // But didn't specify color logic. Let's keep it simple or green.
      // The Scene is called "GreenLights". Let's default to Green.
      const col = [0, 255, 0]; 
      renderList.push({ state, col, id });
    }

    // 2. Draw Effect
    // t=0;P=[];draw=_=>{t++||createCanvas(W=720,W);B=blendMode;B(BLEND);filter(BLUR,9);background(0,9);B(ADD);R=random;P[t%W]={x:R(W),y:R(W),s:3};P.forEach(e=>fill(99,W,99,sin(e.s*2)*W)+circle(e.x+=cos(N=noise(e.x/99,e.y/99)*9)*(e.s*=.98),e.y+=sin(N)*e.s,9*e.s+5))}

    this.t++;
    let W = 720; 

    // EXACT EFFECT REPLICATION
    blendMode(BLEND);
    
    // The original code uses filter(BLUR,9) which is key for the trail effect
    // It blurs the previous frame before drawing background with low alpha
    filter(BLUR, 3); // Reduced from 9 for performance, but necessary for look
    
    background(0, 9); // Fade trail
    
    blendMode(ADD);

    // --- Spawn Logic ---
    // Original: P[t%W]={x:R(W),y:R(W),s:3} -> Spawns 1 particle/frame
    // We add our proximity logic ON TOP of this or instead of?
    // Let's spawn 1 random one just like original to keep background life
    
    // Use an index based on frameCount to overwrite old particles cyclically (ring buffer style)
    // The original code uses P[t%W] which limits array size to W (720) automatically.
    // Let's replicate that array structure behavior if possible or just push/splice.
    // To match "exact effect", let's spawn exactly like it but also add proximity bursts.
    
    let spawnCount = 1;
    
    // Proximity Boost & Person Spawning
    // We ONLY spawn where people are, or where they are close.
    // "create the lights only where are people and not everywhere"
    
    // 1. Spawn on individual people
    for (let r of renderList) {
        // Spawn chance per person per frame
        if (random() < 0.3) {
            this.P.push({
                x: r.state.x + random(-10, 10),
                y: r.state.y + random(-10, 10),
                s: 3
            });
        }
    }
    
    // 2. Proximity Boost (Extra spawn between close people)
    let closePairs = [];
    const threshold = 200; 
    
    for (let i = 0; i < renderList.length; i++) {
        for (let j = i + 1; j < renderList.length; j++) {
            let s1 = renderList[i].state;
            let s2 = renderList[j].state;
            let d = dist(s1.x, s1.y, s2.x, s2.y);
            if (d < threshold) {
                 let mx = (s1.x + s2.x) / 2;
                 let my = (s1.y + s2.y) / 2;
                 // More intense spawning for close pairs
                 this.P.push({x: mx + random(-10,10), y: my + random(-10,10), s: 3});
            }
        }
    }

    // REMOVED: Baseline random background spawning
    // The original code had random(width) spawning. We remove this to satisfy "not everywhere".

    // Update & Draw
    // Original: P.forEach(e=>fill(99,W,99,sin(e.s*2)*W)+circle(e.x+=cos(N=noise(e.x/99,e.y/99)*9)*(e.s*=.98),e.y+=sin(N)*e.s,9*e.s+5))
    // Note: W=720. 
    // fill(99, 720, 99, sin(e.s*2)*720) -> In default RGB (255 max), 720 clamps to 255.
    // So color is effectively (99, 255, 99) -> Light Green.
    // Alpha is sin(e.s*2)*720. e.s starts at 3. sin(6) is ~-0.2? Wait.
    // sin(radians)? p5 defaults to radians.
    // sin(6) ~ -0.27. Alpha negative?
    // Maybe original was degrees? Or just chaotic?
    // If it works in p5 editor it might be fine.
    // Let's assume standard p5 behavior. 
    // We will use the exact math.
    
    for (let i = this.P.length - 1; i >= 0; i--) {
        let e = this.P[i];
        
        let N = noise(e.x / 99, e.y / 99) * 9;
        
        // e.x += cos(N) * (e.s *= .98) 
        // Note the order: e.s is multiplied first, then used.
        e.s *= 0.98;
        e.x += cos(N) * e.s;
        e.y += sin(N) * e.s;
        
        // Drawing
        // fill(99, W, 99, sin(e.s*2)*W)
        // We use W=720 for color/alpha scale to match exactly
        let alpha = sin(e.s * 2) * 720;
        // Clamp for safety in our context, though p5 usually handles it
        // fill(99, 255, 99, alpha)
        
        fill(99, 255, 99, alpha);
        circle(e.x, e.y, 9 * e.s + 5);
        
        // Cleanup if too small/invisible
        if (e.s < 0.05) {
            this.P.splice(i, 1);
        }
    }
    
    // Reset Blend Mode for UI/Devices
    blendMode(BLEND);

    // 3. Render Devices (Overlay from ControlTheBall)
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
  }

  addParticle(x, y, s) {
      this.P.push({x, y, s});
      // Limit count
      if (this.P.length > 300) this.P.shift();
  }

  // --- HELPERS (Copied from ControlTheBall) ---
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

