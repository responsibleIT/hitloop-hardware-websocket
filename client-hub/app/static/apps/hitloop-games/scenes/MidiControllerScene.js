class MidiController {
    constructor(beatVolumeCC = 1, filterValueCC = 2, tuneCC = 3, rimVolumeCC = 4, crashVolumeCC = 5, filter2CC = 6) {
        this.beatVolumeCC = beatVolumeCC;
        this.filterValueCC = filterValueCC;
        this.tuneCC = tuneCC;
        this.rimVolumeCC = rimVolumeCC;
        this.crashVolumeCC = crashVolumeCC;
        this.filter2CC = filter2CC;
        this.previousBeatVolume = 0;
        this.previousFilterValue = 0;
        this.previousFilter2Value = 0;
        this.trainingMode = null; // null = normal, 1-6 = training mode for that channel
    }

    sendBeatVolume(value) {
        if (window.grouploopOutput) {
            try {
                const roundedValue = Math.round(value);
                window.grouploopOutput.sendControlChange(this.beatVolumeCC, roundedValue, 1);
            } catch (error) {
                console.error('Error sending beatVolume MIDI:', error);
            }
        }
    }

    sendFilterValue(value) {
        if (window.grouploopOutput) {
            try {
                const roundedValue = Math.round(value);
                window.grouploopOutput.sendControlChange(this.filterValueCC, roundedValue, 1);
            } catch (error) {
                console.error('Error sending filterValue MIDI:', error);
            }
        }
    }

    sendFilter2(value) {
        if (window.grouploopOutput) {
            try {
                const roundedValue = Math.round(value);
                window.grouploopOutput.sendControlChange(this.filter2CC, roundedValue, 1);
            } catch (error) {
                console.error('Error sending filter2 MIDI:', error);
            }
        }
    }

    // Training mode methods
    setTrainingMode(channel) {
        // channel: 0 = normal, 1 = beatVolume, 2 = filter, 3 = tune, 4 = rimVolume, 5 = crashVolume, 6 = filter2
        this.trainingMode = channel;

        if (channel === 0) {
            // Resume normal operation - silence all channels first
            this.silenceAllChannels();
        } else {
            // Silence all channels except the training channel
            this.silenceAllChannels();
        }
    }

    getTrainingMode() {
        return this.trainingMode;
    }

    getTrainingModeName() {
        switch (this.trainingMode) {
            case null:
            case 0:
                return "Normal";
            case 1:
                return "beatVolume (CC " + this.beatVolumeCC + ")";
            case 2:
                return "filter (CC " + this.filterValueCC + ")";
            case 3:
                return "tune (CC " + this.tuneCC + ")";
            case 4:
                return "rimVolume (CC " + this.rimVolumeCC + ")";
            case 5:
                return "crashVolume (CC " + this.crashVolumeCC + ")";
            case 6:
                return "filter2 (CC " + this.filter2CC + ")";
            default:
                return "Unknown";
        }
    }

    silenceAllChannels() {
        if (!window.grouploopOutput) return;

        try {
            // Send 0 to all channels
            window.grouploopOutput.sendControlChange(this.beatVolumeCC, 0, 1);
            window.grouploopOutput.sendControlChange(this.filterValueCC, 0, 1);
            window.grouploopOutput.sendControlChange(this.tuneCC, 0, 1);
            window.grouploopOutput.sendControlChange(this.rimVolumeCC, 0, 1);
            window.grouploopOutput.sendControlChange(this.crashVolumeCC, 0, 1);
            window.grouploopOutput.sendControlChange(this.filter2CC, 0, 1);
        } catch (error) {
            console.error('Error silencing channels:', error);
        }
    }

    sendRandomValueOnChannel(channel) {
        if (!window.grouploopOutput) return;

        const randomValue = Math.floor(Math.random() * 128); // 0-127

        try {
            switch (channel) {
                case 1:
                    window.grouploopOutput.sendControlChange(this.beatVolumeCC, randomValue, 1);
                    break;
                case 2:
                    window.grouploopOutput.sendControlChange(this.filterValueCC, randomValue, 1);
                    break;
                case 3:
                    window.grouploopOutput.sendControlChange(this.tuneCC, randomValue, 1);
                    break;
                case 4:
                    window.grouploopOutput.sendControlChange(this.rimVolumeCC, randomValue, 1);
                    break;
                case 5:
                    window.grouploopOutput.sendControlChange(this.crashVolumeCC, randomValue, 1);
                    break;
                case 6:
                    window.grouploopOutput.sendControlChange(this.filter2CC, randomValue, 1);
                    break;
            }
        } catch (error) {
            console.error('Error sending random value on channel:', error);
        }
    }

    update() {
        // In training mode, send random values on the active channel
        if (this.trainingMode && this.trainingMode > 0 && this.trainingMode <= 6) {
            // Send random value every few frames (not every frame to avoid MIDI spam)
            if (frameCount % 30 === 0) { // Every 30 frames (~0.5 seconds at 60fps)
                this.sendRandomValueOnChannel(this.trainingMode);
            }
        }
    }

    // Override normal update methods to check training mode
    updateBeatVolume(currentValue) {
        if (this.trainingMode === null || this.trainingMode === 0) {
            const rounded = Math.round(currentValue);
            if (rounded !== Math.round(this.previousBeatVolume)) {
                this.sendBeatVolume(rounded);
                this.previousBeatVolume = currentValue;
            }
        }
    }

    updateFilterValue(currentValue) {
        if (this.trainingMode === null || this.trainingMode === 0) {
            const rounded = Math.round(currentValue);
            if (rounded !== Math.round(this.previousFilterValue)) {
                this.sendFilterValue(rounded);
                this.previousFilterValue = currentValue;
            }
        }
    }

    updateFilter2(currentValue) {
        if (this.trainingMode === null || this.trainingMode === 0) {
            const rounded = Math.round(currentValue);
            if (rounded !== Math.round(this.previousFilter2Value)) {
                this.sendFilter2(rounded);
                this.previousFilter2Value = currentValue;
            }
        }
    }
}

