class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.rotation = 0;
        this.size = random(140, 180);
        this.bounces = 0;
        this.maxBounces = random(3, 6);
        this.isMoving = false;
        this.particleColor = color(65, 98, 166, 100); // Reduced brightness (65% of original blue)
        
        // Create 4 vertices around center with random offsets
        this.vertices = [];
        for (let i = 0; i < 4; i++) {
            const angle = (i * PI) / 2 + random(-0.3, 0.3);
            const distance = random(this.size * 0.3, this.size * 0.5);
            this.vertices.push({
                x: cos(angle) * distance,
                y: sin(angle) * distance
            });
        }
    }
    
    update() {
        if (!this.isMoving) return;
        
        // Apply gravity
        this.vy += 0.2;
        
        // Update position
        this.x += this.vx;
        this.y += this.vy;
        
        // Update rotation
        this.rotation += this.angularVelocity;
        
        // Bounce on bottom edge
        if (this.y >= height - 10) {
            this.y = height - 10;
            this.vy *= -0.6; // Damping
            this.vx *= 0.8; // Friction
            this.bounces++;
            
            // Stop moving after max bounces
            if (this.bounces >= this.maxBounces) {
                this.isMoving = false;
                this.vx = 0;
                this.vy = 0;
                this.angularVelocity = 0;
            }
        }
        
        // Keep particles within canvas bounds
        this.x = constrain(this.x, 0, width);
    }
    
    draw() {
        push();
        translate(this.x, this.y);
        rotate(this.rotation);
        
        // Draw blue polygon with transparency
        fill(this.particleColor);
        noStroke();
        
        beginShape();
        for (const v of this.vertices) {
            vertex(v.x, v.y);
        }
        endShape(CLOSE);
        
        pop();
    }
    
    // Check if any vertex is within a circle
    isOverlapping(circleX, circleY, radius) {
        for (const v of this.vertices) {
            const worldX = this.x + cos(this.rotation) * v.x - sin(this.rotation) * v.y;
            const worldY = this.y + sin(this.rotation) * v.x + cos(this.rotation) * v.y;
            const distance = dist(worldX, worldY, circleX, circleY);
            if (distance <= radius) {
                return true;
            }
        }
        return false;
    }
    
    // Launch particle away from a point
    launch(fromX, fromY, force = 5) {
        const angle = atan2(this.y - fromY, this.x - fromX);
        const distance = dist(this.x, this.y, fromX, fromY);
        const normalizedForce = force * (1 + random(-0.3, 0.3));
        
        this.vx = cos(angle) * normalizedForce;
        this.vy = sin(angle) * normalizedForce - random(2, 4); // Upward bias
        this.angularVelocity = random(-0.3, 0.3);
        this.isMoving = true;
        this.bounces = 0;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.maxParticles = 1000;
        this.minDistance = 40; // Minimum distance between particles
    }
    
    setup() {
        // Use Poisson-disc sampling to distribute particles        
        this.particles = this.generatePoissonDisc();
    }
    

    setColor(newColor){
        for (const particle of this.particles) {
            particle.particleColor = newColor;
        }
    }

    generatePoissonDisc() {
        const particles = [];
        const grid = [];
        const cellSize = this.minDistance / Math.sqrt(2);
        const gridWidth = Math.ceil(width / cellSize);
        const gridHeight = Math.ceil(height / cellSize);
        
        // Initialize grid
        for (let i = 0; i < gridWidth * gridHeight; i++) {
            grid[i] = -1;
        }
        
        const activeList = [];
        
        // Add first particle randomly
        const firstX = random(0, width);
        const firstY = random(0, height);
        const firstParticle = new Particle(firstX, firstY);
        particles.push(firstParticle);
        activeList.push(0);
        
        const gridX = Math.floor(firstX / cellSize);
        const gridY = Math.floor(firstY / cellSize);
        grid[gridY * gridWidth + gridX] = 0;
        
        while (activeList.length > 0 && particles.length < this.maxParticles) {
            const randomIndex = Math.floor(random(activeList.length));
            const pointIndex = activeList[randomIndex];
            const point = particles[pointIndex];
            
            let found = false;
            
            // Try to find a new point around the current point
            for (let i = 0; i < 30; i++) {
                const angle = random(TWO_PI);
                const radius = random(this.minDistance, this.minDistance * 2);
                const newX = point.x + Math.cos(angle) * radius;
                const newY = point.y + Math.sin(angle) * radius;
                
                // Check if point is within bounds
                if (newX < 0 || newX >= width || newY < 0 || newY >= height) {
                    continue;
                }
                
                const newGridX = Math.floor(newX / cellSize);
                const newGridY = Math.floor(newY / cellSize);
                
                // Check if point is far enough from existing points
                let valid = true;
                for (let dx = -2; dx <= 2 && valid; dx++) {
                    for (let dy = -2; dy <= 2 && valid; dy++) {
                        const checkX = newGridX + dx;
                        const checkY = newGridY + dy;
                        
                        if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
                            const neighborIndex = grid[checkY * gridWidth + checkX];
                            if (neighborIndex !== -1) {
                                const neighbor = particles[neighborIndex];
                                const distance = Math.sqrt((newX - neighbor.x) ** 2 + (newY - neighbor.y) ** 2);
                                if (distance < this.minDistance) {
                                    valid = false;
                                }
                            }
                        }
                    }
                }
                
                if (valid) {
                    const newParticle = new Particle(newX, newY);
                    particles.push(newParticle);
                    activeList.push(particles.length - 1);
                    grid[newGridY * gridWidth + newGridX] = particles.length - 1;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                activeList.splice(randomIndex, 1);
            }
        }
        
        return particles;
    }
    
    update() {
        for (const particle of this.particles) {
            particle.update();
        }
    }
    
    draw() {
        for (const particle of this.particles) {
            particle.draw();
        }
    }
    
    // Launch particles that overlap with a device circle
    launchOverlappingParticles(deviceX, deviceY, deviceRadius) {
        for (const particle of this.particles) {
            if (particle.isOverlapping(deviceX, deviceY, deviceRadius)) {
                particle.launch(deviceX, deviceY);
            }
        }
    }
}

