class City extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    
    // Device state management
    this.deviceRadius = 40;
    this._state = new Map(); // id -> {x, y, vx, vy}
    
    // City Generation Data
    this.buildings = []; // Array of building objects
    this.W = 720; // Canvas size logic from original
    this.needsRedraw = true;
    this.graphics = null; // Store the static city
    
    // Store last LED color to avoid spamming
    this._lastLedHex = new Map();
  }

  setup() {
    this._state.clear();
    this.generateCity();
  }

  generateCity() {
    // Generate the static city structure ONCE or when resized
    // setup=_=>{createCanvas(W=720,W);background(0,0,A=60);R=random;for(i=0;i<9;i+=2)for(x=0;x<W;x+=S){fill(A+i*9)+rect(x,Y=R(360)+i*A,E=(S=R(90+i*9)+A)-R(S/4),H=W-Y);for(b=9;b<H;b+=9+i)for(a=9;a<E-9;a+=9+i)fill(C=(R(1)<.5?W:20),C,0)+rect(x+a,Y+b,4+i)}}
    
    this.buildings = [];
    let A = 60;
    let W = Math.max(width, height); // Cover screen
    // We might need to handle resize
    
    // Store building data so we can update window colors dynamically
    
    // Layers loop (i)
    for (let i = 0; i < 9; i += 2) {
      // X loop
      for (let x = 0; x < width; ) {
         // Building params
         let S = random(90 + i * 9) + A; // Step/Width (roughly)
         // Actually in loop x+=S happens after.
         
         let Y = random(height * 0.5) + i * A; 
         // Original: Y=R(360)+i*A. 360 is half of 720. So Y is roughly mid screen downwards.
         
         // S logic in original: E=(S=R(90+i*9)+A)-R(S/4). 
         // S is set first, then E (Actual Width) is S minus small amount.
         // Then x+=S is used for next iteration.
         
         let actualS = random(90 + i * 9) + A;
         let E = actualS - random(actualS / 4);
         let H = height - Y;
         
         let building = {
             x: x,
             y: Y,
             w: E,
             h: H,
             layer: i,
             windows: []
         };
         
         // Windows loop
         for (let b = 9; b < H; b += 9 + i) {
             for (let a = 9; a < E - 9; a += 9 + i) {
                 // Store window data
                 building.windows.push({
                     relX: a,
                     relY: b, // relative to building top-left Y
                     w: 4 + i,
                     h: 4 + i // implicitly square-ish from rect(x+a, Y+b, 4+i) ? 
                     // Wait, rect(x,y,w) ? p5 rect is x,y,w,h. original: rect(x+a,Y+b,4+i). 
                     // Missing height arg? If missing, it might be same as width?
                     // Or maybe original code uses rect(x,y,w,h). 
                     // In "rect(x+a,Y+b,4+i)", it has 3 args? 
                     // Ah, code golf usually implies rect(x,y,w,h) where h defaults? No.
                     // Original: rect(x+a,Y+b,4+i).
                     // Processing/p5.js rect takes 3 args? No.
                     // Maybe it was `rect(x+a,Y+b,4+i, 4+i)` but shortened? 
                     // Let's assume squares: w=4+i, h=4+i.
                 });
             }
         }
         
         this.buildings.push(building);
         x += actualS;
      }
    }
  }

  draw() {
    // 1. Update Devices
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

      // --- LED LOGIC ---
      // "just turn the lights of the controllers to white"
      // "just assign the color to the controller"
      const hex = "ffffff"; // White
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

    // 2. Draw City
    background(0, 0, 60); // Blue-ish dark background from original (0,0,60 RGB? No A=60. background(0,0,60))
    // background(0,0,60) -> Dark Blue?
    // Let's use RGB(0,0,60).
    
    noStroke();

    // Iterate buildings
    for (let bld of this.buildings) {
        // Draw Building Body
        // fill(A+i*9). A=60. Grayscale/Blueish?
        // Original: background(0,0,A). fill(A+i*9). 
        // If colorMode is default RGB, these are Greys.
        let A = 60;
        let colVal = A + bld.layer * 9;
        fill(colVal);
        rect(bld.x, bld.y, bld.w, bld.h);
        
        // Draw Windows
        for (let win of bld.windows) {
            let wx = bld.x + win.relX;
            let wy = bld.y + win.relY;
            
            // Check if active device is "near" this window to light it up.
            // "By example NW turn lights on of the buildings there"
            // So if a person is in the NW quadrant, buildings/windows in NW should light up.
            
            // Logic: Is there a person close to this window?
            // Distance threshold?
            // "at a side" -> Quadrant logic or localized logic?
            // "turn lights on of the buildings there" -> Localized.
            
            let isLit = false;
            
            // Random flickering baseline (from original code R(1)<.5)
            // But user said "so has a color when the people are at a side".
            // Implies OFF normally? Or random normally?
            // "turn lights on ... when people are at a side".
            // Let's assume OFF or dim normally, and ON when people are near.
            // Or maybe random yellow/dim normally, and specific color when person near?
            // "lights up so has a color"
            
            // Let's go with:
            // Default: Dark / Dim / Off (fill(20,20,0))
            // Active: Bright Yellow/White (fill(255, 255, 0))
            
            // Calculate influence
            let minD = Infinity;
            for (let s of activeStates) {
                let d = dist(wx, wy, s.x, s.y);
                if (d < minD) minD = d;
            }
            
            // Threshold for lighting up
            if (minD < 150) { // 150px radius around person
                isLit = true;
            }
            
            if (isLit) {
                // Lit Color
                // Maybe vary based on person? Or just Yellow?
                // "turn lights on" -> Yellow/White
                fill(255, 255, 200);
            } else {
                // Unlit / Background
                // Original code: C=(R(1)<.5?W:20), C, 0. W=720 (clamped 255).
                // So Random(Yellow, Dark).
                // Let's keep some random life if user wants "City" feel, 
                // but emphasize the person area.
                // Or maybe strictly dark? "turn lights on ... when people are there".
                // Let's make it mostly dark with occasional random for life, but strictly bright near person.
                
                // Static random per window? 
                // We didn't store random state per window. 
                // Let's perform a hash or noise check for stability.
                let n = noise(wx, wy, frameCount * 0.01); // Slow flicker
                if (n > 0.7) {
                    fill(50, 50, 0); // Dim yellow
                } else {
                    fill(20, 20, 0); // Off/Dark
                }
            }
            
            rect(wx, wy, win.w, win.h); // Square window
        }
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
}