class InstructionFlash {
    constructor(text, interval = 30000, animationDuration = 2000, cycles = 3) {
        this.text = text;
        this.interval = interval; // Time between flashes in milliseconds
        this.animationDuration = animationDuration; // Duration of animation in milliseconds
        this.cycles = cycles; // Number of grow/shrink cycles
        this.lastFlashTime = 0;
        this.animationStart = 0;
        this.isFlashing = false;
        this.fillColor = [255, 255, 0]; // Default yellow fill
        this.strokeColor = null; // Optional stroke color
        this.strokeWeight = 0; // Stroke weight (0 = no stroke)
        this.startOffset = 0;
    }

    setFillColor(color) {
        this.fillColor = color;
    }

    setStrokeColor(color, weight = 4) {
        this.strokeColor = color;
        this.strokeWeight = weight;
    }

    update() {
        const currentTime = millis() + this.startOffset;

        // Check if it's time to flash
        if (!this.isFlashing && currentTime - this.lastFlashTime >= this.interval) {
            this.isFlashing = true;
            this.animationStart = currentTime;
            this.lastFlashTime = currentTime;
        }

        // Check if animation is complete
        if (this.isFlashing) {
            const elapsed = currentTime - this.animationStart;
            if (elapsed >= this.animationDuration) {
                this.isFlashing = false;
            }
        }
    }

    draw(x, y) {
        if (!this.isFlashing) return;

        const currentTime = millis();
        const elapsed = currentTime - this.animationStart;
        const progress = elapsed / this.animationDuration;

        // Calculate animation phase (multiple grow/shrink cycles)
        // Each cycle is a sine wave: 0 -> 1 -> 0
        const cycleProgress = (progress * this.cycles) % 1;
        const scale = sin(cycleProgress * TWO_PI) * 0.5 + 0.5; // Maps to 0-1

        // Calculate text size (grow from 60 to 120 pixels)
        const baseSize = 60;
        const maxSize = 120;
        const currentTextSize = baseSize + (maxSize - baseSize) * scale;

        // Calculate alpha (fade in/out)
        let alpha = 255;
        if (progress < 0.1) {
            // Fade in
            alpha = (progress / 0.1) * 255;
        } else if (progress > 0.9) {
            // Fade out
            alpha = ((1 - progress) / 0.1) * 255;
        }

        // Draw text
        push();
        textAlign(CENTER, CENTER);
        textSize(currentTextSize);

        // Set stroke if configured
        if (this.strokeColor && this.strokeWeight > 0) {
            stroke(this.strokeColor[0], this.strokeColor[1], this.strokeColor[2], alpha);
            strokeWeight(this.strokeWeight);
        } else {
            noStroke();
        }

        // Set fill
        fill(this.fillColor[0], this.fillColor[1], this.fillColor[2], alpha);

        text(this.text, x, y);
        pop();
    }

    reset() {
        this.startOffset = random(0, this.interval);
        this.isFlashing = false;
        this.lastFlashTime = 0;
    }
}

class BokehParticleSystem {
    constructor(particleCount = 50, baseVelocity = 0.5) {
        this.particles = [];
        this.particleCount = particleCount;
        this.baseVelocity = baseVelocity; // Overall velocity multiplier
        this.buffer = null; // Graphics buffer for blur effect
        this.blurAmount = 3; // Blur amount in pixels
        
        // Initialize particles
        for (let i = 0; i < particleCount; i++) {
            this.particles.push(this.createParticle());
        }
        
        // Create buffer when width and height are available
        this.createBuffer();
    }

    createBuffer() {
        if (typeof width !== 'undefined' && typeof height !== 'undefined' && width > 0 && height > 0) {
            this.buffer = createGraphics(width, height);
            this.buffer.pixelDensity(1);
        }
    }

    createParticle() {
        const diameter = random(50, 200);
        // Larger particles move faster: speed = baseVelocity * (diameter / 100)
        const speedMultiplier = diameter / 100;
        // Add some horizontal velocity variation for more organic movement
        const velocityY = this.baseVelocity * speedMultiplier;
        const velocityX = random(-velocityY * 0.3, velocityY * 0.3); // Horizontal velocity is 30% of vertical
        
        return {
            x: random(0, width),
            y: random(0, height), // Start at random positions
            diameter: diameter,
            velocityX: velocityX,
            velocityY: velocityY,
            redShade: random(250, 250),
            greenShade: random(20, 200),

            depth: random(0, 1) // 0 = back, 1 = front (for color variation)
        };
    }