class DeviceCircle {
    constructor(deviceId, deviceManager, availableColors, movementParams) {
        this.id = deviceId;
        this.deviceManager = deviceManager;
        this.availableColors = availableColors;
        this.movementParams = movementParams || {
            deviceRadius: 40,
            horizontalGain: 2.5,
            verticalGain: 2.5,
            deadzone: 0.05,
            maxSpeed: 3.0,
            friction: 0.92,
        };
        
        // Physical properties
        this.radius = this.movementParams.deviceRadius;
        this.shrinkRadius = 15;
        this.shrinkDuration = 300; // milliseconds
        
        // Position and movement state (same as RainyDaySingle)
        this.position = {
            x: random(this.radius, width - this.radius),
            y: random(this.radius, height - this.radius),
        };
        this.velocity = {
            vx: 0,
            vy: 0,
        };
        
        // Visual properties
        this.assignedColor = null;
        this.shrinkTimer = null;
        
        // Initialize the device
        this.initialize();
    }
    
    initialize() {
        // Assign random color
        const randomColor = this.availableColors[Math.floor(Math.random() * this.availableColors.length)];
        this.assignedColor = randomColor;
        
        // Send commands to device
        this.deviceManager.sendCommandToDevice(this.id, 'led', randomColor.hex);
    }
    
    _normAccel(v) {
        if (v == null) return 0;
        if (v >= -1.5 && v <= 1.5) return constrain(v, -1, 1);
        if (v >= -20 && v <= 20) return constrain(v / 9.81, -1, 1);
        if (v >= 0 && v <= 255) return constrain((v - 127.5) / 127.5, -1, 1);
        return constrain(v, -1, 1);
    }
    
