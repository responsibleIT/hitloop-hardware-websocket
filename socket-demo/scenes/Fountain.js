class Fountain extends Scene {
    constructor(deviceManager) {
      super(deviceManager);
      this.t = 0;
      this.particles = [];
      this.fountainLayer = null;
      // Reduced particle buffer size for performance
      this.P = new Array(3000); 
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

      // Audio State
      this.sound = null;
      this.fft = null;
      this.active = false;
      this.audioEnergy = 0;
    }
  
    setup() {
      this.t = 0;
      this.t_counter = 0;
      this.P = new Array(3000); 
      this._state.clear();
      this._colors.clear();
      this._lastLedHex.clear();
      
      this.fountainLayer = createGraphics(width, height);
      this.fountainLayer.background(0);

      // Audio Init
      this.active = true;
      if (!this.sound) {
        // Load sound if not loaded
        loadSound('sounds/fountain-classic-music.mp3', (s) => {
          if (!this.active) {
             s.stop();
             return; 
          }
          this.sound = s;
          this._initAudio();
        });
      } else {
        // Already loaded, just init
        this._initAudio();
      }
    }

    teardown() {
        this.active = false;
        if (this.sound) {
            this.sound.stop();
            this.sound.disconnect();
        }
    }

    _initAudio() {
        if (!this.sound) return;
        
        this.sound.disconnect(); // Disconnect from master
        this.sound.connect(); // Connect back to master (default)
        
        this.sound.loop();
        
        if (!this.fft) {
            this.fft = new p5.FFT(0.5, 512); // Lower smoothing for snappier, more synced beat detection
        }
        this.fft.setInput(this.sound);
    }
  
    draw() {
      // Audio Analysis
      let bass = 0, lowMid = 0, mid = 0, highMid = 0, treble = 0;
      if (this.fft && this.sound && this.sound.isPlaying()) {
          this.fft.analyze();
          bass = this.fft.getEnergy("bass"); 
          lowMid = this.fft.getEnergy("lowMid");
          mid = this.fft.getEnergy("mid"); 
          highMid = this.fft.getEnergy("highMid");
          treble = this.fft.getEnergy("treble");
          this.audioEnergy = bass;
      }

      if (!this.fountainLayer || this.fountainLayer.width !== width || this.fountainLayer.height !== height) {
          this.fountainLayer = createGraphics(width, height);
          this.fountainLayer.background(0);
      }
      
      // --- 1. Draw Fountains to Layer ---
      this.fountainLayer.push();
      this.fountainLayer.noStroke();
      this.fountainLayer.fill(0, 80); // Higher alpha for faster water disappearance
      this.fountainLayer.rect(0, 0, width, height);
      
      this.fountainLayer.strokeWeight(1);
      
      // Removed expensive BLUR filter
      
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
      
      // Sequential Splash Logic removed.
      // Multi-band Dancing Fountains
      
      // --- Participant Position Detection ---
      // Check participant positions to adjust water intensity and speed
      const allDevices = [...this.deviceManager.getAllDevices().values()];
      const screenCenter = width / 2;
      let participantsOnLeft = 0;
      let participantsOnRight = 0;
      
      // Pre-calculate colors to check if all participants share the same color
      // We need to get colors first to check them
      const participantColors = [];
      for (const dev of allDevices) {
        const data = dev.getSensorData?.() ?? {};
        const id = data.id ?? dev.id ?? dev;
        const state = this._getState(id);
        const tilt = this._getTilt(data);
        const col = this._getColor(state, id, tilt);
        participantColors.push({ id, col, state });
        
        if (state.x < screenCenter) {
          participantsOnLeft++;
        } else {
          participantsOnRight++;
        }
      }
      
      // Check if all participants share the same color (red, white, green, or blue)
      let waterTextureMode = null; // null = normal, 'red', 'white', 'green', 'blue' = special textures
      if (participantColors.length > 0) {
        let allRed = true;
        let allWhite = true;
        let allGreen = true;
        let allBlue = true;
        
        for (const { col } of participantColors) {
          if (!col) {
            allRed = allWhite = allGreen = allBlue = false;
            break;
          }
          
          const r = col[0];
          const g = col[1];
          const b = col[2];
          
          // Check red: high red, low green/blue
          if (r < 180 || g > 50 || b > 50) allRed = false;
          
          // Check white: high red, green, and blue
          if (r < 200 || g < 200 || b < 200) allWhite = false;
          
          // Check green: high green, low red/blue
          if (g < 180 || r > 50 || b > 50) allGreen = false;
          
          // Check blue: high blue, low red/green
          if (b < 180 || r > 50 || g > 50) allBlue = false;
        }
        
        // Determine which texture mode to use
        if (allRed) waterTextureMode = 'red';
        else if (allWhite) waterTextureMode = 'white';
        else if (allGreen) waterTextureMode = 'green';
        else if (allBlue) waterTextureMode = 'blue';
      }
      
      // Adjust water intensity based on participant positions
      // Left side = less water, Right side = more water
      const totalParticipants = participantsOnLeft + participantsOnRight;
      let particleMultiplier = 1.0;
      const speedMultiplier = 1.0;
      
      if (totalParticipants > 0) {
        const rightRatio = participantsOnRight / totalParticipants;
        // Map from 0 (all left) to 1 (all right)
        // All left: 0.5x water (less splash)
        // All right: 1.5x water (more splash)
        particleMultiplier = map(rightRatio, 0, 1, 0.5, 1.5);
      }
      
      for(let T = 1; T <= 10; T++) {
          // Determine band for this fountain (Mirrored Stage Layout - 5 bands)
          // 1 & 10 : Bass
          // 2 & 9  : LowMid
          // 3 & 8  : Mid
          // 4 & 7  : HighMid
          // 5 & 6  : Treble
          
          let localEnergy = 0;
          let threshold = 0;
          
          if (T === 1 || T === 10) {
             localEnergy = bass;
             threshold = 220; // Increased threshold for "punchier" bass response
          } else if (T === 2 || T === 9) {
             localEnergy = lowMid;
             threshold = 80; 
          } else if (T === 3 || T === 8) {
             localEnergy = mid;
             threshold = 160; 
          } else if (T === 4 || T === 7) {
             localEnergy = highMid;
             threshold = 60; 
          } else { // 5 or 6
             localEnergy = treble;
             threshold = 120; 
          }
          
          // "Turn off sometimes" - check threshold
          // Use exponential drop-off for sharper cuts
          if (localEnergy < threshold) continue;

          // Calculate particles and height based on localEnergy
          // Sharper curve for more explosive reaction
          // Apply particle multiplier based on participant positions
          const baseCount = Math.floor(map(Math.pow(localEnergy/255, 2), 0, 1, 5, 40));
          const count = Math.floor(baseCount * particleMultiplier);
          
          const heightBoost = 2.5; 
          const energyFactor = map(localEnergy, threshold, 255, 1.0, heightBoost);

          // Melody detection - mid and highMid frequencies typically contain melodies
          const melodyEnergy = (mid + highMid) / 2;
          const melodyIntensity = map(melodyEnergy, 0, 255, 0, 1);

          // No sway - fountains go straight up
          let sway = 0;

          for(let i = 0; i < count; i++) {
              let idx = this.t_counter % 5000;
              this.t_counter++;
              
              let t_val = this.t_counter; 
              
              // Store color for this particle!
              let col = fountainColors[T-1];
              
              let S = t_val / 2000.0;
              let term1 = N(S, T) * 5;
              let term2 = random(1);
              // No sway applied - straight up direction
              let R = 1.7 + term1 + term2;
              
              let noiseCheck = 9; 
              // Increased base velocity multiplier (was 0.8)
              let b_val = (Math.sin(R) * 4 - N(S, T, 9) * noiseCheck) * 1.0;
              
              // Apply energy boost to height
              b_val *= energyFactor;
              
              // Apply speed multiplier based on participant positions
              // More participants on left = faster water
              b_val *= speedMultiplier;
    
              // Increased minimum upward kick (was -3)
              if (b_val > -4) b_val -= 4; 
              
              this.P[idx] = {
                  x: T * (720 / 11),
                  y: W,
                  a: Math.cos(R),
                  b: b_val,
                  c: col // Store color [r,g,b]
              };
          }
      }
      
      for(let k = 0; k < this.P.length; k++) {
          let e = this.P[k];
          if (!e) continue;
          
          e.b += 0.1;
          e.x += e.a;
          e.y += e.b;
          
          let sx = e.x * scaleX;
          let sy = e.y * scaleY;
          
          // Set stroke color per particle with brightness boost for better contrast
          let c = e.c || [255, 255, 255];
          
          // Lighten red and blue water colors specifically (keep controller colors unchanged)
          // For red: make it lighter pink-red
          // For blue: make it lighter sky-blue (keep blue dominant, not purple)
          if (c[0] > 200 && c[1] < 50 && c[2] < 50) {
            // Red color - lighten it
            c = [255, Math.min(255, c[1] + 100), Math.min(255, c[2] + 100)];
          } else if (c[2] > 200 && c[0] < 50 && c[1] < 50) {
            // Blue color - lighten it (add equal amounts of red/green to keep it blue, not purple)
            c = [Math.min(255, c[0] + 80), Math.min(255, c[1] + 80), 255];
          }
          
          // Increase brightness for better contrast
          const brightnessBoost = 1.7;
          let brightC = [
            Math.min(255, c[0] * brightnessBoost),
            Math.min(255, c[1] * brightnessBoost),
            Math.min(255, c[2] * brightnessBoost)
          ];
          
          if (waterTextureMode === 'blue') {
              // Blue texture: thicker strokes with glow effect
              this.fountainLayer.strokeWeight(2);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 200);
              this.fountainLayer.point(sx, sy);
              
              // Add glow effect with surrounding points
              this.fountainLayer.strokeWeight(1);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 100);
              this.fountainLayer.point(sx + 1, sy);
              this.fountainLayer.point(sx - 1, sy);
              this.fountainLayer.point(sx, sy + 1);
              this.fountainLayer.point(sx, sy - 1);
          } else if (waterTextureMode === 'red') {
              // Red texture: fiery/sparkly effect with multiple bright points
              this.fountainLayer.strokeWeight(2);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 255);
              this.fountainLayer.point(sx, sy);
              
              // Add sparkle effect
              this.fountainLayer.strokeWeight(1);
              this.fountainLayer.stroke(brightC[0], Math.min(255, brightC[1] + 50), Math.min(255, brightC[2] + 30), 150);
              this.fountainLayer.point(sx + 0.5, sy - 0.5);
              this.fountainLayer.point(sx - 0.5, sy + 0.5);
              this.fountainLayer.point(sx + 0.7, sy + 0.3);
              this.fountainLayer.point(sx - 0.7, sy - 0.3);
          } else if (waterTextureMode === 'white') {
              // White texture: bright, glowing effect
              this.fountainLayer.strokeWeight(3);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 255);
              this.fountainLayer.point(sx, sy);
              
              // Bright glow halo
              this.fountainLayer.strokeWeight(2);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 180);
              this.fountainLayer.point(sx + 1, sy);
              this.fountainLayer.point(sx - 1, sy);
              this.fountainLayer.point(sx, sy + 1);
              this.fountainLayer.point(sx, sy - 1);
              
              this.fountainLayer.strokeWeight(1);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 120);
              this.fountainLayer.point(sx + 1.5, sy);
              this.fountainLayer.point(sx - 1.5, sy);
              this.fountainLayer.point(sx, sy + 1.5);
              this.fountainLayer.point(sx, sy - 1.5);
          } else if (waterTextureMode === 'green') {
              // Green texture: organic, flowing effect with soft trails
              this.fountainLayer.strokeWeight(2);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 180);
              this.fountainLayer.point(sx, sy);
              
              // Soft flowing effect
              this.fountainLayer.strokeWeight(1.5);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2], 120);
              this.fountainLayer.point(sx + 0.8, sy + 0.5);
              this.fountainLayer.point(sx - 0.8, sy + 0.5);
              this.fountainLayer.point(sx + 0.5, sy + 0.8);
              this.fountainLayer.point(sx - 0.5, sy + 0.8);
          } else {
              // Normal texture: thin single point
              this.fountainLayer.strokeWeight(1);
              this.fountainLayer.stroke(brightC[0], brightC[1], brightC[2]);
              this.fountainLayer.point(sx, sy);
          }
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
      
      // --- 3. Draw Preview Overlay ---
      this._drawPreviewOverlay(renderList);
      
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
      const eyeSize = r * 0.22;
      fill(0);
      noStroke();
      circle(state.x - eyeOffsetX, state.y - eyeOffsetY, eyeSize);
      circle(state.x + eyeOffsetX, state.y - eyeOffsetY, eyeSize);
    }

    _rgbToHex([r, g, b]) {
      const clamp = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
      return [clamp(r), clamp(g), clamp(b)]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
    }

    _drawPreviewOverlay(renderList) {
      // Preview overlay dimensions and position
      const previewWidth = 350;
      const previewHeight = 260;
      const previewX = width - previewWidth - 20;
      const previewY = height - previewHeight - 20;
      const padding = 10;
      
      // Draw background with light gray background (semi-transparent)
      push();
      fill(220, 220, 220, 200); // Light gray with transparency
      stroke(0, 0, 0, 200);
      strokeWeight(2);
      rect(previewX, previewY, previewWidth, previewHeight, 5);
      
      // Preview space (excluding padding)
      const previewSpaceX = previewX + padding;
      const previewSpaceY = previewY + padding;
      const previewSpaceW = previewWidth - padding * 2;
      const previewSpaceH = previewHeight - padding * 2;
      
      // Draw beacons d1 (blue, bottom-left) and d2 (red, bottom-right)
      const beaconBaseWidth = 12;
      const beaconBaseHeight = 6;
      const beaconDomeHeight = 8;
      const beaconY = previewSpaceY + previewSpaceH - beaconBaseHeight - 5;
      
      // Beacon d1 (blue) - bottom-left
      const d1X = previewSpaceX + beaconBaseWidth + 5;
      push();
      // Base (dark gray)
      fill(60, 60, 60);
      stroke(80, 80, 80);
      strokeWeight(1);
      rect(d1X - beaconBaseWidth/2, beaconY, beaconBaseWidth, beaconBaseHeight, 1);
      // Dome (dark blue)
      fill(0, 0, 180);
      stroke(0, 0, 220);
      strokeWeight(1);
      arc(d1X, beaconY, beaconBaseWidth, beaconDomeHeight, PI, 0);
      // Light insert (lighter blue)
      fill(100, 150, 255);
      noStroke();
      rect(d1X - 2, beaconY - beaconDomeHeight/2 + 1, 4, beaconDomeHeight - 2);
      pop();
      
      // Beacon d2 (red) - bottom-right
      const d2X = previewSpaceX + previewSpaceW - beaconBaseWidth - 5;
      push();
      // Base (dark gray)
      fill(60, 60, 60);
      stroke(80, 80, 80);
      strokeWeight(1);
      rect(d2X - beaconBaseWidth/2, beaconY, beaconBaseWidth, beaconBaseHeight, 1);
      // Dome (dark red)
      fill(180, 0, 0);
      stroke(220, 0, 0);
      strokeWeight(1);
      arc(d2X, beaconY, beaconBaseWidth, beaconDomeHeight, PI, 0);
      // Light insert (lighter red)
      fill(255, 150, 100);
      noStroke();
      rect(d2X - 2, beaconY - beaconDomeHeight/2 + 1, 4, beaconDomeHeight - 2);
      pop();
      
      // Map participant positions from main screen to preview space
      // Scale from main screen coordinates to preview coordinates
      const scaleX = previewSpaceW / width;
      const scaleY = previewSpaceH / height;
      const participantRadius = 4;
      
      // Draw participant circles
      for (const { state, col } of renderList) {
        // Map main screen position to preview position
        const previewX_pos = previewSpaceX + state.x * scaleX;
        const previewY_pos = previewSpaceY + state.y * scaleY;
        
        // Draw circle with participant color (no stroke)
        fill(col[0], col[1], col[2]);
        noStroke();
        circle(previewX_pos, previewY_pos, participantRadius * 2);
      }
      
      pop();
    }
}
