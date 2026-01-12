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
    
    // Target colors
    this.colors = {
      LEFT: [0, 0, 255],   // Blue
      RIGHT: [255, 0, 0]   // Red
    };
    
    // Ball position state
    this.ballX = 0;
    this.ballY = 0;
    this.rotationAngle = 0;
    
    // Audio State
    this.sound = null;
    this.lp = null;
    this.hp = null;
    this.fft = null;
    this.active = false;
    this.audioEnergy = 0;
  }

  setup() {
    this.t = 0;
    this.P = [];
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
    
    // Initialize ball to center
    this.ballX = width / 2;
    this.ballY = height / 2;
    this.rotationAngle = 0;
    
    // Audio Init
    this.active = true;
    if (!this.sound) {
      // Load sound if not loaded
      loadSound('sounds/controlTheBall-Music-Techno.mp3', (s) => {
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
    // Note: Filters persist but are disconnected from source
  }

  _initAudio() {
    if (!this.sound) return;
    
    this.sound.disconnect(); // Disconnect from master
    
    if (!this.lp) {
      this.lp = new p5.LowPass();
      this.lp.freq(200); // Low frequency for Kicks
      this.lp.res(1);
    }
    
    if (!this.hp) {
      this.hp = new p5.HighPass();
      this.hp.freq(3000); // High frequency for Hi-Hats
      this.hp.res(1);
    }
    
    // Parallel processing: Source -> LP -> Master AND Source -> HP -> Master
    this.sound.connect(this.lp);
    this.sound.connect(this.hp);
    
    this.sound.loop();
    
    if (!this.fft) {
      this.fft = new p5.FFT(0.3, 512); // Low smoothing for snappy response
    }
  }

  draw() {
    // 1. Calculate Ball Color based on devices
    // We'll use the average color of all active devices
    let avgR = 0, avgG = 0, avgB = 0;
    let count = 0;
    let totalDx = 0;
    let totalAx = 0;

    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();
    const renderList = [];

    // Process devices to update physics and get their colors
    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);
      
      // Accumulate beacon influence for ball movement
      const d1 = Number(data?.dNW ?? data?.d1 ?? 0);
      const d2 = Number(data?.dNE ?? data?.d2 ?? 0);
      const d3 = Number(data?.dSE ?? data?.d3 ?? 0);
      const d4 = Number(data?.dSW ?? data?.d4 ?? 0);
      
      // Horizontal only: Right (d2+d3) - Left (d1+d4)
      const dx = (d2 + d3) - (d1 + d4);
      totalDx += dx;

      // Accumulate Tilt for Rotation
      const rawAx = Number(data.ax ?? data.aX ?? data.accX ?? 128);
      // Map 0..255 to -1..1 for rotation speed control
      const ax = (rawAx / 255.0) * 2.0 - 1.0; 
      totalAx += ax;

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
    
    // Update Ball Position based on beacon aggregate
    let targetX = width / 2;
    let targetY = height / 2;
    let avgAx = 0;
    
    if (count > 0) {
      const avgDx = totalDx / count;
      avgAx = totalAx / count;
      
      // Map the average beacon delta (approx -510 to 510) to screen offset
      // We'll use a mapping that allows the ball to reach the edges
      const maxDelta = 300; // Sensitivity factor
      const offsetX = map(avgDx, -maxDelta, maxDelta, -width / 2 + 50, width / 2 - 50, true);
      
      targetX = width / 2 + offsetX;
      // Keep targetY vertically centered
    }
    
    // Update Rotation
    // Tilt determines speed of rotation. 
    // Left tilt (neg) -> Counter-Clockwise? Right (pos) -> Clockwise
    this.rotationAngle += avgAx * 0.02; // Reduced speed factor from 0.1 to 0.02

    // Audio Filtering & Analysis
    if (this.sound && this.sound.isPlaying()) {
      // Calculate balance (-1 for Left/Blue, 1 for Right/Red)
      // avgDx is roughly -300 to 300
      let balance = 0;
      if (count > 0) {
          const avgDx = totalDx / count;
          balance = map(avgDx, -300, 300, -1, 1, true);
      }
      
      // Map balance to volume of filters
      // Left (-1): Blue -> Hi-Hats (HP) louder
      // Right (1): Red -> Kicks (LP) louder
      
      const hpGain = map(balance, -1, 1, 1, 0); // Left=1, Right=0
      const lpGain = map(balance, -1, 1, 0, 1); // Left=0, Right=1
      
      this.hp.amp(hpGain);
      this.lp.amp(lpGain);
      
      // Analyze Frequency for Visuals
      if (this.fft) {
        this.fft.analyze();
        // If on right (Red/Kicks), react to Bass. If on Left (Blue/HiHats), react to Treble.
        // Or blend them?
        const bass = this.fft.getEnergy("bass");
        const treble = this.fft.getEnergy("treble");
        
        // Pick dominant energy based on position
        // If balance < 0 (Left), use treble. If > 0 (Right), use bass.
        // Or mix:
        const tFactor = map(balance, -1, 1, 1, 0); // 1 at Left
        const bFactor = map(balance, -1, 1, 0, 1); // 1 at Right
        
        this.audioEnergy = (bass * bFactor) + (treble * tFactor);
      }
    }

    // Smooth movement
    this.ballX = lerp(this.ballX, targetX, 0.05);
    this.ballY = lerp(this.ballY, targetY, 0.05);

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
    const cx = this.ballX;
    const cy = this.ballY;
    const W = 720; // Keeping the scale factor for noise consistent
    
    // Audio Reactivity Scaling
    // Map energy to a wider range for "exact" following
    // 0 energy -> very slow movement
    // High energy -> fast/explosive movement
    const reaction = map(this.audioEnergy || 0, 0, 255, 0.1, 5, true); 

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
      push();
      translate(this.ballX, this.ballY);
      rotate(this.rotationAngle);
      translate(-this.ballX, -this.ballY);

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
        
        // Direct amplitude modulation of displacement
        // Base movement + Explosive reaction
        const D = (Math.pow(noiseVal, 4) * 20 * reaction);
        
        const nextX = e.x + cos(e.r) * D;
        const nextY = e.y + sin(e.r) * D;
        
        line(X, Y, nextX, nextY);
        
        e.x = nextX;
        e.y = nextY;
        
        X = nextX;
        Y = nextY;
      }
      pop();
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
    
    // Draw preview overlay
    this._drawPreviewOverlay(renderList);
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
    // Determine target color based on position (Left vs Right)
    // Left: Blue, Right: Red
    
    const isLeft = state.x < width / 2;
    const target = isLeft ? this.colors.LEFT : this.colors.RIGHT;

    // Transition Logic
    const current = this._colors.get(id);
    if (!current) {
      this._colors.set(id, target);
      return target;
    }

    // Smooth transition
    const k = 0.05; // Lerp factor
    const r = current[0] + (target[0] - current[0]) * k;
    const g = current[1] + (target[1] - current[1]) * k;
    const b = current[2] + (target[2] - current[2]) * k;

    const nextColor = [r, g, b];
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

