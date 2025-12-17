class HeatMap extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    this.t = 0;
    
    // Device state management
    this.deviceRadius = 40;
    this._state = new Map(); // id -> {x, y, vx, vy}
    
    // 4-Color Palette (HSB) - Cold to Hot
    this.palette = [
      [220, 80, 90], // Blue
      [160, 80, 90], // Teal/Green
      [40, 90, 100], // Orange/Yellow
      [0, 95, 100]   // Red
    ];
  }

  setup() {
    this.t = 0;
    colorMode(HSB);
    this._state.clear();
  }

  teardown() {
    colorMode(RGB); // Reset to default
  }

  // --- DEVICE TRACKING HELPERS (Same as ControlTheBall) ---
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

  _clampState(state) {
    const r = this.deviceRadius;
    state.x = constrain(state.x, r, width - r);
    state.y = constrain(state.y, r, height - r);
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

  draw() {
    // 1. Update Device Positions
    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();
    const activeStates = [];

    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data);
      activeStates.push(state);
    }

    // Cleanup missing
    for (const key of [...this._state.keys()]) {
      if (!present.has(key)) this._state.delete(key);
    }

    // 2. Draw Heatmap Pattern
    // Adapted from: t=0;draw=_=>{t||createCanvas(W=720,W);t+=.01;colorMode(HSB);background(255,.03);noStroke();for(y=0;y<740;y+=14)for(x=-(y/14%2*9);x<740;x+=18)fill(noise(x/W,y/W,t)*720%360,85,99-((N=noise(x/99,y/99+t,t*noise(x/W,y/W,t)*2))<.5?N*200:99))+circle(x,y,N*40)}
    
    this.t += 0.01;
    let W = 720; // Scale factor from original code
    
    // HSB Background: (Hue, Sat, Bri, Alpha). 
    // original: background(255, .03) -> In standard p5 HSB(360,100,100,1), 255 is clamped to 100? 
    // Or did original code not set ranges? p5 defaults are 360, 100, 100, 1.
    // background(255, 0.03) -> White with very low alpha.
    background(0, 0, 0, 0.1); // Black fade in HSB

    noStroke();

    // Iterate over the canvas
    // Using larger bounds to cover full screen if needed
    for (let y = 0; y < height + 20; y += 14) {
      // Hexagonal offset: -(y/14%2*9)
      let xStart = -( (y/14)%2 * 9 ); 
      
      for (let x = xStart; x < width + 20; x += 18) {
        
        // --- Calculate Influence from Devices ---
        let density = 0;
        for (let s of activeStates) {
          let d = dist(x, y, s.x, s.y);
          // Influence radius
          if (d < 250) {
            // Linear falloff 1 -> 0
            density += map(d, 0, 250, 1, 0, true);
          }
        }
        // Cap density
        density = Math.min(density, 1.0); 

        // --- Original Noise Logic with Modifications ---
        // We modify the threshold and color based on density to create "Heatmap" effect
        
        // Base threshold from original code is roughly 0.5 (N < .5)
        // We increase threshold with density to show MORE dots (more dense)
        let threshold = 0.5 + (density * 0.4); // Ranges 0.5 -> 0.9

        let noiseHue = noise(x/W, y/W, this.t);
        let nZ = this.t * noise(x/W, y/W, this.t) * 2;
        let N = noise(x/99, y/99 + this.t, nZ);

        // If N is below threshold, we draw
        if (N < threshold) {
             let baseHue = (noiseHue * 720) % 360;
             
             // Color Blending
             // Low density: Rainbow noise (baseHue)
             // High density: Red/Orange (Heatmap style)
             // Target Hue: 0 (Red) or maybe 15 (Orange-Red)
             let targetHue = 0; 
             
             // No transition, just hard switch if density is high
             let finalHue = (density > 0.5) ? targetHue : baseHue;
             let finalSat = (density > 0.5) ? 100 : 85;
             
             // Brightness
             // Original: 99 - N*200. Since N can be up to 0.9 now, this could be negative.
             // Let's adjust brightness logic to keep it visible.
             // We map N relative to threshold to keep consistent contrast?
             // Or just make "hot" areas brighter.
             let normN = N / threshold; // 0..1
             let finalBri = map(normN, 0, 1, 100, 50);
             
             // Size
             // Original: N * 40
             // Hot areas -> Larger dots?
             let sizeMult = 1.0 + density; // Up to 2x size
             
             fill(finalHue, finalSat, finalBri);
             circle(x, y, N * 40 * sizeMult);
        }
      }
    }
  }
}