    update(sensorData) {
        // Check for tap sensor input
        if (sensorData.tap && sensorData.tap > 0) {
            this.handleTap();
        }
        
        // Use same movement system as RainyDaySingle
        const ax = this._normAccel(sensorData.ax ?? sensorData.aX ?? sensorData.accX);
        const ay = this._normAccel(sensorData.ay ?? sensorData.aY ?? sensorData.accY);
        
        // Horizontal movement: ay controls left/right
        if (Math.abs(ay) > this.movementParams.deadzone) {
            this.velocity.vx += ay * this.movementParams.horizontalGain;
        }
        
        // Vertical movement: ax controls up/down
        if (Math.abs(ax) > this.movementParams.deadzone) {
            this.velocity.vy += -ax * this.movementParams.verticalGain; // negative because ax>0 should move up
        }
        
        // Apply friction and limits
        this.velocity.vx *= this.movementParams.friction;
        this.velocity.vy *= this.movementParams.friction;
        this.velocity.vx = constrain(this.velocity.vx, -this.movementParams.maxSpeed, this.movementParams.maxSpeed);
        this.velocity.vy = constrain(this.velocity.vy, -this.movementParams.maxSpeed, this.movementParams.maxSpeed);
        
        // Update position
        this.position.x += this.velocity.vx;
        this.position.y += this.velocity.vy;
        
        // Keep within bounds
        this.position.x = constrain(this.position.x, this.radius, width - this.radius);
        this.position.y = constrain(this.position.y, this.radius, height - this.radius);
    }
    
    handleTap() {
        // Shrink device temporarily
        this.shrinkTimer = millis();
        
        // Launch overlapping particles (this will be handled by the scene)
        this.onTapCallback && this.onTapCallback(this.position.x, this.position.y, this.radius);
    }
    
    setOnTapCallback(callback) {
        this.onTapCallback = callback;
    }
    
    draw() {
        // Check if device should be shrunk
        let currentRadius = this.radius;
        if (this.shrinkTimer && millis() - this.shrinkTimer < this.shrinkDuration) {
            const shrinkProgress = (millis() - this.shrinkTimer) / this.shrinkDuration;
            currentRadius = lerp(this.shrinkRadius, this.radius, shrinkProgress);
        }
        
        push();
        
        // Draw device circle with assigned color
        if (this.assignedColor) {
            fill(this.assignedColor.r, this.assignedColor.g, this.assignedColor.b);
        } else {
            fill(255, 255, 255); // Default white if no color assigned
        }
        noStroke();
        ellipse(this.position.x, this.position.y, currentRadius * 2);
        
        // Draw simple face (eyes) - same as RainyDaySingle
        // Get sensor data for eye movement (needs to be passed or stored)
        if (this.lastSensorData) {
            fill(255);
            const ax = this._normAccel(this.lastSensorData.ax ?? this.lastSensorData.aX ?? this.lastSensorData.accX);
            const ay = this._normAccel(this.lastSensorData.ay ?? this.lastSensorData.aY ?? this.lastSensorData.accY);
            const az = this._normAccel(this.lastSensorData.az ?? this.lastSensorData.aZ ?? this.lastSensorData.accZ);
            const m = 8 * (1 + 0.15 * az);
            const ex = ay * m;
            const ey = -ax * m;
            ellipse(this.position.x - 10, this.position.y - 8, 16, 16);
            ellipse(this.position.x + 10, this.position.y - 8, 16, 16);
            fill(0);
            ellipse(this.position.x - 10 + ex, this.position.y - 8 + ey, 8, 8);
            ellipse(this.position.x + 10 + ex, this.position.y - 8 + ey, 8, 8);
        }
        
        pop();
    }
    
    setSensorData(sensorData) {
        this.lastSensorData = sensorData;
    }
    
    getPosition() {
        return this.position;
    }
    
    getRadius() {
        return this.radius;
    }
    
    getAssignedColor() {
        return this.assignedColor;
    }
}

class Particles extends Scene {
    constructor(deviceManager) {
        super(deviceManager);
        this.particleSystem = new ParticleSystem();
        this.deviceCircles = new Map(); // Store DeviceCircle instances
        
        // Available colors for device assignment (same as RainyDaySingle)
        this.availableColors = [
            { r: 255, g: 0, b: 0, hex: 'ff0000' },      // red
            { r: 0, g: 136, b: 255, hex: '0088ff' },    // blue
            { r: 0, g: 255, b: 102, hex: '08ff0c' },    // green
            { r: 138, g: 43, b: 226, hex: '8a2be2' },   // purple
            { r: 255, g: 165, b: 0, hex: 'ff5500' },   // orange (more vibrant orange for LED)
            { r: 242, g: 242, b: 242, hex: 'ffffff' },  // white
        ];
        
        // Movement parameters (same as RainyDaySingle)
        this.movementParams = {
            deviceRadius: 40,
            horizontalGain: 2.5,
            verticalGain: 2.5,
            deadzone: 0.05,
            maxSpeed: 3.0,
            friction: 0.92,
        };
    }
    
