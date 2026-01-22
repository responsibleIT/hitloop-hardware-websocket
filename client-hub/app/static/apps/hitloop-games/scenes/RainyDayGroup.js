class RainyDayGroup extends Scene {
    constructor(...a) {
      super(...a);
      this.t = 0;
    this.stars = []; // rain drops (stars)
      this.starCap = 0;
      this.starLayer = null;
      this.obstacles = [];
      this._grid = null;
      this._cell = 48;
    
    // Team management (purple, orange, green, red)
    this._teamById = new Map();
    this._lastLedHexById = new Map();
    this.colors = {
      purple: { name: 'purple', rgb: [138, 43, 226], hex: '8a2be2' },
      orange: { name: 'orange', rgb: [255, 165, 0], hex: 'ffa500' },
      green: { name: 'green', rgb: [0, 255, 102], hex: '08ff0c' },
      red: { name: 'red', rgb: [255, 0, 0], hex: 'ff0000' },
    };
    
    // Device grouping - devices stand together, max 3 per row
    this.deviceRadius = 40; // bigger device circles
    this.deviceSpacing = 75; // spacing between devices in a group
    this.devicesPerRow = 3; // maximum devices per row
    this.rowSpacing = 85; // spacing between rows
    this.groupY = 0; // will be set in setup()
    
    // Team positions and movement (will be initialized in setup)
    this._teamPositions = {
      purple: { x: 0, velocityX: 0 },
      orange: { x: 0, velocityX: 0 },
      green: { x: 0, velocityX: 0 },
      red: { x: 0, velocityX: 0 },
    };
    
    // Movement parameters (horizontal only)
    this.horizontalGain = 2.5;
    this.horizontalDeadzone = 0.05;
    this.maxSpeed = 3.0;
    this.friction = 0.92;
    }
  
    setup() {
      this.starLayer = createGraphics(width, height);
      this.starLayer.pixelDensity(1);
      this.starCap = width * 9;
      this.stars = new Array(this.starCap);
    
    // Initialize group positions (4 teams spread across screen)
    this.groupY = height * 0.65;
    this._teamPositions.purple.x = width * 0.2;
    this._teamPositions.orange.x = width * 0.4;
    this._teamPositions.green.x = width * 0.6;
    this._teamPositions.red.x = width * 0.8;
  }

  _assignTeamsEqual(devices) {
    const ids = devices.map((d) => d.getSensorData?.().id ?? d.id ?? d);
    const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
    const n = sorted.length;
    const q1 = Math.ceil(n / 4);
    const q2 = Math.ceil(n / 2);
    const q3 = Math.ceil((3 * n) / 4);
    const purpleSet = new Set(sorted.slice(0, q1));
    const orangeSet = new Set(sorted.slice(q1, q2));
    const greenSet = new Set(sorted.slice(q2, q3));
    for (const id of sorted) {
      let team = 'purple';
      if (orangeSet.has(id)) team = 'orange';
      else if (greenSet.has(id)) team = 'green';
      else if (!purpleSet.has(id)) team = 'red';
      this._teamById.set(id, team);
    }
  }

  _syncControllerColors(devices) {
    const present = new Set(devices.map((d) => d.getSensorData?.().id ?? d.id ?? d));
    for (const id of [...this._lastLedHexById.keys()]) {
      if (!present.has(id)) this._lastLedHexById.delete(id);
    }
    for (const dev of devices) {
      const id = dev.getSensorData?.().id ?? dev.id ?? dev;
      const team = this._teamById.get(id) || 'purple';
      const color = this.colors[team];
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
  
    _spawnStars(n = 9) {
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
    
    // Check collision with obstacles (devices and umbrellas use same physics)
      this._forEachNearbyOb(nx, ny, (o) => {
      const dx = nx - o.x;
      const dy = ny - o.y;
      const d = sqrt(dx * dx + dy * dy);
        if (d < o.r + 0.5) {
        const nX = dx / (d || 1);
        const nY = dy / (d || 1);
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
    
    // Assign teams and sync LED colors
    this._assignTeamsEqual(devs);
    this._syncControllerColors(devs);
    
    // Group devices by team
    const byTeam = { purple: [], orange: [], green: [], red: [] };
    for (const dev of devs) {
      const id = dev.getSensorData?.().id ?? dev.id ?? dev;
      const team = this._teamById.get(id) || 'purple';
      byTeam[team].push({ dev, id, sensor: dev.getSensorData?.() || {} });
    }
    
    // Update team positions (horizontal movement only)
    for (const team of ['purple', 'orange', 'green', 'red']) {
      const teamDevs = byTeam[team];
      const teamPos = this._teamPositions[team];
      
      if (teamDevs.length > 0) {
        // Calculate average horizontal tilt from all team members
        let avgAy = 0; // horizontal (left/right)
        
        for (const { sensor } of teamDevs) {
          const ay = this._normAccel(sensor.ay ?? sensor.aY ?? sensor.accY);
          avgAy += ay;
        }
        
        avgAy /= teamDevs.length;
        
        // Update velocity based on horizontal tilt
        const hDead = this.horizontalDeadzone;
        if (Math.abs(avgAy) > hDead) {
          teamPos.velocityX += avgAy * this.horizontalGain;
        }
        
        // Apply friction and limits
        teamPos.velocityX *= this.friction;
        teamPos.velocityX = constrain(teamPos.velocityX, -this.maxSpeed, this.maxSpeed);
        
        // Update position (horizontal only)
        teamPos.x += teamPos.velocityX;
        
        // Calculate team's horizontal span (max 3 per row, so calculate based on rows)
        const maxDevicesInRow = Math.min(this.devicesPerRow, teamDevs.length);
        const teamWidth = (maxDevicesInRow - 1) * this.deviceSpacing + this.deviceRadius * 2;
        const teamLeft = teamPos.x - teamWidth / 2;
        const teamRight = teamPos.x + teamWidth / 2;
        
        // Keep within bounds
        const minX = this.deviceRadius;
        const maxX = width - this.deviceRadius;
        if (teamLeft < minX) {
          teamPos.x = minX + teamWidth / 2;
        }
        if (teamRight > maxX) {
          teamPos.x = maxX - teamWidth / 2;
        }
      } else {
        // No team members, apply friction
        teamPos.velocityX *= this.friction;
        teamPos.x += teamPos.velocityX;
      }
    }
    
    // Prevent teams from overlapping (but allow them to touch)
    const teams = ['purple', 'orange', 'green', 'red'];
    
    // Check all pairs of teams for overlaps
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const team1 = teams[i];
        const team2 = teams[j];
        const team1Devs = byTeam[team1];
        const team2Devs = byTeam[team2];
        const team1Pos = this._teamPositions[team1];
        const team2Pos = this._teamPositions[team2];
        
        if (team1Devs.length > 0 && team2Devs.length > 0) {
          // Calculate each team's width (based on max devices per row)
          const team1MaxRow = Math.min(this.devicesPerRow, team1Devs.length);
          const team2MaxRow = Math.min(this.devicesPerRow, team2Devs.length);
          const team1Width = (team1MaxRow - 1) * this.deviceSpacing + this.deviceRadius * 2;
          const team2Width = (team2MaxRow - 1) * this.deviceSpacing + this.deviceRadius * 2;
          
          const team1Left = team1Pos.x - team1Width / 2;
          const team1Right = team1Pos.x + team1Width / 2;
          const team2Left = team2Pos.x - team2Width / 2;
          const team2Right = team2Pos.x + team2Width / 2;
          
          // Check for overlap (not just touching, but actually overlapping)
          if (team1Right > team2Left && team1Left < team2Right) {
            // Teams are overlapping, separate them so they're just touching
            if (team1Pos.x < team2Pos.x) {
              // Team1 is on left, push them so team1Right == team2Left
              const overlap = team1Right - team2Left;
              team1Pos.x -= overlap * 0.5;
              team2Pos.x += overlap * 0.5;
            } else {
              // Team2 is on left, push them so team2Right == team1Left
              const overlap = team2Right - team1Left;
              team2Pos.x -= overlap * 0.5;
              team1Pos.x += overlap * 0.5;
            }
            
            // Re-clamp positions to bounds
            const team1MinX = this.deviceRadius;
            const team1MaxX = width - this.deviceRadius;
            const team2MinX = this.deviceRadius;
            const team2MaxX = width - this.deviceRadius;
            
            team1Pos.x = constrain(team1Pos.x, team1MinX + team1Width / 2, team1MaxX - team1Width / 2);
            team2Pos.x = constrain(team2Pos.x, team2MinX + team2Width / 2, team2MaxX - team2Width / 2);
          }
        }
      }
    }
    
    // Build obstacles from device positions (arranged in rows, max 3 per row)
    this.obstacles.length = 0;
    for (const team of ['purple', 'orange', 'green', 'red']) {
      const teamDevs = byTeam[team];
      const teamPos = this._teamPositions[team];
      
      if (teamDevs.length > 0) {
        // Calculate number of rows needed
        const numRows = Math.ceil(teamDevs.length / this.devicesPerRow);
        const centerRow = Math.floor(numRows / 2);
        
        // Position devices in rows (max 3 per row)
        for (let i = 0; i < teamDevs.length; i++) {
          const row = Math.floor(i / this.devicesPerRow);
          const col = i % this.devicesPerRow;
          
          // Calculate position for this device
          const rowWidth = Math.min(this.devicesPerRow, teamDevs.length - row * this.devicesPerRow);
          const startX = teamPos.x - (rowWidth - 1) * this.deviceSpacing / 2;
          const x = startX + col * this.deviceSpacing;
          const y = this.groupY + (row - centerRow) * this.rowSpacing;
          
          this.obstacles.push({ x, y, r: this.deviceRadius });
        }
      }
    }
    
    this._buildObstacleGrid();
    
    // Update and draw rain
    this._drawStars();
    
    // Draw devices (arranged in rows, max 3 per row)
    for (const team of ['purple', 'orange', 'green', 'red']) {
      const teamDevs = byTeam[team];
      const teamPos = this._teamPositions[team];
      const color = this.colors[team];
      
      if (teamDevs.length > 0) {
        // Calculate number of rows needed
        const numRows = Math.ceil(teamDevs.length / this.devicesPerRow);
        const centerRow = Math.floor(numRows / 2);
        
        // Draw devices in rows (max 3 per row)
        for (let i = 0; i < teamDevs.length; i++) {
          const row = Math.floor(i / this.devicesPerRow);
          const col = i % this.devicesPerRow;
          
          // Calculate position for this device
          const rowWidth = Math.min(this.devicesPerRow, teamDevs.length - row * this.devicesPerRow);
          const startX = teamPos.x - (rowWidth - 1) * this.deviceSpacing / 2;
          const x = startX + col * this.deviceSpacing;
          const y = this.groupY + (row - centerRow) * this.rowSpacing;
          const { sensor } = teamDevs[i];
          
        push();
          // Draw device circle
          fill(...color.rgb);
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
      }
    }
    
    // Draw UI
      fill(255);
      noStroke();
    textSize(16);
      text(`Devices: ${count}`, 10, 20);
  
    // Draw team info
    textSize(18);
    fill(...this.colors.purple.rgb);
    text(`Purple: ${byTeam.purple.length}`, 10, height - 100);
    fill(...this.colors.orange.rgb);
    text(`Orange: ${byTeam.orange.length}`, 10, height - 75);
    fill(...this.colors.green.rgb);
    text(`Green: ${byTeam.green.length}`, 10, height - 50);
    fill(...this.colors.red.rgb);
    text(`Red: ${byTeam.red.length}`, 10, height - 25);
  }

  _drawStars() {
    this._spawnStars(9);
    const L = this.starLayer;
    L.push();
    L.background(0, 9); // fade effect
    L.filter(BLUR, 1);
    
    // Move all stars first
    for (const p of this.stars) {
      if (!p) continue;
      this._moveStar(p);
    }
    
    // Draw rain (white)
    L.stroke(200, 220, 255, 180);
    L.noFill();
    for (const p of this.stars) {
      if (!p) continue;
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
  