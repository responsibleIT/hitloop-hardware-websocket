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
        
        // Device state for circles
        this.deviceRadius = 40;
        this._state = new Map();
        this._lastLedHex = new Map();
    }

    setup() {
        smooth();

        // define the colors
        colorMode(HSB, 360, 100, 100);
        this.cClouds = color(330, 25, 100);  // light rose for the clouds
        this.cFade = color(220, 50, 50);     // purplish saturated medium blue for the fade of the sky
        this.cFurther = color(230, 25, 90);  // purplish unsaturated light blue for the further mountains
        this.cCloser = color(210, 70, 10);   // greeny saturated dark blue for the closer mountains
        this.cMist = color(0, 0, 100);       // white for the mist
        
        this._state.clear();
        this._lastLedHex.clear();
        this.shouldRedraw = true;
    }

    teardown() {
        // Reset color mode to default RGB
        colorMode(RGB, 255);
    }

    draw() {
        // Regenerate landscape buffer only when shouldRedraw is true
        if (this.shouldRedraw || !this.landscapeBuffer || 
            this.landscapeBuffer.width !== width || 
            this.landscapeBuffer.height !== height) {
            this.shouldRedraw = false;
            
            // Create or resize landscape buffer
            if (!this.landscapeBuffer || 
                this.landscapeBuffer.width !== width || 
                this.landscapeBuffer.height !== height) {
                this.landscapeBuffer = createGraphics(width, height);
            }
            
            // Draw landscape to buffer
            this.landscapeBuffer.push();
            this.landscapeBuffer.colorMode(HSB, 360, 100, 100);
            this.landscapeBuffer.background(230, 25, 90);
            
            this._drawFadeToBuffer(this.landscapeBuffer, this.cFade);
            this._drawCloudsToBuffer(this.landscapeBuffer, this.cClouds);
            this._drawMountainsToBuffer(this.landscapeBuffer, this.cCloser, this.cFurther, this.cMist);
            this.landscapeBuffer.pop();
        }
        
        // Always redraw background and landscape to erase previous circle positions
        colorMode(HSB, 360, 100, 100);
        background(230, 25, 90);
        if (this.landscapeBuffer) {
            image(this.landscapeBuffer, 0, 0);
        }
        
        // Always draw participants on top
        colorMode(RGB, 255);
        this._drawParticipants();
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
        const eyeSize = r * 0.16;
        fill(0);
        noStroke();
        circle(state.x - eyeOffsetX, state.y - eyeOffsetY, eyeSize);
        circle(state.x + eyeOffsetX, state.y - eyeOffsetY, eyeSize);
        stroke(0);
        strokeWeight(3);
        line(state.x - r * 0.45, state.y + r * 0.28, state.x + r * 0.45, state.y + r * 0.28);
    }

    _rgbToHex([r, g, b]) {
        const clamp = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
        return [clamp(r), clamp(g), clamp(b)]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
    }
}