    update() {
        for (const particle of this.particles) {
            // Move particle in both directions
            particle.x += particle.velocityX;
            particle.y += particle.velocityY;
            
            // Wrap particles on all sides
            const halfDiameter = particle.diameter / 2;
            
            // Wrap horizontally
            if (particle.x > width + halfDiameter) {
                particle.x = -halfDiameter; // Wrap from right to left
            } else if (particle.x < -halfDiameter) {
                particle.x = width + halfDiameter; // Wrap from left to right
            }
            
            // Wrap vertically
            if (particle.y > height + halfDiameter) {
                particle.y = -halfDiameter; // Wrap from bottom to top
            } else if (particle.y < -halfDiameter) {
                particle.y = height + halfDiameter; // Wrap from top to bottom
            }
        }
    }

    draw() {
        // Recreate buffer if canvas was resized
        if (!this.buffer || this.buffer.width !== width || this.buffer.height !== height) {
            this.createBuffer();
        }
        
        if (!this.buffer) return; // Buffer not ready yet
        
        // Clear buffer and set transparent background
        this.buffer.clear();
        this.buffer.background(0, 0); // Transparent background
        
        // Draw particles back to front for proper depth ordering
        // Sort by depth (0 = back, 1 = front)
        const sortedParticles = [...this.particles].sort((a, b) => a.depth - b.depth);
        
        // Draw to buffer
        for (const particle of sortedParticles) {
            this.buffer.push();
            this.buffer.noStroke();
            
            // Calculate alpha based on depth (front particles are brighter/more visible)
            // Back particles (depth 0): darker/lower alpha
            // Front particles (depth 1): brighter/higher alpha
            const alpha = map(particle.depth, 0, 1, 5, 10); // Very faint
            
            // Calculate brightness based on depth
            // Back particles: darker (50-100), front particles: brighter (150-200)
            const brightness = particle.depth;
            
            this.buffer.fill(brightness*particle.redShade, brightness*particle.greenShade, brightness, alpha);
            this.buffer.circle(particle.x, particle.y, particle.diameter);
            this.buffer.pop();
        }
        
        // Apply blur filter to the buffer
        this.buffer.filter(BLUR, this.blurAmount);
        
        // Draw buffer to main canvas
        image(this.buffer, 0, 0);
    }

    setBaseVelocity(velocity) {
        this.baseVelocity = velocity;
        // Update all particle velocities based on new base velocity
        for (const particle of this.particles) {
            const speedMultiplier = particle.diameter / 100;
            particle.velocityY = this.baseVelocity * speedMultiplier;
            particle.velocityX = random(-particle.velocityY * 0.3, particle.velocityY * 0.3);
        }
    }

    resize() {
        // Recreate buffer with new dimensions
        this.createBuffer();
        
        // Reposition particles when canvas resizes (keep them within bounds)
        for (const particle of this.particles) {
            particle.x = random(0, width);
            particle.y = random(0, height);
        }
    }
}

class MovementCircle {
    constructor(ringDiameterRatio = 0.8, onCrashCallback = null, onRevertCallback = null) {
        this.centerCircleDiameter = 0; // Accumulated movement diameter
        this.ringDiameter = 0; // Will be set in update() as ringDiameterRatio * height
        this.ringDiameterRatio = ringDiameterRatio;
        this.previousExceededState = false; // Track previous exceeded state to detect transitions
        this.onCrashCallback = onCrashCallback; // Callback function when crash is triggered
        this.onRevertCallback = onRevertCallback; // Callback function when reverting
        this.centerCircleSize = 20; // Size of the small center circle

        // Hold and revert state
        this.isHolding = false; // Whether we're in the hold period
        this.maxDiameterReached = 0; // Maximum diameter reached (to hold at)
        this.holdStartTime = 0; // When hold period started (in milliseconds)
        this.holdDuration = 16000; // 16 seconds in milliseconds
        this.isReverting = false; // Whether we're in the revert/fade phase
        this.originalAccumulatedMovement = 0; // Movement accumulated before exceeding
        
        // Noise animation for exceeded state
        this.noisePhase = 0; // Phase offset for noise function (increments each frame)
        this.noiseSpeed = 0.02; // Speed of noise phase change
        this.noiseStrength = 20; // Strength of noise distortion
        this.vertexCount = 64; // Number of vertices for polar coordinate circle
    }

