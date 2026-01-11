class DayAndNight extends Scene {
    constructor(deviceManager) {
        super(deviceManager);
        this.cClouds = null;
        this.cFade = null;
        this.cFurther = null;
        this.cCloser = null;
        this.cMist = null;
        this.shouldRedraw = false;
        this.landscapeBuffer = null;
        
        // Sun properties (will be initialized in setup() when width/height are available)
        this.sunX = null;
        this.sunY = null;
        this.sunSize = 100;  // Base sun size
        this.sunTime = 0;  // Time counter for animation
        
        // Audio State
        this.daylightSound = null;
        this.nightSound = null;
        this.active = false;
        
        // Device state for circles
        this.deviceRadius = 40;
        this._state = new Map();
        this._lastLedHex = new Map();
    }

    setup() {
        smooth();

        // define the colors (day colors - brighter, more vibrant)
        colorMode(HSB, 360, 100, 100);
        this.cCloudsDay = color(30, 15, 100);    // bright white-yellow clouds
        this.cFadeDay = color(200, 40, 95);     // bright light blue fade
        this.cFurtherDay = color(210, 20, 95);   // bright light blue for the further mountains
        this.cCloserDay = color(200, 50, 30);   // medium blue for the closer mountains
        this.cMistDay = color(0, 0, 100);        // white for the mist
        this.bgDay = color(200, 30, 95);         // bright daylight sky background
        
        // Night colors - much darker, more dramatic
        this.cCloudsNight = color(240, 70, 15);   // very dark blue-gray clouds
        this.cFadeNight = color(250, 90, 5);     // almost black blue fade
        this.cFurtherNight = color(240, 60, 8);   // very dark blue mountains
        this.cCloserNight = color(240, 80, 3);    // almost black mountains
        this.cMistNight = color(240, 50, 20);     // dark blue mist
        this.bgNight = color(250, 80, 5);         // very dark night sky background
        
        // Current nightness factor (0 = day, 1 = night)
        this.nightness = 0;
        
        this._state.clear();
        this._lastLedHex.clear();
        this.sunX = width / 2;
        this.sunY = height * 0.15;
        this.sunTime = 0;
        this.shouldRedraw = true;
        
        // Audio Init
        this.active = true;
        if (!this.daylightSound) {
            loadSound('sounds/daylight-sounds.mp3', (s) => {
                if (!this.active) {
                    s.stop();
                    return;
                }
                this.daylightSound = s;
                this._initAudio(); // Will only start if both are loaded
            });
        }
        
        if (!this.nightSound) {
            loadSound('sounds/night-sounds.mp3', (s) => {
                if (!this.active) {
                    s.stop();
                    return;
                }
                this.nightSound = s;
                this._initAudio(); // Will only start if both are loaded
            });
        }
        
        // If both sounds are already loaded, initialize them now
        if (this.daylightSound && this.nightSound) {
            this._initAudio();
        }
    }

    teardown() {
        // Reset color mode to default RGB
        colorMode(RGB, 255);
        
        // Stop sounds
        this.active = false;
        if (this.daylightSound) {
            this.daylightSound.stop();
            this.daylightSound.disconnect();
        }
        if (this.nightSound) {
            this.nightSound.stop();
            this.nightSound.disconnect();
        }
    }
    
    _initAudio() {
        // Only initialize if both sounds are loaded
        if (!this.daylightSound || !this.nightSound) return;
        
        // Disconnect and reconnect for proper initialization (like Fountain.js)
        this.daylightSound.disconnect();
        this.daylightSound.connect();
        this.nightSound.disconnect();
        this.nightSound.connect();
        
        // Start both sounds looping (they'll crossfade via volume)
        this.daylightSound.setVolume(1);
        this.daylightSound.loop();
        
        this.nightSound.setVolume(0);
        this.nightSound.loop();
    }

    draw() {
        // Calculate nightness based on participant positions
        // Left side = more night (1.0), Right side = more day (0.0)
        this._calculateNightness();
        
        // Smoothly interpolate nightness to avoid sudden changes
        if (this.targetNightness === undefined) {
            this.targetNightness = this.nightness;
        }
        this.targetNightness += (this.nightness - this.targetNightness) * 0.05;
        
        // Regenerate landscape buffer only when shape needs to change (on click or resize)
        if (this.shouldRedraw || !this.landscapeBuffer || 
            this.landscapeBuffer.width !== width || 
            this.landscapeBuffer.height !== height) {
            this.shouldRedraw = false;
            
            // Store random seed for consistent shapes
            if (!this.landscapeSeed) {
                this.landscapeSeed = random(1000000);
            }
            randomSeed(this.landscapeSeed);
            
            // Create or resize landscape buffer
            if (!this.landscapeBuffer || 
                this.landscapeBuffer.width !== width || 
                this.landscapeBuffer.height !== height) {
                this.landscapeBuffer = createGraphics(width, height);
            }
            
            // Draw landscape with day colors (shape stays the same due to fixed seed)
            this.landscapeBuffer.push();
            this.landscapeBuffer.colorMode(HSB, 360, 100, 100);
            this.landscapeBuffer.background(this.bgDay);
            
            this._drawFadeToBuffer(this.landscapeBuffer, this.cFadeDay);
            this._drawCloudsToBuffer(this.landscapeBuffer, this.cCloudsDay);
            this._drawMountainsToBuffer(this.landscapeBuffer, this.cCloserDay, this.cFurtherDay, this.cMistDay);
            this.landscapeBuffer.pop();
        }
        
        // Always redraw background with interpolated color (more dramatic transition)
        colorMode(HSB, 360, 100, 100);
        const bg = lerpColor(this.bgDay, this.bgNight, this.targetNightness);
        background(bg);
        
        // Draw landscape buffer
        if (this.landscapeBuffer) {
            image(this.landscapeBuffer, 0, 0);
            
            // Apply smooth darkening overlay for night effect (more dramatic)
            push();
            colorMode(HSB, 360, 100, 100, 360);
            blendMode(MULTIPLY);
            const darkenAlpha = this.targetNightness * 200;
            fill(250, 80, 100, darkenAlpha);
            rect(0, 0, width, height);
            blendMode(BLEND);
            pop();
        }
        
        // Draw liquid sun (animated, so drawn every frame)
        this._drawLiquidSun();
        
        // Switch sounds based on nightness
        this._updateSounds();
        
        // Always draw participants on top
        colorMode(RGB, 255);
        this._drawParticipants();
    }
    
    _calculateNightness() {
        // Calculate average X position of participants
        const devices = [...this.deviceManager.getAllDevices().values()];
        let sumX = 0;
        let count = 0;
        
        for (const dev of devices) {
            const data = dev.getSensorData?.() ?? {};
            const id = data.id ?? dev.id ?? dev;
            const state = this._getState(id);
            
            if (state && state.x !== undefined) {
                sumX += state.x;
                count++;
            }
        }
        
        if (count > 0) {
            const avgX = sumX / count;
            // Map average X to nightness: left (0) = 1.0 (night), right (width) = 0.0 (day)
            const normalizedX = avgX / width;
            this.nightness = constrain(1 - normalizedX, 0, 1);
        } else {
            // No participants, maintain current nightness (don't reset)
            // Or slowly fade to day
            this.nightness = constrain(this.nightness * 0.99, 0, 1);
        }
    }

    mousePressed() {
        // loop() equivalent - trigger redraw
        this.shouldRedraw = true;
    }

    keyPressed() {
        // save the frame when we press the letter s
        if (key === 's' || key === 'S') {
            saveCanvas('landscape', 'png');
        }
        // Call parent keyPressed for debug toggle
        super.keyPressed();
    }

    /*------------------------------------*/

    _drawFadeToBuffer(buffer, fadeColor) {
        buffer.push();
        buffer.colorMode(HSB, 360, 100, 100, 360);
        for (let i = 0; i < height / 3; i++) {
            const alfa = map(i, 0, height / 3, 360, 0);
            
            buffer.strokeWeight(1);
            const h = hue(fadeColor);
            const s = saturation(fadeColor);
            const b = brightness(fadeColor);
            buffer.stroke(h, s, b, alfa);
            buffer.line(0, i, width, i);
        }
        buffer.pop();
    }

    fade(fadeColor) {
        push();
        colorMode(HSB, 360, 100, 100, 360);
        for (let i = 0; i < height / 3; i++) {
            const alfa = map(i, 0, height / 3, 360, 0);
            
            strokeWeight(1);
            const h = hue(fadeColor);
            const s = saturation(fadeColor);
            const b = brightness(fadeColor);
            stroke(h, s, b, alfa);
            line(0, i, width, i);
        }
        pop();
    }

    /*------------------------------------*/

    _drawCloudsToBuffer(buffer, cloudColor) {
        const begin = random(50); // changes the begin of noise each time
        
        let i = 0;
        
        buffer.push();
        buffer.colorMode(HSB, 360, 100, 100, 360);
        for (let x = 0; x < width; x += 2) {
            let j = 0;
            
            for (let y = 0; y < height / 3; y += 2) {
                const alfaMax = map(y, 0, height / 4, 520, 0);  // the clouds become transparent as they become near to the mountains
                let alfa = noise(begin + i, begin + j);
                alfa = map(alfa, 0.4, 1, 0, alfaMax);
                
                buffer.noStroke();
                const h = hue(cloudColor);
                const s = saturation(cloudColor);
                const b = brightness(cloudColor);
                buffer.fill(h, s, b, alfa);
                buffer.ellipse(x, y, 2, 2);
                
                j += 0.06; // increase j faster than i so the clouds look horizontal
            }
            
            i += 0.01;
        }
        buffer.pop();
    }

    clouds(cloudColor) {
        const begin = random(50); // changes the begin of noise each time
        
        let i = 0;
        
        push();
        colorMode(HSB, 360, 100, 100, 360);
        for (let x = 0; x < width; x += 2) {
            let j = 0;
            
            for (let y = 0; y < height / 3; y += 2) {
                const alfaMax = map(y, 0, height / 4, 520, 0);  // the clouds become transparent as they become near to the mountains
                let alfa = noise(begin + i, begin + j);
                alfa = map(alfa, 0.4, 1, 0, alfaMax);
                
                noStroke();
                const h = hue(cloudColor);
                const s = saturation(cloudColor);
                const b = brightness(cloudColor);
                fill(h, s, b, alfa);
                ellipse(x, y, 2, 2);
                
                j += 0.06; // increase j faster than i so the clouds look horizontal
            }
            
            i += 0.01;
        }
        pop();
    }

    /*------------------------------------*/

    _drawMountainsToBuffer(buffer, closerColor, furtherColor, mistColor) {
        // Ensure HSB color mode is active
        buffer.colorMode(HSB, 360, 100, 100);
        
        // FIND THE REFERENCE Y OF EACH MOUNTAIN:
        // Original Processing used size(1112, 834), so y0 = 1112 - 500 = 612
        // Scale this proportionally: 612/834 ≈ 0.734 of height
        let y0 = height * 0.734;
        const i0 = 30;  // initial interval
        
        const cy = new Array(10); // initialize the reference y array
        for (let j = 0; j < 10; j++) {
            cy[9 - j] = y0;
            y0 -= i0 / pow(1.2, j);
        }
        
        // DRAW THE MOUNTAINS
        let dx = 0;
        
        for (let j = 1; j < 10; j++) {
            const a = random(-width / 2, width / 2);  // random discrepancy between the sin waves
            const b = random(-width / 2, width / 2);  // random discrepancy between the sin waves
            const c = random(2, 4);  // random amplitude for the second sin wave
            const d = random(40, 50);  // noise function amplitude
            const e = random(-width / 2, width / 2);  // adds a discrepancy between the noise of each mountain
            
            for (let x = 0; x < width; x++) {
                let y = cy[j]; // y = reference y
                y += 10 * j * sin(2 * dx / j + a);  // first sin wave oscillates according to j (the closer the mountain, the bigger the amplitude and smaller the frequency)
                y += c * j * sin(5 * dx / j + b);   // second sin wave has a random medium amplitude (affects more the further mountains) and bigger frequency
                y += d * j * noise(1.2 * dx / j + e);  // first noise function adds randomness to the mountains, amplitude depends on a random number and increases with j, frequency decreases with j
                y += 1.7 * j * noise(10 * dx);  // second noise function simulates the canopy, it has high frequency and small amplitude depending on j so it is smoother on the further mountains
                
                buffer.strokeWeight(2);  // mountains look smoother with stroke weight of 2
                buffer.stroke(lerpColor(furtherColor, closerColor, j / 9));
                buffer.line(x, y, x, height);
                
                dx += 0.02;
            }
            
            // ADD MIST
            buffer.push();
            buffer.colorMode(HSB, 360, 100, 100, 360);
            for (let i = height; i > cy[j]; i -= 3) {
                const alfa = map(i, cy[j], height, 0, 360 / (j + 1));  // alfa begins bigger for the further mountains
                buffer.strokeWeight(3);  // interval of 3 for faster rendering
                const h = hue(mistColor);
                const s = saturation(mistColor);
                const b = brightness(mistColor);
                buffer.stroke(h, s, b, alfa);
                buffer.line(0, i, width, i);
            }
            buffer.pop();
        }
    }

    mountains(closerColor, furtherColor, mistColor) {
        // Ensure HSB color mode is active
        colorMode(HSB, 360, 100, 100);
        
        // FIND THE REFERENCE Y OF EACH MOUNTAIN:
        // Original Processing used size(1112, 834), so y0 = 1112 - 500 = 612
        // Scale this proportionally: 612/834 ≈ 0.734 of height
        let y0 = height * 0.734;
        const i0 = 30;  // initial interval
        
        const cy = new Array(10); // initialize the reference y array
        for (let j = 0; j < 10; j++) {
            cy[9 - j] = y0;
            y0 -= i0 / pow(1.2, j);
        }
        
        // DRAW THE MOUNTAINS
        let dx = 0;
        
        for (let j = 1; j < 10; j++) {
            const a = random(-width / 2, width / 2);  // random discrepancy between the sin waves
            const b = random(-width / 2, width / 2);  // random discrepancy between the sin waves
            const c = random(2, 4);  // random amplitude for the second sin wave
            const d = random(40, 50);  // noise function amplitude
            const e = random(-width / 2, width / 2);  // adds a discrepancy between the noise of each mountain
            
            for (let x = 0; x < width; x++) {
                let y = cy[j]; // y = reference y
                y += 10 * j * sin(2 * dx / j + a);  // first sin wave oscillates according to j (the closer the mountain, the bigger the amplitude and smaller the frequency)
                y += c * j * sin(5 * dx / j + b);   // second sin wave has a random medium amplitude (affects more the further mountains) and bigger frequency
                y += d * j * noise(1.2 * dx / j + e);  // first noise function adds randomness to the mountains, amplitude depends on a random number and increases with j, frequency decreases with j
                y += 1.7 * j * noise(10 * dx);  // second noise function simulates the canopy, it has high frequency and small amplitude depending on j so it is smoother on the further mountains
                
                strokeWeight(2);  // mountains look smoother with stroke weight of 2
                stroke(lerpColor(furtherColor, closerColor, j / 9));
                line(x, y, x, height);
                
                dx += 0.02;
            }
            
            // ADD MIST
            push();
            colorMode(HSB, 360, 100, 100, 360);
            for (let i = height; i > cy[j]; i -= 3) {
                const alfa = map(i, cy[j], height, 0, 360 / (j + 1));  // alfa begins bigger for the further mountains
                strokeWeight(3);  // interval of 3 for faster rendering
                const h = hue(mistColor);
                const s = saturation(mistColor);
                const b = brightness(mistColor);
                stroke(h, s, b, alfa);
                line(0, i, width, i);
            }
            pop();
        }
    }

    /*------------------------------------*/
    // Sun methods

    _drawLiquidSun() {
        // Initialize sun position if not set (width/height available in draw())
        if (this.sunX === null || this.sunX === undefined) {
            this.sunX = width / 2;
        }
        if (this.sunY === null || this.sunY === undefined) {
            this.sunY = height * 0.15;
        }
        
        // Calculate sun horizontal position based on participant actual positions
        const devices = [...this.deviceManager.getAllDevices().values()];
        let sumX = 0;
        let count = 0;
        
        for (const dev of devices) {
            const data = dev.getSensorData?.() ?? {};
            const id = data.id ?? dev.id ?? dev;
            const state = this._getState(id);
            
            if (state && state.x !== undefined) {
                sumX += state.x;
                count++;
            }
        }
        
        // Calculate target position based on average participant X position
        let targetX = this.sunX;  // Default to current position (don't reset to center)
        
        if (count > 0) {
            const avgX = sumX / count;
            targetX = avgX;  // Follow the average participant position
        }
        
        // Constrain sun position to keep minimal distance from edges
        const edgeMargin = this.sunSize * 0.5;  // Smaller margin to allow closer to edges
        targetX = constrain(targetX, edgeMargin, width - edgeMargin);
        
        // Smoothly interpolate sun position
        this.sunX += (targetX - this.sunX) * 0.05;
        
        // Update sun position and animation time
        this.sunY = height * 0.15;
        this.sunTime += 0.02;
        
        push();
        colorMode(HSB, 360, 100, 100, 360);
        
        // Draw multiple layers for liquid/glowing effect
        const numLayers = 10;
        const baseSize = this.sunSize;
        
        for (let layer = numLayers; layer >= 0; layer--) {
            const layerSize = baseSize * (0.4 + layer * 0.06);
            const alpha = map(layer, 0, numLayers, 80, 250);
            
            // Create liquid blob shape using Perlin noise
            beginShape();
            noStroke();
            
            // Color gradient: Sun (yellow) during day, Moon (white) during night
            // Smooth fade transition between them
            const nightness = this.targetNightness || 0;
            
            // Sun colors (yellow)
            let sunColor;
            if (layer === numLayers) {
                sunColor = color(50, 30, 100, alpha * 0.2);  // Outer glow - very light yellow
            } else if (layer >= numLayers - 2) {
                sunColor = color(50, 40, 100, alpha * 0.4);  // Yellow glow
            } else if (layer >= numLayers - 4) {
                sunColor = color(50, 50, 100, alpha * 0.6);  // Bright yellow
            } else if (layer >= numLayers - 6) {
                sunColor = color(50, 60, 100, alpha * 0.8);  // Rich yellow
            } else {
                sunColor = color(50, 70, 100, alpha);         // Bright yellow core (sun)
            }
            
            // Moon colors (white)
            let moonColor;
            if (layer === numLayers) {
                moonColor = color(0, 0, 70, alpha * 0.2);   // Outer glow - light white
            } else if (layer >= numLayers - 2) {
                moonColor = color(0, 0, 80, alpha * 0.4);   // Light white
            } else if (layer >= numLayers - 4) {
                moonColor = color(0, 0, 90, alpha * 0.6);    // Bright white
            } else if (layer >= numLayers - 6) {
                moonColor = color(0, 0, 95, alpha * 0.8);    // Very bright white
            } else {
                moonColor = color(0, 0, 100, alpha);          // Pure white core (moon)
            }
            
            // Smooth fade transition from yellow sun to white moon
            const currentColor = lerpColor(sunColor, moonColor, nightness);
            fill(currentColor);
            
            // Create blob shape with Perlin noise distortion
            const numPoints = 40;
            for (let i = 0; i <= numPoints; i++) {
                const angle = (TWO_PI / numPoints) * i;
                const noiseScale = 0.015;
                
                // Use Perlin noise to create liquid-like distortion
                const noiseX = this.sunX + cos(angle) * layerSize;
                const noiseY = this.sunY + sin(angle) * layerSize;
                
                // Multiple octaves of noise for more organic shape
                const n1 = noise(
                    noiseX * noiseScale + this.sunTime * 0.3,
                    noiseY * noiseScale + this.sunTime * 0.3
                );
                const n2 = noise(
                    noiseX * noiseScale * 2 + this.sunTime * 0.5,
                    noiseY * noiseScale * 2 + this.sunTime * 0.5
                );
                const n3 = noise(
                    noiseX * noiseScale * 4 + this.sunTime * 0.7,
                    noiseY * noiseScale * 4 + this.sunTime * 0.7
                );
                
                // Combine noise values for more complex distortion
                const combinedNoise = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
                const distortion = map(combinedNoise, 0, 1, 0.75, 1.25);
                
                const x = this.sunX + cos(angle) * layerSize * distortion;
                const y = this.sunY + sin(angle) * layerSize * distortion;
                
                vertex(x, y);
            }
            endShape(CLOSE);
        }
        
        pop();
    }

    /*------------------------------------*/
    // Audio methods

    _updateSounds() {
        if (!this.daylightSound || !this.nightSound) return;
        if (this.targetNightness === undefined) return;
        
        // Ensure both sounds are playing
        if (!this.daylightSound.isPlaying()) {
            this.daylightSound.loop();
        }
        if (!this.nightSound.isPlaying()) {
            this.nightSound.loop();
        }
        
        // Crossfade volumes based on nightness
        // Daylight: louder during day (nightness = 0), quieter at night (nightness = 1)
        const daylightVolume = 1 - this.targetNightness;
        // Night: quieter during day (nightness = 0), louder at night (nightness = 1)
        const nightVolume = this.targetNightness;
        
        this.daylightSound.setVolume(daylightVolume);
        this.nightSound.setVolume(nightVolume);
    }

    /*------------------------------------*/
    // Participant circles methods

    _drawParticipants() {
        const devices = [...this.deviceManager.getAllDevices().values()];
        const present = new Set();
        const renderList = [];
        
        for (const dev of devices) {
            const data = dev.getSensorData?.() ?? {};
            const id = data.id ?? dev.id ?? dev;
            present.add(id);

            const state = this._getState(id);
            this._updateMotion(state, data);
            renderList.push({ state, id });
        }

        this._separateOverlaps(renderList.map((r) => r.state));

        // White color for all participants
        const whiteColor = [255, 255, 255];

        for (const { state, id } of renderList) {
            this._drawFace(state, whiteColor);
            
            // Update device LED color to white
            const hex = this._rgbToHex(whiteColor);
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
        for (const key of [...this._lastLedHex.keys()]) {
            if (!present.has(key)) this._lastLedHex.delete(key);
        }
    }

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

    _updateMotion(state, data) {
        // Use sensors for movement
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
}
