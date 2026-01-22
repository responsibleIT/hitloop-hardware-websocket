class TeamDeviceCircle {
    constructor(deviceId, deviceManager, particleSystem) {
        this.id = deviceId;
        this.deviceManager = deviceManager;
        this.particleSystem = particleSystem;
        
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
    }
    
    initialize(color) {
        // Assign provided team color
        this.assignedColor = color;
        // Send commands to device
        // try {
        //     // this.deviceManager.sendCommandToDevice(this.id, 'pattern', 'solid');
        // } catch (_) {}
        try {
            this.deviceManager.sendCommandToDevice(this.id, 'led', color.hex);
        } catch (_) {}
    }
    
    setColor(color) {
        if (!this.assignedColor || this.assignedColor.hex.toLowerCase() !== color.hex.toLowerCase()) {
            this.assignedColor = color;
            try {
                this.deviceManager.sendCommandToDevice(this.id, 'led', color.hex);
            } catch (_) {}
        }
    }
    
    update(sensorData) {
        // Check for tap sensor input
        if (sensorData && sensorData.tap && sensorData.tap > 0) {
            this.particleSystem.launchOverlappingParticles(this.x, this.y, this.radius);
        }
        
        // Convert accelerometer data to g-force units
        const aX_g = ((sensorData?.ax || 0) / 255.0) * 4.0 - 2.0; // Convert to g-force
        const aY_g = ((sensorData?.ay || 0) / 255.0) * 4.0 - 2.0; // Convert to g-force
        
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
        // Scene hook optional
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
            fill(255, 255, 255);
        }
        noStroke();
        ellipse(this.position.x, this.position.y, currentRadius * 2);
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

class TwoTeamsScene2 extends Scene {
    constructor(deviceManager) {
        super(deviceManager);
        this.redParticleSystem = new ParticleSystem();
        this.blueParticleSystem = new ParticleSystem();        
        this.deviceCircles = new Map(); // Store DeviceCircle instances
        this.colors = {
            red: { name: 'red', rgb: [255, 0, 0], hex: 'ff0000' },
            blue: { name: 'blue', rgb: [0, 0, 255], hex: '0000ff' }
        };
        this._teamById = new Map();
    }
    
    setup() {
        this.blueParticleSystem.setup();
        
        this.redParticleSystem.setup();
        this.redParticleSystem.setColor(color(255, 150, 100, 100));
        this.deviceCircles.clear();
        this._teamById.clear();
        const devices = Array.from(this.deviceManager.getAllDevices().values());
        this._assignTeamsEqual(devices);
        for (const device of devices) {
            const id = device.getSensorData?.().id ?? device.id ?? device;
            this.createOrUpdateDeviceCircle(id);
        }
    }
    
    _assignTeamsEqual(devs) {
        const ids = devs.map((d) => d.getSensorData?.().id ?? d.id ?? d);
        const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
        const n = sorted.length;
        const blueCount = Math.floor(n / 2);
        const blueSet = new Set(sorted.slice(0, blueCount));
        for (const id of ids) this._teamById.set(id, blueSet.has(id) ? 'blue' : 'red');
    }

    _teamColorFor(id) {
        const team = this._teamById.get(id) || 'blue';
        return this.colors[team];
    }

    createOrUpdateDeviceCircle(deviceId) {
        const color = this._teamColorFor(deviceId);
        if (!this.deviceCircles.has(deviceId)) {
            let ps = color === 'blue' ? this.blueParticleSystem : this.redParticleSystem;
            const deviceCircle = new TeamDeviceCircle(deviceId, this.deviceManager, ps);
            deviceCircle.initialize(color);
            this.deviceCircles.set(deviceId, deviceCircle);
        } else {
            const dc = this.deviceCircles.get(deviceId);
            dc.setColor(color);
        }
    }
    
    updateDevicePositions() {
        const devices = Array.from(this.deviceManager.getAllDevices().values());
        // Reassign teams on any membership change
        const currentIds = devices.map((dev) => dev.getSensorData?.().id ?? dev.id ?? dev);
        const present = new Set(currentIds);
        // Remove missing
        for (const id of [...this.deviceCircles.keys()]) {
            if (!present.has(id)) {
                this.deviceCircles.delete(id);
                this._teamById.delete(id);
            }
        }
        // If counts changed or new devices present, recompute teams for fairness
        this._assignTeamsEqual(devices);
        for (const device of devices) {
            const id = device.getSensorData?.().id ?? device.id ?? device;
            // ensure circle exists and color matches team
            this.createOrUpdateDeviceCircle(id);
            // Update motion from sensor data if available
            const dc = this.deviceCircles.get(id);
            const data = device.getSensorData?.() ?? {};
            dc.update(data);
        }
    }
    
    draw() {
        clear();
        background(0);
        
        // Update device positions, teams, and colors
        this.updateDevicePositions();
        
        // Update particle system
        this.blueParticleSystem.update();
        this.redParticleSystem.update();
        
        // Draw particles with ADD blend mode for glowing effect
        blendMode(ADD);
        this.blueParticleSystem.draw();
        this.redParticleSystem.draw();
        
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
        text(`Devices: ${this.deviceManager.getDeviceCount?.() ?? this.deviceCircles.size}`, 10, 10);
        //text(`Particles: ${this.particleSystem.particles.length}`, 10, 30);
        text('Devices split into blue (first half) and red (second half).', 10, height - 20);
        
        for (const [id, deviceCircle] of this.deviceCircles) {
            fill(0);
            textAlign(CENTER, CENTER);
            textSize(12);
            text(id, deviceCircle.position.x, deviceCircle.position.y);
        }
    }
}

