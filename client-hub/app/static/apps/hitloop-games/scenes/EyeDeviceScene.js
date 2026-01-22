class EyeDevice {
    constructor(deviceId, deviceManager, existingEyes = []) {
        this.id = deviceId;
        this.deviceManager = deviceManager;
        
        // 3D position for the eye
        this.position = this.findValidPosition(existingEyes);
        
		// Eye components
		this.eyeRadius = 40;
		this.baseEyeRadius = this.eyeRadius;
		this.eyeStretch = 0; // displacement from rest (0 = rest)
		this.eyeStretchVelocity = 0;
		this.springK = 150; // spring constant
		this.springDamping = 1; // damping coefficient
		this.mass = 1; // mass of the spring system
		this.tapImpulse = 3.0; // impulse magnitude applied to velocity on tap
		this.wasTapped = false;
        this.irisRadius = 25;
        this.pupilRadius = 8;
		this.irisColor = [100, 150, 200];
        
        // Rotation angles calculated from accelerometer
        this.rotationX = 0;
        this.rotationY = 0;
        this.rotationZ = 0;
        
        // Smoothing for rotation changes
        this.targetRotationX = 0;
        this.targetRotationY = 0;
        this.targetRotationZ = 0;
        this.rotationSpeed = 0.1;
		this.lookTarget = null;
    }
    
    findValidPosition(existingEyes) {
        const minDistance = 80; // Minimum distance between eyes
        const maxAttempts = 50;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            const position = {
                x: random(-width/3, width/3),
                y: random(-300, 300),
                z: random(-200, 400) // Different z-positions for depth
            };
            
            // Check if this position is far enough from existing eyes
            let validPosition = true;
            for (const eye of existingEyes) {
                const distance = dist(
                    position.x, position.y, position.z,
                    eye.position.x, eye.position.y, eye.position.z
                );
                if (distance < minDistance) {
                    validPosition = false;
                    break;
                }
            }
            
            if (validPosition) {
                return position;
            }
            
            attempts++;
        }
        
        // If we can't find a valid position, place it with a unique z-offset
        return {
            x: random(-300, 300),
            y: random(-300, 300),
            z: random(-200, 200) + existingEyes.length * 50 // Stagger z-positions
        };
    }
    
	update(sensorData) {
		// Spring dynamics for eye stretch (Hooke's law)
		const dt = (typeof deltaTime !== 'undefined') ? (deltaTime / 1000) : (1 / 60);
		// Detect tap rising edge: expand by adding velocity impulse
		const tapped = Boolean(sensorData && sensorData.tap);
		if (tapped && !this.wasTapped) {
			this.eyeStretchVelocity += this.tapImpulse;
		}
		this.wasTapped = tapped;
		// Acceleration toward rest using Hooke's law: a = -(k/m) x - (c/m) v ; m=1
		const acc = (-this.springK * this.eyeStretch - this.springDamping * this.eyeStretchVelocity) / this.mass;
		this.eyeStretchVelocity += acc * dt;
		this.eyeStretch += this.eyeStretchVelocity * dt;
		// Prevent tiny drift
		if (Math.abs(this.eyeStretch) < 0.0001 && Math.abs(this.eyeStretchVelocity) < 0.0001) {
			this.eyeStretch = 0;
			this.eyeStretchVelocity = 0;
		}

		// If a look target is set, rotate to look at it; otherwise keep current rotation
		if (this.lookTarget) {
			const dx = this.lookTarget.x - this.position.x;
			const dy = this.lookTarget.y - this.position.y;
			const dz = this.lookTarget.z - this.position.z;
			// In p5 WEBGL, -Z is into the screen. Yaw around Y toward target, pitch around X.
			const yaw = atan2(dx, -dz);
			const distXZ = sqrt(dx * dx + dz * dz);
			const pitch = atan2(dy, distXZ);
			this.targetRotationY = yaw;
			this.targetRotationX = pitch;
		}
		// Smooth the rotation changes
		this.rotationX = lerp(this.rotationX, this.targetRotationX, this.rotationSpeed);
		this.rotationY = lerp(this.rotationY, this.targetRotationY, this.rotationSpeed);
	}

	setLookTarget(x, y, z) {
		this.lookTarget = { x, y, z };
	}
    
    draw() {
        push();
        
        // Move to eye position
        translate(this.position.x, this.position.y, this.position.z);
        
        // Apply rotations
        rotateX(this.rotationX);
        rotateY(this.rotationY);
        rotateZ(this.rotationZ);
		
		const scaleFactor = 1 + this.eyeStretch;
		scale(scaleFactor);
		// Draw the white eye sphere (sclera) with sharp specular highlight
		shininess(200);
		specularMaterial(255, 255, 255);
		noStroke();
		sphere(this.eyeRadius);
        
		// Draw the iris (flat sphere)
        push();
		translate(0, 0, this.eyeRadius * 0.75); // Move slightly forward
        scale(1, 1, 0.45); // Flatten the iris
		fill(this.irisColor[0], this.irisColor[1], this.irisColor[2]);
        noStroke();
		sphere(this.irisRadius);
        pop();
        
        // Draw the pupil (smaller flat sphere)
        push();
		translate(0, 0, this.eyeRadius * 1); // Move even more forward
        scale(1, 1, 0.4); // Flatten the pupil
        fill(0, 0, 0); // Black pupil
        noStroke();
        sphere(this.pupilRadius);
        pop();
        
        pop();
    }
    
    getPosition() {
        return this.position;
    }
    
    getId() {
        return this.id;
    }
}