    setup() {
        // Clear device circles so they get reassigned colors when entering this scene
        this.deviceCircles.clear();
        
        this.particleSystem.setup();
        // Initialize device circles
        const devices = Array.from(this.deviceManager.getAllDevices().values());
        for (const device of devices) {
            const id = device.getSensorData().id;
            this.createDeviceCircle(id);
        }
    }
    
    createDeviceCircle(deviceId) {
        if (!this.deviceCircles.has(deviceId)) {
            const deviceCircle = new DeviceCircle(deviceId, this.deviceManager, this.availableColors, this.movementParams);
            deviceCircle.setOnTapCallback((x, y, radius) => {
                this.particleSystem.launchOverlappingParticles(x, y, radius);
            });
            this.deviceCircles.set(deviceId, deviceCircle);
        }
    }
    
    updateDevicePositions() {
        const devices = Array.from(this.deviceManager.getAllDevices().values());
        
        for (const device of devices) {
            const data = device.getSensorData();
            const id = data.id;
            
            // Create device circle if it doesn't exist
            if (!this.deviceCircles.has(id)) {
                this.createDeviceCircle(id);
            }
            
            // Update the device circle
            const deviceCircle = this.deviceCircles.get(id);
            deviceCircle.setSensorData(data); // Store sensor data for eyes
            deviceCircle.update(data);
        }
        
        // Remove device circles that are no longer present
        const currentIds = new Set(devices.map(dev => dev.getSensorData().id));
        for (const id of this.deviceCircles.keys()) {
            if (!currentIds.has(id)) {
                this.deviceCircles.delete(id);
            }
        }
        
        // Resolve collisions between devices (same logic as RainyDaySingle)
        const deviceList = Array.from(this.deviceCircles.values());
        if (deviceList.length > 1) {
            const R = this.movementParams.deviceRadius;
            const minDist = R * 2;
            const minDistSq = minDist * minDist;
            
            for (let i = 0; i < deviceList.length; i++) {
                for (let j = i + 1; j < deviceList.length; j++) {
                    const a = deviceList[i];
                    const b = deviceList[j];
                    const dx = b.position.x - a.position.x;
                    const dy = b.position.y - a.position.y;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < minDistSq && distSq > 0) {
                        const dist = Math.sqrt(distSq);
                        const overlap = (minDist - dist) * 0.5;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        a.position.x -= nx * overlap;
                        a.position.y -= ny * overlap;
                        b.position.x += nx * overlap;
                        b.position.y += ny * overlap;
                        
                        // Keep inside bounds
                        a.position.x = constrain(a.position.x, R, width - R);
                        a.position.y = constrain(a.position.y, R, height - R);
                        b.position.x = constrain(b.position.x, R, width - R);
                        b.position.y = constrain(b.position.y, R, height - R);
                    }
                }
            }
        }
    }
    
    
    draw() {
        clear();
        background(0);
        
        // Update device positions
        this.updateDevicePositions();
        
        // Update particle system
        this.particleSystem.update();
        
        // Draw particles with ADD blend mode for glowing effect
        blendMode(ADD);
        this.particleSystem.draw();
        
        // Draw device circles with BLEND mode for normal rendering
        blendMode(BLEND);
        for (const deviceCircle of this.deviceCircles.values()) {
            deviceCircle.draw();
        }
    }
    
    drawDebugText() {
        // Draw debug information with BLEND mode
        blendMode(BLEND);
        fill(255);
        textAlign(LEFT, TOP);
        textSize(16);
        text(`Devices: ${this.deviceManager.getDeviceCount()}`, 10, 10);
        text(`Particles: ${this.particleSystem.particles.length}`, 10, 30);
        text('Tap devices to launch particles!', 10, height - 20);
        text('Press D to toggle debug info', 10, height - 40);

        for (const deviceCircle of this.deviceCircles.values()) {
              
        fill(0);
        textAlign(CENTER, CENTER);
        textSize(12);
        text(deviceCircle.id, deviceCircle.position.x, deviceCircle.position.y);
        }
    }
}