    update(devices) {
        // Set ring diameter based on canvas height
        this.ringDiameter = height * this.ringDiameterRatio;

        // Handle hold period - keep diameter at max for 16 seconds
        if (this.isHolding) {            
            const currentTime = millis();
            if (currentTime - this.holdStartTime >= this.holdDuration) {
                // Hold period complete, start reverting
                this.isHolding = false;
                this.isReverting = true;
                this.triggerRevert();
            } else {
                // Still in hold period, keep diameter at max
                this.centerCircleDiameter = this.maxDiameterReached;
                return; // Don't accumulate more movement during hold
            }
        }

        // Handle revert phase - reset diameter to original
        if (this.isReverting) {
            // Revert completed in triggerRevert, just need to check state
            if (this.centerCircleDiameter <= 0) {
                this.isReverting = false;
                this.centerCircleDiameter = 0;
            }
            return; // Don't accumulate movement during revert
        }

        // Normal operation - calculate movement for each device
        for (const device of devices) {
            const data = device.getSensorData();

            // Calibrate aX, aY, aZ to G: 0 = -2g, 255 = 2g
            // Formula: (value / 255) * 4 - 2 (maps 0-255 to -2g to 2g)
            const aX_G = (data.ax / 255.0) * 4.0 - 2.0;
            const aY_G = (data.ay / 255.0) * 4.0 - 2.0;
            const aZ_G = (data.az / 255.0) * 4.0 - 2.0;

            // Calculate magnitude using Pythagorean theorem
            const magnitude = Math.sqrt(aX_G * aX_G + aY_G * aY_G + aZ_G * aZ_G);

            // Subtract 1.0G from the magnitude
            const movement = Math.max(0, magnitude - 1.0); // Clamp to 0 if negative

            // Add the result to center circle diameter
            this.centerCircleDiameter += movement/devices.length;
        }

        // Check if center circle diameter has exceeded ring diameter
        const currentlyExceeded = this.centerCircleDiameter > this.ringDiameter;

        // Trigger crash when transitioning from not exceeded to exceeded
        if (currentlyExceeded && !this.previousExceededState) {
            // Store the max diameter reached and start hold period
            this.maxDiameterReached = this.centerCircleDiameter;
            this.originalAccumulatedMovement = this.centerCircleDiameter;
            this.isHolding = true;
            this.holdStartTime = millis();
            this.triggerCrash();
        }

        // Update previous state for next frame
        this.previousExceededState = currentlyExceeded;
    }

    triggerCrash() {
        if (this.onCrashCallback) {
            this.onCrashCallback();
        }
    }

    triggerRevert() {
        // Immediately reset diameter to 0
        this.centerCircleDiameter = 0;
        if (this.onRevertCallback) {
            this.onRevertCallback();
        }
    }

    draw() {
        const centerX = width / 2;
        const centerY = height / 2;

        // Draw large ring (threshold ring)
        push();
        noFill();
        stroke(255, 100);
        strokeWeight(5);
        circle(centerX, centerY, this.ringDiameter);
        pop();

        // Draw accumulated diameter circle using polar coordinates
        if (this.centerCircleDiameter > 0) {
            // Update noise phase each frame
            this.noisePhase += this.noiseSpeed;
            
            const hasExceeded = this.centerCircleDiameter > this.ringDiameter;
            const displayDiameter = this.isHolding ? this.maxDiameterReached : this.centerCircleDiameter;
            const baseRadius = displayDiameter / 2;
            
            push();
            noFill();
            // Change color based on whether threshold is exceeded
            if (hasExceeded) {
                stroke(255, 0, 0, 200); // Red when exceeded
                strokeWeight(5);
            } else {
                stroke(255, 255, 0, 150); // Yellow when below threshold
                strokeWeight(5);
            }
            
            // Draw circle using polar coordinates
            beginShape();
            for (let i = 0; i <= this.vertexCount; i++) {
                const angle = (i / this.vertexCount) * TWO_PI;
                
                let radius = baseRadius;
                
                // If exceeded, apply noise to radius
                if (hasExceeded) {
                    // Use noise with angle and phase to create smooth variation
                    // Higher multiplier = higher frequency (more waves around the circle)
                    const noiseValue = noise(
                        cos(angle) * 3.0 + this.noisePhase,
                        sin(angle) * 3.0 + this.noisePhase
                    );
                    // Map noise (0-1) to variation (-noiseStrength to +noiseStrength)
                    const noiseOffset = map(noiseValue, 0, 1, -this.noiseStrength, this.noiseStrength);
                    radius = baseRadius + noiseOffset;
                }
                
                // Convert polar to cartesian coordinates
                const x = centerX + cos(angle) * radius;
                const y = centerY + sin(angle) * radius;
                vertex(x, y);
            }
            endShape(CLOSE);
            pop();
        }

        // Draw small yellow circle in the center
        push();
        fill(255, 255, 0); // Yellow
        noStroke();
        circle(centerX, centerY, this.centerCircleSize);
        pop();
    }

    reset() {
        this.centerCircleDiameter = 0;
        this.previousExceededState = false;
        this.isHolding = false;
        this.isReverting = false;
        this.maxDiameterReached = 0;
        this.originalAccumulatedMovement = 0;
    }

    getDiameter() {
        return this.centerCircleDiameter;
    }

    getRingDiameter() {
        return this.ringDiameter;
    }

    hasExceeded() {
        return this.centerCircleDiameter > this.ringDiameter;
    }
}

class MeshRenderer {
    constructor(maxConnectionDistance = 150) {
        this.maxConnectionDistance = maxConnectionDistance;
    }

    draw(representations) {
        if (!representations || representations.length === 0) return;

        // Separate representations by color
        const redReps = representations.filter(r => r.attractedToLeft);
        const blueReps = representations.filter(r => !r.attractedToLeft);

        // Draw mesh for red representations
        this.drawMeshForGroup(redReps, [255, 0, 0]);

        // Draw mesh for blue representations
        this.drawMeshForGroup(blueReps, [0, 0, 255]);
    }