class EyeDeviceScene extends Scene {
    constructor(deviceManager) {
        super(deviceManager);
        this.eyeDevices = new Map();
        this.lightPosition = { x: 0, y: -200, z: 200 };
        this.backLightPosition = { x: 0, y: 0, z: -400 }; // Bright light behind the eyes
    }
    
    setup() {
        // Initialize eye devices for existing devices
        const devices = Array.from(this.deviceManager.getAllDevices().values());
        for (const device of devices) {
            const id = device.getSensorData().id;
            this.createEyeDevice(id);
        }
    }
    
    createEyeDevice(deviceId) {
        if (!this.eyeDevices.has(deviceId)) {
            // Get existing eye devices for collision detection
            const existingEyes = Array.from(this.eyeDevices.values());
			const eyeDevice = new EyeDevice(deviceId, this.deviceManager, existingEyes);
			// Choose a random iris color and send LED command
			const namedColors = [
				{ name: 'red', rgb: [255, 0, 0], hex: 'ff0000' },
				{ name: 'green', rgb: [0, 255, 0], hex: '00ff00' },
				{ name: 'blue', rgb: [0, 0, 255], hex: '0000ff' },
				{ name: 'cyan', rgb: [0, 255, 255], hex: '00ffff' },
				{ name: 'magenta', rgb: [255, 0, 255], hex: 'ff00ff' },
				{ name: 'yellow', rgb: [255, 255, 0], hex: 'ffff00' },
				{ name: 'orange', rgb: [255, 128, 0], hex: 'ff8000' }
			];
			const choice = namedColors[Math.floor(Math.random() * namedColors.length)];
			eyeDevice.irisColor = choice.rgb;
			const manager = this.deviceManager;
			if (manager && typeof manager.sendCommandToDevice === 'function') {
				manager.sendCommandToDevice(deviceId, 'led', choice.hex);
			}
            this.eyeDevices.set(deviceId, eyeDevice);
        }
    }
    
    updateEyeDevices() {
        const devices = Array.from(this.deviceManager.getAllDevices().values());
        
        for (const device of devices) {
            const data = device.getSensorData();
            const id = data.id;
            
            // Create eye device if it doesn't exist
            if (!this.eyeDevices.has(id)) {
                this.createEyeDevice(id);
            }
            
            // Update the eye device
            const eyeDevice = this.eyeDevices.get(id);
            eyeDevice.update(data);
        }
        
        // Remove eye devices that are no longer present
        const currentIds = new Set(devices.map(dev => dev.getSensorData().id));
        for (const id of this.eyeDevices.keys()) {
            if (!currentIds.has(id)) {
                this.eyeDevices.delete(id);
            }
        }
    }
    
