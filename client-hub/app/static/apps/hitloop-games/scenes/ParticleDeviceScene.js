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
        this.particleColor = color(100, 150, 255, 100);
        
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
    constructor(deviceId, deviceManager, availableColors) {
        this.id = deviceId;
        this.deviceManager = deviceManager;
        this.availableColors = availableColors;
        
        // Physical properties
        this.radius = 30;
        this.shrinkRadius = 15;
        this.shrinkDuration = 300; // milliseconds
        
        // Position and movement
        this.position = {
            x: random(this.radius, width - this.radius),
            y: height / 2 // Start at center height
        };
        this.velocity = {
            vx: random(-1, 1),
            vy: 0 // No initial vertical velocity
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
    
    update(sensorData) {
        // Check for tap sensor input
        if (sensorData.tap && sensorData.tap > 0) {
            this.handleTap();
        }
        
        // Convert accelerometer data to g-force units
        // Mapping: 0 = -2g, 255 = +2g
        const aX_g = ((sensorData.ax || 0) / 255.0) * 4.0 - 2.0; // Convert to g-force
        const aY_g = ((sensorData.ay || 0) / 255.0) * 4.0 - 2.0; // Convert to g-force
        
        // Map g-force to velocity (inverted X-axis)
        const maxVel = 3.0;
        this.velocity.vx = -(aX_g - 0) * maxVel; // Inverted X-axis
        this.velocity.vy = (aY_g - 0) * maxVel;
        
        // Add some damping to prevent excessive movement
        this.velocity.vx *= 0.95;
        this.velocity.vy *= 0.95;
        
        // Update position based on velocity
        this.position.x += this.velocity.vx;
        this.position.y += this.velocity.vy;
        
        // Bounce off edges
        if (this.position.x <= this.radius || this.position.x >= width - this.radius) {
            this.velocity.vx *= -0.8; // Damping on bounce
            this.position.x = constrain(this.position.x, this.radius, width - this.radius);
        }
        if (this.position.y <= this.radius || this.position.y >= height - this.radius) {
            this.velocity.vy *= -0.8; // Damping on bounce
            this.position.y = constrain(this.position.y, this.radius, height - this.radius);
        }
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
        
        // Draw device circle with assigned color
        if (this.assignedColor) {
            fill(...this.assignedColor.rgb);
        } else {
            fill(255, 255, 255); // Default white if no color assigned
        }
        noStroke();
        ellipse(this.position.x, this.position.y, currentRadius * 2);
        
        // Draw device ID
      
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

class ParticleDeviceScene extends Scene {
    constructor(deviceManager) {
        super(deviceManager);
        this.particleSystem = new ParticleSystem();
        this.deviceCircles = new Map(); // Store DeviceCircle instances
        
        // Available colors for device assignment
        this.availableColors = [
            { name: 'red', rgb: [255, 0, 0], hex: 'ff0000' },
            { name: 'green', rgb: [0, 255, 0], hex: '00ff00' },
            { name: 'blue', rgb: [0, 0, 255], hex: '0000ff' },
            { name: 'yellow', rgb: [255, 255, 0], hex: 'ffff00' },
            { name: 'cyan', rgb: [0, 255, 255], hex: '00ffff' },
            { name: 'magenta', rgb: [255, 0, 255], hex: 'ff00ff' },
            { name: 'orange', rgb: [255, 165, 0], hex: 'ffa500' }
        ];
    }
    
    setup() {
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
            const deviceCircle = new DeviceCircle(deviceId, this.deviceManager, this.availableColors);
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
            deviceCircle.update(data);
        }
        
        // Remove device circles that are no longer present
        const currentIds = new Set(devices.map(dev => dev.getSensorData().id));
        for (const id of this.deviceCircles.keys()) {
            if (!currentIds.has(id)) {
                this.deviceCircles.delete(id);
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
