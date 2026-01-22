class RainyDaySingle extends Scene {
  constructor(...a) {
    super(...a);
    this.t = 0;
    this.stars = []; // rain drops (stars)
    this.starCap = 0;
    this.starLayer = null;
    this.obstacles = [];
    this._grid = null;
    this._cell = 48;
    
    // Device colors - each device gets a random color from predefined set
    this._deviceColors = new Map(); // id -> {r, g, b, hex}
    this._lastLedHexById = new Map();
    
    // Predefined color palette
    this.colorPalette = [
      { r: 255, g: 0, b: 0, hex: 'ff0000' },      // red
      { r: 0, g: 136, b: 255, hex: '0088ff' },    // blue
      { r: 0, g: 255, b: 102, hex: '08ff0c' },    // green
      { r: 138, g: 43, b: 226, hex: '8a2be2' },   // purple
      { r: 255, g: 165, b: 0, hex: 'ff5500' },   // orange (more vibrant orange for LED)
      { r: 242, g: 242, b: 242, hex: 'ffffff' },  // white
    ];
    
    // Device state - each device moves independently
    this._deviceState = new Map(); // id -> {x, y, vx, vy}
    
    // Device properties
    this.deviceRadius = 40; // bigger device circles
    
    // Movement parameters (both horizontal and vertical)
    this.horizontalGain = 2.5;
    this.verticalGain = 2.5;
    this.deadzone = 0.05;
    this.maxSpeed = 3.0;
    this.friction = 0.92;
  }

  setup() {
    // Clear device colors so they get reassigned when entering this scene
    this._deviceColors.clear();
    this._lastLedHexById.clear();
    
    this.starLayer = createGraphics(width, height);
    this.starLayer.pixelDensity(1);
    this.starCap = width * 5; // Reduced for better performance
    this.stars = new Array(this.starCap);
  }

  _getRandomColor(id) {
    // Get or assign a random color from the palette for this device
    if (!this._deviceColors.has(id)) {
      // Pick a random color from the palette
      const color = this.colorPalette[Math.floor(Math.random() * this.colorPalette.length)];
      this._deviceColors.set(id, color);
    }
    return this._deviceColors.get(id);
  }

  _syncControllerColors(devices) {
    const present = new Set(devices.map((d) => d.getSensorData?.().id ?? d.id ?? d));
    // Remove colors for devices that are no longer present
    for (const id of [...this._deviceColors.keys()]) {
      if (!present.has(id)) this._deviceColors.delete(id);
    }
    for (const id of [...this._lastLedHexById.keys()]) {
      if (!present.has(id)) this._lastLedHexById.delete(id);
    }
    
    // Sync LED colors for each device
    for (const dev of devices) {
      const id = dev.getSensorData?.().id ?? dev.id ?? dev;
      const color = this._getRandomColor(id);
      const last = this._lastLedHexById.get(id);
      if (!last || last.toLowerCase() !== color.hex.toLowerCase()) {
        try { this.deviceManager.sendCommandToDevice(id, 'led', color.hex); } catch (_) {}
        this._lastLedHexById.set(id, color.hex);
      }
    }
  }

  _resetStars() {
    this.t = 0;
    this.stars.fill(undefined);
    this.starLayer.clear();
  }

  _buildObstacleGrid() {
    const cell = this._cell;
    const g = new Map();
    for (const o of this.obstacles) {
      const minCx = Math.floor((o.x - o.r) / cell);
      const maxCx = Math.floor((o.x + o.r) / cell);
      const minCy = Math.floor((o.y - o.r) / cell);
      const maxCy = Math.floor((o.y + o.r) / cell);
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const key = cx + "," + cy;
          let arr = g.get(key);
          if (!arr) {
            arr = [];
            g.set(key, arr);
          }
          arr.push(o);
        }
      }
    }
    this._grid = g;
  }

  _forEachNearbyOb(x, y, cb) {
    const cell = this._cell;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    if (!this._grid) {
      for (const o of this.obstacles) {
        if (cb(o)) break;
      }
      return;
    }
    for (let iy = -1; iy <= 1; iy++) {
      for (let ix = -1; ix <= 1; ix++) {
        const arr = this._grid.get(cx + ix + "," + (cy + iy));
        if (!arr) continue;
        for (const o of arr) {
          if (cb(o)) return;
        }
      }
    }
  }

  _spawnStars(n = 6) {
    // Reduced spawn rate for better performance
    for (let i = 0; i < n; i++) {
      const idx = this.t % this.starCap;
      this.stars[idx] = {
        x: (this.t * 99) % width,
        y: 0,
        vx: random(-0.6, 0.6),
        vy: 0.5,
        s: 3,
      };
      this.t++;
    }
  }

  _moveStar(p) {
    const N = noise(p.x / width, p.y / 9, this.t / width);
    N > 0.4
      ? (p.vy += 0.28)
      : ((p.vx += N % 0.1 > 0.05 ? 0.03 : -0.03), (p.vy += 0.02));
    p.vx = constrain(p.vx, -2, 2);
    p.vy = constrain(p.vy, -4, 4);
    let nx = p.x + p.vx;
    let ny = p.y + p.vy;
    
    // Check collision with obstacles (devices) - optimized
    if (this.obstacles.length > 0) {
      this._forEachNearbyOb(nx, ny, (o) => {
        const dx = nx - o.x;
        const dy = ny - o.y;
        const dSq = dx * dx + dy * dy;
        const rSq = (o.r + 0.5) * (o.r + 0.5);
        if (dSq < rSq && dSq > 0) {
          const d = Math.sqrt(dSq);
          const nX = dx / d;
          const nY = dy / d;
          const dot = p.vx * nX + p.vy * nY;
          nx = o.x + nX * (o.r + 0.5);
          ny = o.y + nY * (o.r + 0.5);
          p.vx -= 2 * dot * nX;
          p.vy -= 2 * dot * nY;
          p.vx *= 0.6;
          p.vy *= 0.6;
          return true;
        }
        return false;
      });
    }
    
    p.x = nx;
    p.y = ny;
    p.s *= 0.997;
  }

  _normAccel(v) {
    if (v == null) return 0;
    if (v >= -1.5 && v <= 1.5) return constrain(v, -1, 1);
    if (v >= -20 && v <= 20) return constrain(v / 9.81, -1, 1);
    if (v >= 0 && v <= 255) return constrain((v - 127.5) / 127.5, -1, 1);
    return constrain(v, -1, 1);
  }

  draw() {
    background(20, 30, 40); // dark blue-gray sky
    
    const dm = this.deviceManager;
    const count = dm.getDeviceCount();
    const devs = [...dm.getAllDevices().values()];
    
    // Sync LED colors (assign random colors if needed)
    this._syncControllerColors(devs);
    
    // Update device positions (each device moves independently)
    const devicePositions = [];
    for (const dev of devs) {
      const id = dev.getSensorData?.().id ?? dev.id ?? dev;
      const sensor = dev.getSensorData?.() || {};
      
      // Get or initialize device state
      let state = this._deviceState.get(id);
      if (!state) {
        state = {
          x: random(this.deviceRadius, width - this.deviceRadius),
          y: random(this.deviceRadius, height - this.deviceRadius),
          vx: 0,
          vy: 0,
        };
        this._deviceState.set(id, state);
      }
      
      // Update velocity based on tilt (both horizontal and vertical)
      const ax = this._normAccel(sensor.ax ?? sensor.aX ?? sensor.accX);
      const ay = this._normAccel(sensor.ay ?? sensor.aY ?? sensor.accY);
      
      // Horizontal movement: ay controls left/right
      if (Math.abs(ay) > this.deadzone) {
        state.vx += ay * this.horizontalGain;
      }
      
      // Vertical movement: ax controls up/down
      if (Math.abs(ax) > this.deadzone) {
        state.vy += -ax * this.verticalGain; // negative because ax>0 should move up
      }
      
      // Apply friction and limits
      state.vx *= this.friction;
      state.vy *= this.friction;
      state.vx = constrain(state.vx, -this.maxSpeed, this.maxSpeed);
      state.vy = constrain(state.vy, -this.maxSpeed, this.maxSpeed);
      
      // Update position
      state.x += state.vx;
      state.y += state.vy;
      
      // Keep within bounds
      state.x = constrain(state.x, this.deviceRadius, width - this.deviceRadius);
      state.y = constrain(state.y, this.deviceRadius, height - this.deviceRadius);
      
      devicePositions.push({
        id,
        x: state.x,
        y: state.y,
        sensor,
      });
    }
    
    // Remove device states for devices that are no longer present
    const presentIds = new Set(devicePositions.map(p => p.id));
    for (const id of [...this._deviceState.keys()]) {
      if (!presentIds.has(id)) this._deviceState.delete(id);
    }
    
    // Resolve collisions between devices (optimized)
    const R = this.deviceRadius;
    const minDist = R * 2;
    const minDistSq = minDist * minDist; // squared for faster comparison
    
    // Only do collision resolution if we have devices
    if (devicePositions.length > 1) {
      for (let i = 0; i < devicePositions.length; i++) {
        const a = devicePositions[i];
        for (let j = i + 1; j < devicePositions.length; j++) {
          const b = devicePositions[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < minDistSq && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const overlap = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            
            // Update device state positions directly
            const stateA = this._deviceState.get(a.id);
            const stateB = this._deviceState.get(b.id);
            if (stateA) {
              stateA.x = a.x = constrain(a.x, R, width - R);
              stateA.y = a.y = constrain(a.y, R, height - R);
            }
            if (stateB) {
              stateB.x = b.x = constrain(b.x, R, width - R);
              stateB.y = b.y = constrain(b.y, R, height - R);
            }
          }
        }
      }
    }
    
    // Update obstacles with resolved positions (reuse array)
    this.obstacles.length = devicePositions.length;
    for (let i = 0; i < devicePositions.length; i++) {
      const p = devicePositions[i];
      this.obstacles[i] = { x: p.x, y: p.y, r: this.deviceRadius };
    }
    
    // Only rebuild grid if we have obstacles
    if (this.obstacles.length > 0) {
      this._buildObstacleGrid();
    }
    
    // Update and draw rain
    this._drawStars();
    
    // Draw devices
    for (const { id, x, y, sensor } of devicePositions) {
      const color = this._getRandomColor(id);
      
      push();
      // Draw device circle
      fill(color.r, color.g, color.b);
      noStroke();
      ellipse(x, y, this.deviceRadius * 2);
      
      // Draw simple face (eyes)
      fill(255);
      const ax = this._normAccel(sensor.ax ?? sensor.aX ?? sensor.accX);
      const ay = this._normAccel(sensor.ay ?? sensor.aY ?? sensor.accY);
      const az = this._normAccel(sensor.az ?? sensor.aZ ?? sensor.accZ);
      const m = 8 * (1 + 0.15 * az);
      const ex = ay * m;
      const ey = -ax * m;
      ellipse(x - 10, y - 8, 16, 16);
      ellipse(x + 10, y - 8, 16, 16);
      fill(0);
      ellipse(x - 10 + ex, y - 8 + ey, 8, 8);
      ellipse(x + 10 + ex, y - 8 + ey, 8, 8);
      pop();
    }
    
    // Draw UI
    fill(255);
    noStroke();
    textSize(16);
    // text(`Devices: ${count}`, 10, 20);
  }

  _drawStars() {
    this._spawnStars(6); // Reduced spawn rate
    const L = this.starLayer;
    L.push();
    L.background(0, 9); // fade effect
    L.filter(BLUR, 1);
    
    // Move and draw rain in one pass for better performance
    L.stroke(200, 220, 255, 180);
    L.noFill();
    
    for (const p of this.stars) {
      if (!p) continue;
      
      // Move star
      this._moveStar(p);
      
      // Draw rain
      L.strokeWeight(p.s);
      L.point(p.x, p.y);
      
      // Draw rain streak (line from above)
      if (p.vy > 0) {
        const streakLen = Math.min(p.vy * 3, 15);
        L.line(p.x, p.y - streakLen, p.x, p.y);
      }
    }
    
    L.pop();
    image(L, 0, 0);
  }
}