    draw() {
        // Clear the screen
        clear();
        background(20, 20, 40); // Dark blue background
        push();
        translate(width/2, height/2);

        // Update eye devices
        this.updateEyeDevices();
        
        // Set up lighting
        ambientLight(40, 40, 60); // Reduced ambient light
        pointLight(255, 255, 255, this.lightPosition.x, this.lightPosition.y, this.lightPosition.z);
        
        // Add bright back-light to illuminate edges
        pointLight(255, 255, 255, this.backLightPosition.x, this.backLightPosition.y, this.backLightPosition.z);
			const zPlane = 200;
			// Compute and update look targets for each eye (drawing moved to drawDebugText)
			for (const eyeDevice of this.eyeDevices.values()) {
				const device = this.deviceManager.getDevice(eyeDevice.getId());
				if (!device) continue;
				const data = device.getSensorData();
				const dNW = Number(data.dNW || 0);
				const dNE = Number(data.dNE || 0);
				const leftAttractorX = -300;
				const rightAttractorX = 300;
				const wL = constrain(dNW / 255.0, 0, 1);
				const wR = constrain(dNE / 255.0, 0, 1);
				const wSum = wL + wR + 1e-6;
				let x = (wL * leftAttractorX + wR * rightAttractorX) / wSum;
				x = constrain(x, -width/2 + 20, width/2 - 20);
				const aY_g = ((Number(data.ay || 128)) / 255.0) * 4.0 - 2.0;
				const aY_clamped = constrain(aY_g, -1, 1);
				const y = map(aY_clamped, -1, 1, height/2 - 20, -height/2 + 20);
				const worldTarget = { x: x, y: y, z: zPlane };
				eyeDevice.setLookTarget(worldTarget.x, -worldTarget.y, -worldTarget.z);
			}
        
        // Draw all eye devices
        for (const eyeDevice of this.eyeDevices.values()) {
            eyeDevice.draw();
        }
        
        // Draw debug information if enabled
        if (this.showDebugText) {
            this.drawDebugText();
        }
        pop();
    }
    
		drawDebugText() {
			// Draw tracking grid and target spheres in debug mode
			push();
			translate(width/2, height/2);
			const zPlane = 200;
			push();
			translate(0, 0, zPlane);
			push();
			stroke(80, 80, 110);
			strokeWeight(1);
			noFill();
			const gridStep = 50;
			for (let gx = -width/2; gx <= width/2; gx += gridStep) {
				line(gx, -height/2, 0, gx, height/2, 0);
			}
			for (let gy = -height/2; gy <= height/2; gy += gridStep) {
				line(-width/2, gy, 0, width/2, gy, 0);
			}
			pop();
			noStroke();
			for (const eyeDevice of this.eyeDevices.values()) {
				const device = this.deviceManager.getDevice(eyeDevice.getId());
				if (!device) continue;
				const data = device.getSensorData();
				const dNW = Number(data.dNW || 0);
				const dNE = Number(data.dNE || 0);
				const leftAttractorX = -300;
				const rightAttractorX = 300;
				const wL = constrain(dNW / 255.0, 0, 1);
				const wR = constrain(dNE / 255.0, 0, 1);
				const wSum = wL + wR + 1e-6;
				let x = (wL * leftAttractorX + wR * rightAttractorX) / wSum;
				x = constrain(x, -width/2 + 20, width/2 - 20);
				const aY_g = ((Number(data.ay || 128)) / 255.0) * 4.0 - 2.0;
				const aY_clamped = constrain(aY_g, -1, 1);
				const y = map(aY_clamped, -1, 1, height/2 - 20, -height/2 + 20);
				push();
				translate(x, y, 0);
				fill(255, 255, 255, 220);
				sphere(7);
				pop();
			}
			pop();
			pop();
			
			// Switch to 2D mode for text rendering
			camera();
			
			fill(255);
			textAlign(LEFT, TOP);
			textSize(16);
			text(`Eye Devices: ${this.eyeDevices.size}`, 10, 10);
			text('Press D to toggle debug info', 10, height - 20);
			
			// Show accelerometer data for each device
			let y = 40;
			for (const eyeDevice of this.eyeDevices.values()) {
				const device = this.deviceManager.getDevice(eyeDevice.getId());
				if (device) {
					const data = device.getSensorData();
					const aX_g = ((data.ax || 128) / 255.0) * 4.0 - 2.0;
					const aY_g = ((data.ay || 128) / 255.0) * 4.0 - 2.0;
					const aZ_g = ((data.az || 128) / 255.0) * 4.0 - 2.0;
					
					text(`ID:${data.id} aX:${aX_g.toFixed(2)}g aY:${aY_g.toFixed(2)}g aZ:${aZ_g.toFixed(2)}g`, 10, y);
					y += 20;
					
					if (y > height - 40) break;
				}
			}
			
		}
}