    drawMeshForGroup(group, color) {
        if (group.length < 2) return;

        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const rep1 = group[i];
                const rep2 = group[j];

                const dx = rep2.x - rep1.x;
                const dy = rep2.y - rep1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.maxConnectionDistance) {
                    // Calculate transparency: close = fully opaque (255), far = fully transparent (0)
                    const alpha = map(dist, 0, this.maxConnectionDistance, 255, 0);

                    stroke(color[0], color[1], color[2], alpha);
                    strokeWeight(5);
                    line(rep1.x, rep1.y, rep2.x, rep2.y);
                }
            }
        }
    }

    setMaxConnectionDistance(distance) {
        this.maxConnectionDistance = distance;
    }
}

class Attractor {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color; // [r, g, b]
        this.phase = random(0, TWO_PI);
    }

    draw() {
        let transparency = (sin(frameCount * 0.02 + this.phase) + 1.0) / 2;
        transparency = map(transparency, 0, 1, 0.2, 1);
        fill(this.color[0], this.color[1], this.color[2], transparency * 255);
        noStroke();
        circle(this.x, this.y, this.radius * 2);
    }
}

class DeviceRepresentation {
    constructor(device, x, y) {
        this.device = device;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = 15;

        // Flocking parameters
        this.maxSpeed = 2.0;
        this.maxForce = 0.15;
        this.attractionStrength = 0.08;
        this.separationDistance = 50;
        this.alignmentDistance = 60;
        this.cohesionDistance = 80;
        this.separationWeight = 1.8;
        this.alignmentWeight = 0.5;
        this.cohesionWeight = 0.6;

        // Determine which attractor this is attracted to
        this.attractedToLeft = false;
        this.previousAttractedToLeft = null; // Track previous attraction state to detect color changes (null = initial state)
        this.previousTap = false; // Track previous tap state for edge detection
        this.updateAttraction();
        
        // Send initial color to device
        this.sendColorToDevice();
    }

    updateAttraction() {
        const data = this.device.getSensorData();
        // dNW > dNE means attracted to left attractor
        // dNE > dNW means attracted to right attractor
        const newAttractedToLeft = (data.dNW || 0) > (data.dNE || 0);
        
        // Check if color changed and send command to device
        if (newAttractedToLeft !== this.attractedToLeft) {
            this.attractedToLeft = newAttractedToLeft;
            this.sendColorToDevice();
        }
    }

    sendColorToDevice() {
        // Convert color to format expected by HitloopDevice
        // Use named colors: 'red' or 'blue'
        const colorName = this.attractedToLeft ? 'red' : 'blue';
        
        // Send LED command to device
        if (this.device && this.device.sendCommand) {
            this.device.sendCommand('led', colorName);
        }
    }

    getColor() {
        return this.attractedToLeft ? [255, 0, 0] : [0, 0, 255]; // Red or Blue
    }

    // Flocking behavior: separation, alignment, cohesion
    flock(representations) {
        const separation = this.separate(representations);
        const alignment = this.align(representations);
        const cohesion = this.cohere(representations);

        // Apply forces
        this.applyForce(separation.x * this.separationWeight, separation.y * this.separationWeight);
        this.applyForce(alignment.x * this.alignmentWeight, alignment.y * this.alignmentWeight);
        this.applyForce(cohesion.x * this.cohesionWeight, cohesion.y * this.cohesionWeight);
    }

    separate(representations) {
        const steer = { x: 0, y: 0 };
        let count = 0;

        for (const rep of representations) {
            if (rep === this) continue;

            const dx = this.x - rep.x;
            const dy = this.y - rep.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0 && dist < this.separationDistance) {
                const invDist = 1.0 / dist;
                steer.x += dx * invDist;
                steer.y += dy * invDist;
                count++;
            }
        }

        if (count > 0) {
            steer.x /= count;
            steer.y /= count;
            const mag = Math.sqrt(steer.x * steer.x + steer.y * steer.y);
            if (mag > 0) {
                steer.x = (steer.x / mag) * this.maxSpeed;
                steer.y = (steer.y / mag) * this.maxSpeed;
                steer.x -= this.vx;
                steer.y -= this.vy;
                this.limitForce(steer);
            }
        }

