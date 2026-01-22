  class Race extends Scene {
    constructor(...a) {
      super(...a);
      this.t = 0;
    this.stars = []; // rain drops (stars)
    this.starCap = 0;
    this.starLayer = null;
    this.obstacles = [];
    this._grid = null;
    this._cell = 48;
    
    // Three planets (like ThreePlanets.js)
    this.planets = {
      blue: { x: 0, y: 0, r: 80, velocityX: 0, hasReachedFinish: false, isReturningToStart: false, isAtStart: false },
      red: { x: 0, y: 0, r: 80, velocityX: 0, hasReachedFinish: false, isReturningToStart: false, isAtStart: false },
      green: { x: 0, y: 0, r: 80, velocityX: 0, hasReachedFinish: false, isReturningToStart: false, isAtStart: false },
    };
    
    // Team assignment
      this._teamById = new Map();
      this._lastLedHexById = new Map();
      this.colors = {
      blue: { name: 'blue', rgb: [0, 136, 255], hex: '0000ff' },
        red: { name: 'red', rgb: [255, 0, 0], hex: 'ff0000' },
      green: { name: 'green', rgb: [0, 255, 102], hex: '08ff0c' },
    };
    
    // Device circle visuals
    this.deviceRadius = 20;
    this.deviceRingGap = 20;
    
    // Race state
    this._raceState = 'warmup_countdown'; // 'warmup_countdown' | 'warmup' | 'countdown' | 'racing' | 'won'
    this._round = 1; // 1 = warmup, 2 = real race
    this._winner = null;
    this._confetti = [];
    this._waitingFrames = 0;
    this._waitingFramesNeeded = 120; // ~2 seconds at 60fps
    this._confettiSpawnTimer = 0;
    this._confettiSpawnInterval = 3; // Spawn confetti every 3 frames
    this._countdownNumber = 3;
    this._countdownFrames = 0;
    this._countdownFramesNeeded = 60; // 1 second per number
    this._allReachedFinishInWarmup = false;
    this._warmupCountdownPhase = 'practice'; // 'practice' | '1' | '2' | '3' | 'start'
    
    // Movement parameters
    this.horizontalGain = 1.5;
    this.deadzone = 0.05;
    this.maxSpeed = 4.0;
    this.friction = 0.95;
    
    // Race boundaries
    this.startX = 0;
    this.finishX = 0;
    this.trackY = 0;
    }
  
    setup() {
    // Clear team assignments when entering scene
    this._teamById.clear();
    this._lastLedHexById.clear();
    
    // Initialize rain layer
    this.starLayer = createGraphics(width, height);
    this.starLayer.pixelDensity(1);
    // Reduced particle count for better performance
    this.starCap = Math.min(width * 3, 2000);
    this.stars = new Array(this.starCap);
    
    // Initialize obstacles grid
    this.obstacles = [];
    this._grid = null;
    
    // Initialize race state
    this._raceState = 'warmup_countdown';
    this._round = 1;
    this._winner = null;
    this._confetti = [];
    this._waitingFrames = 0;
    this._confettiSpawnTimer = 0;
    this._countdownNumber = 3;
    this._countdownFrames = 0;
    this._allReachedFinishInWarmup = false;
    this._warmupCountdownPhase = 'practice';
    
    // Set up planet positions and track
    this.startX = width * 0.1;
    this.finishX = width * 0.9;
    const thirdHeight = height / 3;
    this.planets.blue.y = thirdHeight;
    this.planets.red.y = thirdHeight * 2;
    this.planets.green.y = thirdHeight * 1.5;
    this.trackY = height / 2;
    
    // Start planets at left
    this.planets.blue.x = this.startX;
    this.planets.red.x = this.startX;
    this.planets.green.x = this.startX;
    
    // Initialize planet sizes and warmup tracking
      for (const key of ['blue', 'red', 'green']) {
      this.planets[key].r = 80;
      this.planets[key].velocityX = 0;
      this.planets[key].hasReachedFinish = false;
      this.planets[key].isReturningToStart = false;
      this.planets[key].isAtStart = false;
    }
  }
  
    _assignTeamsEqual(devices) {
      const ids = devices.map((d) => d.getSensorData?.().id ?? d.id ?? d);
      const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
      const n = sorted.length;
      const t1 = Math.ceil(n / 3);
      const t2 = Math.ceil((2 * n) / 3);
      const blueSet = new Set(sorted.slice(0, t1));
      const redSet = new Set(sorted.slice(t1, t2));
      for (const id of sorted) {
        const team = blueSet.has(id) ? 'blue' : redSet.has(id) ? 'red' : 'green';
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
        const team = this._teamById.get(id) || 'blue';
        const color = this.colors[team];
        const last = this._lastLedHexById.get(id);
        if (!last || last.toLowerCase() !== color.hex.toLowerCase()) {
          try { this.deviceManager.sendCommandToDevice(id, 'led', color.hex); } catch (_) {}
          this._lastLedHexById.set(id, color.hex);
        }
      }
    }
  
    _normAccel(v) {
      if (v == null) return 0;
      if (v >= -1.5 && v <= 1.5) return constrain(v, -1, 1);
      if (v >= -20 && v <= 20) return constrain(v / 9.81, -1, 1);
      if (v >= 0 && v <= 255) return constrain((v - 127.5) / 127.5, -1, 1);
      return constrain(v, -1, 1);
    }
  
  _spawnStars(n = 2) {
    // Further reduced spawn rate for better performance
    for (let i = 0; i < n; i++) {
      const idx = this.t % this.starCap;
      // Rain from right to left (horizontal)
      this.stars[idx] = {
        x: width + random(0, 50), // Start from right edge
        y: random(0, height),
        vx: random(-3, -1), // Move left (negative x)
        vy: random(-0.3, 0.3),
        s: 2.5, // Smaller size for performance
      };
      this.t++;
    }
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

  _moveStar(p) {
    // Horizontal rain movement (right to left)
    let nx = p.x + p.vx;
    let ny = p.y + p.vy * 0.5;
    
    // Check collision with obstacles (planets) - like RainyDaySingle.js
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
    
    // Remove if off screen
    if (p.x < -50 || p.y < -50 || p.y > height + 50) {
      p.x = -999; // Mark for removal
    }
    
    p.s *= 0.998;
  }

  _updatePlanets(devices) {
      const byTeam = { blue: [], red: [], green: [] };
    for (const dev of devices) {
        const id = dev.getSensorData?.().id ?? dev.id ?? dev;
        const team = this._teamById.get(id) || 'blue';
      byTeam[team].push({ dev, id, sensor: dev.getSensorData?.() || {} });
    }
    
    // Update each planet's velocity based on team's average tilt
    for (const team of ['blue', 'red', 'green']) {
      const teamDevs = byTeam[team];
      const planet = this.planets[team];
      
      if (teamDevs.length > 0 && this._raceState !== 'won' && 
          this._raceState !== 'warmup_countdown' && this._raceState !== 'countdown') {
        // Calculate average horizontal tilt (ay controls left/right)
        let avgAy = 0;
        for (const { sensor } of teamDevs) {
          const ay = this._normAccel(sensor.ay ?? sensor.aY ?? sensor.accY);
          avgAy += ay;
        }
        avgAy /= teamDevs.length;
        
      // Update velocity - allow left and right movement based on tilt
      if (Math.abs(avgAy) > this.deadzone) {
        planet.velocityX += avgAy * this.horizontalGain; // Both left and right allowed
      }
      }
      
      // Apply friction
      planet.velocityX *= this.friction;
      // Allow both left and right movement (but constrain during waiting)
      if (this._raceState === 'waiting') {
        planet.velocityX = Math.min(0, planet.velocityX); // Only left during waiting
      }
      // Lock planets at start during countdown
      if (this._raceState === 'countdown') {
        planet.x = this.startX; // Exactly on start line
        planet.velocityX = 0; // No movement
      } else {
        // Allow both left and right movement in warmup and racing
        planet.velocityX = constrain(planet.velocityX, -this.maxSpeed, this.maxSpeed);
        
        // Update position
        planet.x += planet.velocityX;
        
        // Keep within bounds
        planet.x = constrain(planet.x, this.startX, this.finishX);
      }
      
      // Handle state transitions
      if (this._raceState === 'warmup') {
        // Warmup round: planets can move freely to the finish
        // When planet reaches finish, mark it and show confetti
        if (planet.x >= this.finishX - 20 && !planet.hasReachedFinish) {
          planet.hasReachedFinish = true;
          planet.isReturningToStart = false;
          planet.isAtStart = false;
          // Create small confetti at finish
          this._createWarmupConfetti(team);
        }
        
        // If planet has reached finish and is now back at start, mark it as at start
        if (planet.hasReachedFinish && planet.x <= this.startX + 10) {
          planet.x = this.startX;
          planet.isAtStart = true;
          // Allow some movement but keep near start
          if (planet.x < this.startX) {
            planet.x = this.startX;
          }
        }
        
        // Normal movement - can move freely (including back to start after reaching finish)
        // If reached right edge, allow bouncing back or staying
        if (planet.x >= this.finishX - 10 && planet.velocityX > 0) {
          planet.x = this.finishX - 10; // Prevent overshoot
          planet.velocityX *= -0.5; // Bounce back slightly
        }
        // If reached left edge, allow bouncing or staying
        if (planet.x <= this.startX + 10 && planet.velocityX < 0) {
          planet.x = this.startX + 10; // Prevent overshoot
          planet.velocityX *= -0.5; // Bounce back slightly
        }
        
        // If planet is at start after reaching finish, limit movement but don't completely lock
        if (planet.isAtStart) {
          if (planet.x > this.startX + 15) {
            // If moved too far from start, allow movement but encourage staying
            planet.velocityX *= 0.8;
          }
        }
      } else if (this._raceState === 'waiting') {
        // Keep at start position - prevent any rightward movement
        planet.velocityX = Math.min(0, planet.velocityX);
        if (planet.x <= this.startX + 10) {
          planet.x = this.startX;
          planet.velocityX = 0;
        } else {
          planet.velocityX = -2; // Move back to start
        }
      } else if (this._raceState === 'racing') {
        // Racing: check for win (only if at finish line and moving right or stopped)
        if (planet.x >= this.finishX - 20 && planet.velocityX >= 0 && !this._winner) {
          this._winner = team;
          this._raceState = 'won';
          this._createConfetti(team);
        }
        // Allow bouncing at finish line
        if (planet.x >= this.finishX - 10 && planet.velocityX > 0) {
          planet.x = this.finishX - 10;
          planet.velocityX *= -0.5; // Bounce back slightly
        }
        // Allow bouncing at start line
        if (planet.x <= this.startX + 10 && planet.velocityX < 0) {
          planet.x = this.startX + 10;
          planet.velocityX *= -0.5; // Bounce back slightly
        }
      }
    }
    
    // Check warmup completion: all planets must reach finish and return to start
    if (this._raceState === 'warmup') {
      // Check if all planets are at the start (have reached finish and returned)
      const allAtStart = ['blue', 'red', 'green'].every(team => {
        const planet = this.planets[team];
        return planet.isAtStart; // Must have reached finish, returned, and stopped at start
      });
      
      // If all planets are back at start, transition to race countdown
      if (allAtStart) {
        this._raceState = 'countdown';
        this._round = 2; // Move to real race
        this._countdownNumber = 3;
        this._countdownFrames = 0;
        // Reset flags and ensure all planets are exactly at start line
        for (const team of ['blue', 'red', 'green']) {
          this.planets[team].hasReachedFinish = false;
          this.planets[team].isReturningToStart = false;
          this.planets[team].isAtStart = false;
          this.planets[team].x = this.startX; // Exactly on start line
          this.planets[team].velocityX = 0; // Reset velocity
        }
      }
    }
    
    // Handle warmup countdown: Practice Round, then 1, 2, 3, START
    if (this._raceState === 'warmup_countdown') {
      this._countdownFrames++;
      if (this._countdownFrames >= this._countdownFramesNeeded) {
        this._countdownFrames = 0;
        if (this._warmupCountdownPhase === 'practice') {
          this._warmupCountdownPhase = '3';
        } else if (this._warmupCountdownPhase === '3') {
          this._warmupCountdownPhase = '2';
        } else if (this._warmupCountdownPhase === '2') {
          this._warmupCountdownPhase = '1';
        } else if (this._warmupCountdownPhase === '1') {
          this._warmupCountdownPhase = 'start';
        } else if (this._warmupCountdownPhase === 'start') {
          // Warmup countdown finished, start warmup
          this._raceState = 'warmup';
          this._countdownNumber = 3; // Reset for race countdown later
          this._warmupCountdownPhase = 'practice'; // Reset for next time
        }
      }
    }
    
    // Handle race countdown: 1, 2, 3, START
    if (this._raceState === 'countdown') {
      this._countdownFrames++;
      if (this._countdownFrames >= this._countdownFramesNeeded) {
        this._countdownFrames = 0;
        if (this._countdownNumber > 0) {
          this._countdownNumber--;
      } else {
          // Countdown finished, start race - ensure all planets are exactly at start line
          for (const team of ['blue', 'red', 'green']) {
            this.planets[team].x = this.startX; // Exactly on start line
            this.planets[team].velocityX = 0; // Reset velocity
          }
          this._raceState = 'racing';
        }
      }
    }
  }

  _createConfetti(team) {
    const color = this.colors[team];
    // Spawn more confetti particles
    for (let i = 0; i < 80; i++) {
      this._confetti.push({
        x: this.finishX,
        y: height / 2,
        vx: random(-10, 10),
        vy: random(-12, -2),
        size: random(8, 16),
        color: color.rgb,
        rotation: random(0, TWO_PI),
        rotationSpeed: random(-0.3, 0.3),
      });
    }
  }

  _createWarmupConfetti(team) {
    const color = this.colors[team];
    const planet = this.planets[team];
    // Spawn small confetti at planet position
    for (let i = 0; i < 30; i++) {
      this._confetti.push({
        x: planet.x,
        y: planet.y,
        vx: random(-5, 5),
        vy: random(-8, -2),
        size: random(6, 12),
        color: color.rgb,
        rotation: random(0, TWO_PI),
        rotationSpeed: random(-0.3, 0.3),
      });
    }
  }

  _spawnConfetti(team) {
    // Continuously spawn confetti during win state
    const color = this.colors[team];
    this._confettiSpawnTimer++;
    if (this._confettiSpawnTimer >= this._confettiSpawnInterval) {
      this._confettiSpawnTimer = 0;
      // Spawn from finish line and spread out
      for (let i = 0; i < 30; i++) {
        this._confetti.push({
          x: this.finishX + random(-50, 50),
          y: height / 2 + random(-100, 100),
          vx: random(-10, 10),
          vy: random(-12, -2),
          size: random(8, 16),
          color: color.rgb,
          rotation: random(0, TWO_PI),
          rotationSpeed: random(-0.3, 0.3),
        });
      }
    }
  }

  _drawFinishFlag() {
    push();
    const flagY = height * 0.12; // A bit lower than top (12% from top)
    const flagPoleHeight = 120;
    const flagWidth = 80;
    const flagHeight = 60;
    
    // Draw flag pole
    stroke(150);
    strokeWeight(6);
    line(this.finishX, flagY, this.finishX, flagY + flagPoleHeight);
    
    // Draw checkered flag (black and white)
    noStroke();
    const squareSize = 15;
    for (let col = 0; col < flagWidth; col += squareSize) {
      for (let row = 0; row < flagHeight; row += squareSize) {
        const colIdx = Math.floor(col / squareSize);
        const rowIdx = Math.floor(row / squareSize);
        if ((colIdx + rowIdx) % 2 === 0) {
          fill(0, 0, 0); // Black
        } else {
          fill(255, 255, 255); // White
        }
        rect(this.finishX + 6, flagY + row, squareSize, squareSize);
      }
    }
    
    pop();
  }

  _updateConfetti() {
    for (const c of this._confetti) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.3; // Gravity
      c.rotation += c.rotationSpeed;
      c.vx *= 0.98; // Air resistance
    }
    // Remove off-screen confetti (allow larger bounds for confetti)
    this._confetti = this._confetti.filter(c => 
      c.x >= -100 && c.x <= width + 100 && c.y <= height + 100
    );
    
    // Limit confetti count for performance (keep max 500 particles)
    if (this._confetti.length > 500) {
      this._confetti = this._confetti.slice(-500);
    }
  }

  draw() {
    background(20, 30, 40); // dark blue-gray sky
    
    const dm = this.deviceManager;
    const devs = [...dm.getAllDevices().values()];
    
    // Assign teams and sync LED colors
    this._assignTeamsEqual(devs);
    this._syncControllerColors(devs);
    
    // Update planets
    this._updatePlanets(devs);
    
    // Draw track lines
    push();
    stroke(100, 100, 100, 100);
    strokeWeight(2);
    line(this.startX, this.planets.blue.y, this.finishX, this.planets.blue.y);
    line(this.startX, this.planets.red.y, this.finishX, this.planets.red.y);
    line(this.startX, this.planets.green.y, this.finishX, this.planets.green.y);
    
    // Draw clear start line
    // Start line (yellow, thicker)
    stroke(255, 255, 0);
    strokeWeight(5);
    line(this.startX, 0, this.startX, height);
    // Add text labels
    fill(255, 255, 0);
    textSize(24);
    textAlign(CENTER);
    text('START', this.startX, height - 20);
    pop();
    
    // Build obstacles from planets for rain collision
    this.obstacles.length = 0;
    for (const key of ['blue', 'red', 'green']) {
      const planet = this.planets[key];
      this.obstacles.push({ x: planet.x, y: planet.y, r: planet.r });
    }
    this._buildObstacleGrid();
    
    // Draw rain (horizontal, right to left)
    this._drawStars();
    
    // Draw planets
    for (const key of ['blue', 'red', 'green']) {
      const planet = this.planets[key];
      const color = this.colors[key];
      
      push();
      fill(...color.rgb);
      noStroke();
      ellipse(planet.x, planet.y, planet.r * 2);
      pop();
    }
    
    // Draw device circles inside planets
    const byTeam = { blue: [], red: [], green: [] };
    for (const dev of devs) {
      const id = dev.getSensorData?.().id ?? dev.id ?? dev;
      const team = this._teamById.get(id) || 'blue';
      byTeam[team].push({ dev, id, sensor: dev.getSensorData?.() || {} });
    }
    
      for (const key of ['blue', 'red', 'green']) {
        const teamDevs = byTeam[key];
        if (teamDevs.length === 0) continue;
      const planet = this.planets[key];
      const ringR = planet.r * 0.6;
      
        for (let i = 0; i < teamDevs.length; i++) {
        const { sensor } = teamDevs[i];
        const angle = (i / Math.max(1, teamDevs.length)) * TWO_PI;
        const x = planet.x + Math.cos(angle) * ringR;
        const y = planet.y + Math.sin(angle) * ringR;
        
        push();
        fill(255);
        noStroke();
        ellipse(x, y, this.deviceRadius * 2);
        pop();
      }
    }
    
    // Draw confetti (both warmup finish confetti and winner confetti)
    if (this._confetti.length > 0) {
      if (this._raceState === 'won' && this._winner) {
        this._spawnConfetti(this._winner);
      }
      this._updateConfetti();
      for (const c of this._confetti) {
        push();
        translate(c.x, c.y);
        rotate(c.rotation);
        fill(...c.color);
        noStroke();
        rect(-c.size / 2, -c.size / 2, c.size, c.size);
        pop();
      }
    }
    
    // Draw finish flag (in front of everything)
    this._drawFinishFlag();
    
    // Draw UI
    fill(255);
    noStroke();
    textSize(16);
    textAlign(LEFT);
    let stateText = 'Round 1: Warming Up';
    
    if (this._raceState === 'warmup_countdown') {
      // Show warmup countdown: Practice Round, then 1, 2, 3, START
      fill(255, 255, 0);
      textAlign(CENTER);
      let countdownText = '';
      let textSizeValue = 80;
      
      if (this._warmupCountdownPhase === 'practice') {
        countdownText = 'Practice Round';
        textSizeValue = 60;
      } else if (this._warmupCountdownPhase === '3' || 
                 this._warmupCountdownPhase === '2' || 
                 this._warmupCountdownPhase === '1') {
        countdownText = this._warmupCountdownPhase;
        textSizeValue = 120;
      } else if (this._warmupCountdownPhase === 'start') {
        countdownText = 'START!';
        textSizeValue = 100;
      }
      
      textSize(textSizeValue);
      text(countdownText, width / 2, height / 2);
      fill(255);
      textSize(16);
      textAlign(LEFT);
    } else if (this._raceState === 'warmup') {
      // Show message when any planet has reached finish
      const anyReachedFinish = ['blue', 'red', 'green'].some(team => {
        return this.planets[team].hasReachedFinish;
      });
      const allAtStart = ['blue', 'red', 'green'].every(team => {
        return this.planets[team].isAtStart;
      });
      
      if (anyReachedFinish && !allAtStart) {
        // Show message when at least one planet reached finish but not all are back at start
        fill(255, 255, 0);
        textSize(32);
        textAlign(CENTER);
        text('Raak de finish line en ga dan terug naar de start', width / 2, height / 2);
        fill(255);
        textSize(16);
        textAlign(LEFT);
      }
    } else if (this._raceState === 'countdown') {
      // Show race countdown: 1, 2, 3, START
      fill(255, 255, 0);
      textSize(120);
      textAlign(CENTER);
      if (this._countdownNumber > 0) {
        text(this._countdownNumber.toString(), width / 2, height / 2);
      } else {
        text('START!', width / 2, height / 2);
      }
      fill(255);
      textSize(16);
      textAlign(LEFT);
    } else if (this._raceState === 'racing') {
      stateText = `Round ${this._round}: RACE!`;
    } else if (this._raceState === 'won') {
      stateText = `${this._winner.toUpperCase()} WINS!`;
    }
    
    // Top left text removed
  }

  _drawStars() {
    this._spawnStars(2); // Reduced spawn rate
    const L = this.starLayer;
    L.push();
    L.background(0, 15); // Slightly stronger fade (no blur for performance)
    
    L.stroke(200, 220, 255, 160); // Slightly more transparent
    L.noFill();
    
    // Pre-filter particles for better performance
    const activeParticles = [];
    for (const p of this.stars) {
      if (!p || p.x < -999) continue;
      if (p.x < -50 || p.y < -50 || p.y > height + 50 || p.s < 0.1) {
        continue;
      }
      activeParticles.push(p);
    }
    
    // Move and draw in one pass
    for (const p of activeParticles) {
      this._moveStar(p);
      
      // Only draw if on screen after movement
      if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height && p.s > 0.1) {
        L.strokeWeight(p.s);
        L.point(p.x, p.y);
        
        // Horizontal streak (only if significant velocity, reduced length)
        if (p.vx < -1.0) {
          const streakLen = Math.min(Math.abs(p.vx) * 1.5, 10);
          L.line(p.x + streakLen, p.y, p.x, p.y);
        }
      }
    }
    
    L.pop();
    image(L, 0, 0);
  }
}