        return steer;
    }

    align(representations) {
        const steer = { x: 0, y: 0 };
        let count = 0;

        for (const rep of representations) {
            if (rep === this) continue;
            if (rep.attractedToLeft !== this.attractedToLeft) continue; // Only align with same color

            const dx = this.x - rep.x;
            const dy = this.y - rep.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0 && dist < this.alignmentDistance) {
                steer.x += rep.vx;
                steer.y += rep.vy;
                count++;
            }
        }

        if (count > 0) {
            steer.x /= count;
            steer.y /= count;
            const mag = Math.sqrt(steer.x * steer.x + steer.y * steer.y);
            if (mag > 0) {
                steer.x = (steer.x / mag) * this.maxSpeed;
                steer.y = (steer.y / mag) * this.maxSpeed;
                steer.x -= this.vx;
                steer.y -= this.vy;
                this.limitForce(steer);
            }
        }

        return steer;
    }

    cohere(representations) {
        const steer = { x: 0, y: 0 };
        let count = 0;

        for (const rep of representations) {
            if (rep === this) continue;
            if (rep.attractedToLeft !== this.attractedToLeft) continue; // Only cohere with same color

            const dx = this.x - rep.x;
            const dy = this.y - rep.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0 && dist < this.cohesionDistance) {
                steer.x += rep.x;
                steer.y += rep.y;
                count++;
            }
        }

        if (count > 0) {
            steer.x = (steer.x / count) - this.x;
            steer.y = (steer.y / count) - this.y;
            const mag = Math.sqrt(steer.x * steer.x + steer.y * steer.y);
            if (mag > 0) {
                steer.x = (steer.x / mag) * this.maxSpeed;
                steer.y = (steer.y / mag) * this.maxSpeed;
                steer.x -= this.vx;
                steer.y -= this.vy;
                this.limitForce(steer);
            }
        }

        return steer;
    }

    // Attraction to the appropriate attractor
    attract(targetAttractor) {
        const dx = targetAttractor.x - this.x;
        const dy = targetAttractor.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const normalizedX = dx / dist;
            const normalizedY = dy / dist;

            // Apply attraction force
            const forceX = normalizedX * this.attractionStrength;
            const forceY = normalizedY * this.attractionStrength;

            this.applyForce(forceX, forceY);
        }
    }

    // Collision with attractor (bounce off)
    checkCollisionWithAttractor(attractor) {
        const dx = this.x - attractor.x;
        const dy = this.y - attractor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = this.radius + attractor.radius;

        if (dist < minDist) {
            // Bounce off
            const normalizedX = dx / (dist || 1);
            const normalizedY = dy / (dist || 1);

            // Reflect velocity
            const dotProduct = this.vx * normalizedX + this.vy * normalizedY;
            this.vx -= 2 * dotProduct * normalizedX;
            this.vy -= 2 * dotProduct * normalizedY;

            // Push out of collision
            const overlap = minDist - dist;
            this.x += normalizedX * overlap;
            this.y += normalizedY * overlap;

            // Dampen velocity slightly
            this.vx *= 0.8;
            this.vy *= 0.8;
        }
    }

    applyForce(fx, fy) {
        this.vx += fx;
        this.vy += fy;
    }

    limitForce(force) {
        const mag = Math.sqrt(force.x * force.x + force.y * force.y);
        if (mag > this.maxForce) {
            force.x = (force.x / mag) * this.maxForce;
            force.y = (force.y / mag) * this.maxForce;
        }
    }

    update() {
        // Update velocity limits
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > this.maxSpeed) {
            this.vx = (this.vx / speed) * this.maxSpeed;
            this.vy = (this.vy / speed) * this.maxSpeed;
        }

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Boundary constraints
        const padding = this.radius;
        if (this.x < padding) {
            this.x = padding;
            this.vx *= -0.5;
        }
        if (this.x > width - padding) {
            this.x = width - padding;
            this.vx *= -0.5;
        }
        if (this.y < padding) {
            this.y = padding;
            this.vy *= -0.5;
        }
        if (this.y > height - padding) {
            this.y = height - padding;
            this.vy *= -0.5;
        }
    }

    draw() {
        const color = this.getColor();
        fill(color[0], color[1], color[2]);
        noStroke();
        circle(this.x, this.y, this.radius * 2);
    }
}

class MidiControllerScene extends Scene {
    constructor(deviceManager) {
        super(deviceManager);
        this.representations = new Map(); // deviceId -> DeviceRepresentation
        this.leftAttractor = null;
        this.rightAttractor = null;

        // Modular components
        this.midiController = new MidiController(1, 2, 3, 4, 5, 6); // CC 1=beatVolume, CC 2=filterValue, CC 3=tune, CC 4=rimVolume, CC 5=crashVolume, CC 6=filter2
        this.meshRenderer = new MeshRenderer(150);
        this.movementCircle = new MovementCircle(
            0.8, 
            () => this.onMovementCircleCrash(),
            () => this.onMovementCircleRevert()
        );
        

        // Fade state for crashVolume and rimVolume
        this.fadeStartTime = 0;
        this.fadeDuration = 2000; // 2 seconds fade duration in milliseconds
        this.isFading = false;

        // Instruction flashes
        this.tapInstruction = new InstructionFlash("Shake!", 30000, 2000, 3);
        this.tapInstruction.setFillColor([255, 255, 0]); // Yellow fill

        this.tiltInstruction = new InstructionFlash("Tilt!", 30000, 2000, 3);
        this.tiltInstruction.setFillColor([255, 255, 0]); // Yellow fill

        // Beat volume parameters
        this.beatVolume = 0; // Ranges from 0 to 127
        this.baseBeatVolumeIncrease = 15; // Base amount to increase when red device is tapped
        this.beatVolumeCoolDown = 0.3; // Amount to decrease each frame

        // Filter value parameters
        this.filterValue = 0; // Ranges from 0 to 127, based on average aZ of all devices
        this.filter2Value = 0; // Ranges from 0 to 127, based on average aZ of all devices
        
        // Current frame representations (updated in updateScene, used in drawScene)
        this.allRepresentations = [];
    }

    setup() {
        // Create attractors at 1/4 and 3/4 width, vertically centered
        const leftX = width * 0.25;
        const rightX = width * 0.75;
        const centerY = height / 2;
        const rightAttractorRadius = 50; // Blue attractor starts at minimum size (when filterValue = 0)
        const leftAttractorRadius = 50; // Red attractor starts at minimum size (when beatVolume = 0)

        this.bokehParticles = new BokehParticleSystem(200, -0.5); // 50 particles, base velocity 0.5
        this.leftAttractor = new Attractor(leftX, centerY, leftAttractorRadius, [255, 50, 50]); // Red
        this.rightAttractor = new Attractor(rightX, centerY, rightAttractorRadius, [50, 50, 255]); // Blue
    }

    draw() {
        background(16);
        this.updateScene();
        this.drawScene();
    }

    updateScene() {
        // Update bokeh particle system
        this.bokehParticles.update();

        // Update attractor positions if canvas was resized
        if (this.leftAttractor && this.rightAttractor) {
            this.leftAttractor.x = width * 0.25;
            this.leftAttractor.y = height / 2;
            this.rightAttractor.x = width * 0.75;
            this.rightAttractor.y = height / 2;
        }

        // Get all devices and create/update representations
        const devices = Array.from(this.deviceManager.getAllDevices().values());
        const aliveIds = new Set();

        // Update movement circle with current devices
        this.movementCircle.update(devices);

        // First pass: update attractions and collect tap states
        const tapEvents = []; // Store tap events to process after counting red devices
        for (const device of devices) {
            const data = device.getSensorData();
            const id = data.id;
            aliveIds.add(id);

            let rep = this.representations.get(id);
            if (!rep) {
                // Create new representation at random position
                rep = new DeviceRepresentation(
                    device,
                    random(50, width - 50),
                    random(50, height - 50)
                );
                this.representations.set(id, rep);
            }

            // Update attraction based on current sensor data
            rep.updateAttraction();
            
            // Check for tap events (but process after counting red devices)
            const currentTap = data.tap || false;
            if (rep.attractedToLeft && currentTap && !rep.previousTap) {
                tapEvents.push(rep);
            }
            // Update previousTap for next frame
            rep.previousTap = currentTap;
        }
        
        // Count red devices (attracted to left attractor) after all attractions are updated
        const representations = Array.from(this.representations.values());
        const redDevicesCount = representations.filter(r => r.attractedToLeft).length;
        
        // Calculate dynamic beatVolumeIncrease based on number of red devices
        // More devices = smaller increase per tap
        // Formula: baseIncrease / redDevicesCount
        const dynamicBeatVolumeIncrease = redDevicesCount > 0 
            ? this.baseBeatVolumeIncrease / redDevicesCount 
            : this.baseBeatVolumeIncrease;
        
        // Process tap events with dynamic increase
        for (const rep of tapEvents) {
            // Tap detected on red device - increase beatVolume with dynamic amount
            this.beatVolume += dynamicBeatVolumeIncrease;
            this.beatVolume = constrain(this.beatVolume, 0, 127);
        }
        
        // Cool down beatVolume each frame
        this.beatVolume -= this.beatVolumeCoolDown;
        this.beatVolume = constrain(this.beatVolume, 0, 127);
        
        // Handle fading of crashVolume and rimVolume
        if (this.isFading) {
            const currentTime = millis();
            const elapsed = currentTime - this.fadeStartTime;
            
            if (elapsed >= this.fadeDuration) {
                // Fade complete, send 0 and stop fading
                if (window.grouploopOutput) {
                    try {
                        const midiCtrl = this.midiController;
                        window.grouploopOutput.sendControlChange(midiCtrl.crashVolumeCC, 0, 1);
                        window.grouploopOutput.sendControlChange(midiCtrl.rimVolumeCC, 0, 1);
                    } catch (error) {
                        console.error('Error completing fade:', error);
                    }
                }
                this.isFading = false;
            } else {
                // Calculate fade progress (0 to 1)
                const fadeProgress = elapsed / this.fadeDuration;
                // Calculate value (fade from 127 to 0)
                const fadeValue = Math.round(127 * (1 - fadeProgress));
                
                // Send faded values
                if (window.grouploopOutput) {
                    try {
                        const midiCtrl = this.midiController;
                        window.grouploopOutput.sendControlChange(midiCtrl.crashVolumeCC, fadeValue, 1);
                        window.grouploopOutput.sendControlChange(midiCtrl.rimVolumeCC, fadeValue, 1);
                    } catch (error) {
                        console.error('Error sending fade MIDI:', error);
                    }
                }
            }
        }
        
        // Update instruction flashes
        this.tapInstruction.update();
        this.tiltInstruction.update();
        
        // Update MIDI controller (handles training mode and normal operation)
        this.midiController.update();
        
        // Update MIDI controller with current beatVolume (only if not in training mode)
        this.midiController.updateBeatVolume(this.beatVolume);

        // Remove representations for devices that no longer exist
        for (const id of this.representations.keys()) {
            if (!aliveIds.has(id)) {
                this.representations.delete(id);
            }
        }

        // Recalculate representations after cleanup
        this.allRepresentations = Array.from(this.representations.values());
        
        // Calculate filterValue and filter2Value based on average aZ of ALL devices
        if (this.allRepresentations.length > 0) {
            // Calculate average aZ value of all devices
            let sumAZ = 0;
            for (const rep of this.allRepresentations) {
                const data = rep.device.getSensorData();
                sumAZ += data.az || 0;
            }
            const avgAZ = sumAZ / this.allRepresentations.length;
            
            // Map aZ for filter1 (filter):
            // aZ = 191 → filter = 0
            // aZ = 64 → filter = 127
            this.filterValue = map(avgAZ, 191, 64, 0, 127);
            this.filterValue = constrain(this.filterValue, 0, 127);
            
            // Map aZ for filter2:
            // aZ = 191 → filter2 = 127
            // aZ = 64 → filter2 = 0
            this.filter2Value = map(avgAZ, 191, 64, 127, 0);
            this.filter2Value = constrain(this.filter2Value, 0, 127);
        } else {
            // No devices, set filter values to 0
            this.filterValue = 0;
            this.filter2Value = 0;
        }
        
        // Update MIDI controller with current filterValue and filter2Value
        this.midiController.updateFilterValue(this.filterValue);
        this.midiController.updateFilter2(this.filter2Value);
        
        // Update red attractor size based on beatVolume
        // Size = 50 when beatVolume = 0, size = 150 when beatVolume = 127
        if (this.leftAttractor) {
            this.leftAttractor.radius = 50 + (this.beatVolume / 127) * 100;
        }
        
        // Update blue attractor size based on filterValue
        // Size = 50 when filterValue = 0, size = 150 when filterValue = 127
        if (this.rightAttractor) {
            this.rightAttractor.radius = 50 + (this.filterValue / 127) * 100;
        }

        // Apply flocking behavior
        for (const rep of this.allRepresentations) {
            rep.flock(this.allRepresentations);
        }

        // Apply attraction to appropriate attractor
        for (const rep of this.allRepresentations) {
            const targetAttractor = rep.attractedToLeft ? this.leftAttractor : this.rightAttractor;
            rep.attract(targetAttractor);
            rep.checkCollisionWithAttractor(targetAttractor);
        }

        // Update all representations
        for (const rep of this.allRepresentations) {
            rep.update();
        }

        if (this.isHolding) {
            this.bokehParticles.baseVelocity = -3.5;
        } else {
            this.bokehParticles.baseVelocity = -0.5;
        }
    }

    drawScene() {
        // Draw bokeh particle system (background)


        // Draw mesh lines between representations of the same color
        this.meshRenderer.draw(this.allRepresentations);

        // Draw center circle visualization
        this.movementCircle.draw();

        this.bokehParticles.draw();

        // Draw attractors
        if (this.leftAttractor) this.leftAttractor.draw();
        if (this.rightAttractor) this.rightAttractor.draw();

        // Draw representations
        for (const rep of this.allRepresentations) {
            rep.draw();
        }
        
        // Draw instruction flashes
        if (this.leftAttractor) {
            this.tapInstruction.draw(this.leftAttractor.x, this.leftAttractor.y);
        }
        if (this.rightAttractor) {
            this.tiltInstruction.draw(this.rightAttractor.x, this.rightAttractor.y);
        }

        if (this.showDebugText) {
            this.drawDebugText();
        }
    }


    onMovementCircleCrash() {
        // Callback triggered when movement circle exceeds threshold
        // Send 127 to tune, crashVolume, and rimVolume channels
        if (window.grouploopOutput) {
            try {
                const midiCtrl = this.midiController;
                window.grouploopOutput.sendControlChange(midiCtrl.tuneCC, 127, 1);
                window.grouploopOutput.sendControlChange(midiCtrl.crashVolumeCC, 127, 1);
                window.grouploopOutput.sendControlChange(midiCtrl.rimVolumeCC, 127, 1);
                console.log('Crash triggered! Center circle exceeded ring diameter.');
            } catch (error) {
                console.error('Error sending crash MIDI:', error);
            }
        }
    }

    onMovementCircleRevert() {
        // Callback triggered when movement circle reverts after 16 second hold
        // Send 0 to tune channel and start fading crashVolume and rimVolume
        if (window.grouploopOutput) {
            try {
                const midiCtrl = this.midiController;
                // Send 63 o tune channel immediately
                window.grouploopOutput.sendControlChange(midiCtrl.tuneCC, 63, 1);

                // Start fading crashVolume and rimVolume
                this.isFading = true;
                this.fadeStartTime = millis();

                console.log('Revert triggered! Starting fade of crashVolume and rimVolume.');
            } catch (error) {
                console.error('Error sending revert MIDI:', error);
            }
        }
    }

    keyPressed() {
        super.keyPressed(); // Call parent to handle 'd' for debug

        // Handle numeric keys for training mode
        if (key >= '0' && key <= '6') {
            const channel = parseInt(key);
            this.midiController.setTrainingMode(channel);

            if (channel === 0) {
                console.log('Training mode: Normal operation');
            } else {
                console.log('Training mode: Channel', channel, '-', this.midiController.getTrainingModeName());
            }
        }
    }

    drawDebugText() {
        blendMode(BLEND);
        fill(255);
        textAlign(LEFT, TOP);
        textSize(16);
        text(`Devices: ${this.representations.size}`, 10, 20);

        // Show MIDI training mode state
        const trainingState = this.midiController.getTrainingModeName();
        fill(255, 255, 0); // Yellow for training mode
        text(`MIDI Mode: ${trainingState}`, 10, 40);

        fill(255);
        text('Training: 1=beatVolume, 2=filter, 3=tune, 4=rimVolume, 5=crashVolume, 6=filter2, 0=normal', 10, 60);
        text('Flocking behavior with attractors based on dNW/dNE', 10, height - 30);
        text('Press D to toggle debug info', 10, height - 10);
    }
}
