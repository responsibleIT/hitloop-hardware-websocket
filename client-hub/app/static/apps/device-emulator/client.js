/* globals createCanvas, windowWidth, windowHeight, WEBGL, background, fill, noStroke, stroke, strokeWeight, line, box, circle, rect, text, textAlign, CENTER, touchStarted, touchMoved, resetMatrix, translate, rotateX, rotateY, rotateZ, push, pop, preload, loadFont, textFont, textSize */

let ws = null;
let wsUrl = window.DEFAULT_WS_URL;
let deviceId = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');

let acc = { ax: 127, ay: 127, az: 255 }; // start with 1g on Z
let circlePos = { x: 0, y: 0 };
let draggingCircle = false;
let rotatingCube = false;
let lastMouse = { x: 0, y: 0 };

// Tap detection variables
let tapState = false;
let tapDuration = 0;
let tapCooldown = 0;
const TAP_DURATION_MS = 200; // How long tap stays active
const TAP_COOLDOWN_MS = 100; // Minimum time between taps

let uiFont = null;

// Cube orientation (radians)
let rotX = 0; // pitch
let rotY = 0; // yaw
let rotZ = 0; // roll (unused by drag, kept for completeness)

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function toHexByte(n) { return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0'); }
function toHexWord(n) { return clamp(Math.round(n), 0, 65535).toString(16).padStart(4, '0'); }

function mapRange(v, inMin, inMax, outMin, outMax) {
    const t = (v - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
}

function triggerTap() {
    const now = Date.now();
    if (now - tapCooldown < TAP_COOLDOWN_MS) {
        return; // Still in cooldown period
    }
    
    tapState = true;
    tapDuration = now;
    tapCooldown = now;
    console.log('Tap detected!');
}

function setupMotion() {
    // Use DeviceMotion (accelerationIncludingGravity) in m/s^2 and convert to g
    function handler(e) {
        const axMs2 = (e.accelerationIncludingGravity && typeof e.accelerationIncludingGravity.x === 'number') ? e.accelerationIncludingGravity.x : null;
        const ayMs2 = (e.accelerationIncludingGravity && typeof e.accelerationIncludingGravity.y === 'number') ? e.accelerationIncludingGravity.y : null;
        const azMs2 = (e.accelerationIncludingGravity && typeof e.accelerationIncludingGravity.z === 'number') ? e.accelerationIncludingGravity.z : null;
        const G = 9.80665; // m/s^2 per 1g
        if (axMs2 !== null) {
            const axG = axMs2 / G; // in g
            acc.ax = clamp(Math.round(mapRange(axG, -2, 2, 0, 255)), 0, 255);
        }
        if (ayMs2 !== null) {
            const ayG = ayMs2 / G;
            acc.ay = clamp(Math.round(mapRange(ayG, -2, 2, 0, 255)), 0, 255);
        }
        if (azMs2 !== null) {
            const azG = azMs2 / G;
            acc.az = clamp(Math.round(mapRange(azG, -2, 2, 0, 255)), 0, 255);
        }
    }
    window.addEventListener('devicemotion', handler, true);
    // iOS permission request; auto-connect on first touch
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        window.addEventListener('touchend', async () => {
            try { await DeviceMotionEvent.requestPermission(); } catch (_) {}
            connectWs();
        }, { once: true });
    } else {
        connectWs();
    }
}

function connectWs() {
    try { if (ws) ws.close(); } catch (e) {}
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => { ws.send('s'); });
}

let lastFrame = '';
function encodeFrame() {
    // Update tap state - check if tap duration has expired
    const now = Date.now();
    if (tapState && (now - tapDuration) > TAP_DURATION_MS) {
        tapState = false;
    }
    
    // Distances from circle to 4 screen corners mapped to 0..255 (near=255, far=0)
    const corners = [
        { x: 0, y: 0 }, // TL -> dNW
        { x: width, y: 0 }, // TR -> dNE
        { x: width, y: height }, // BR -> dSE
        { x: 0, y: height }, // BL -> dSW
    ];
    const maxDist = Math.hypot(width, height);
    const ds = corners.map(c => {
        const d = Math.hypot(circlePos.x - c.x, circlePos.y - c.y);
        return clamp(Math.round(mapRange(d, 0, maxDist, 255, 0)), 0, 255);
    });
    const idHex = deviceId;
    const tapByte = tapState ? 255 : 0; // 255 = tapped, 0 = not tapped
    lastFrame = `${idHex}${toHexByte(acc.ax)}${toHexByte(acc.ay)}${toHexByte(acc.az)}${toHexByte(ds[0])}${toHexByte(ds[1])}${toHexByte(ds[2])}${toHexByte(ds[3])}${toHexByte(tapByte)}`.toLowerCase();
    return `${lastFrame}\n`;
}

function sendFrame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    let frame = encodeFrame();
    console.log('Sending frame:', frame);
    ws.send(frame);
}

window.preload = function() {
    // Load a web-safe TTF so WEBGL text rendering is enabled
    uiFont = loadFont('https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf');
}

window.setup = function() {
    const c = createCanvas(windowWidth, windowHeight, WEBGL);
    c.parent(document.getElementById('canvasWrap'));
    if (uiFont) {
        textFont(uiFont);
    }
    textSize(16);
    circlePos.x = width / 2;
    circlePos.y = height / 2;
    setupMotion();
    setInterval(sendFrame, 50); // 20 Hz
}

window.draw = function() {
    background(0);

    // If rotating via on-screen cube, synthesize accelerometer from orientation
    if (rotatingCube) {
        const g = 1.0;
        const axG = 2 * g * Math.sin(rotX);
        const ayG = 2 * g * Math.sin(rotY);
        const azG = 2 * g * Math.cos(rotX) * Math.cos(rotY);
        acc.ax = clamp(Math.round(mapRange(axG, -2, 2, 0, 255)), 0, 255);
        acc.ay = clamp(Math.round(mapRange(ayG, -2, 2, 0, 255)), 0, 255);
        acc.az = clamp(Math.round(mapRange(azG, -2, 2, 0, 255)), 0, 255);
    }

    // Draw 3D cube with orientation axes in center (WEBGL coords)
    push();
    rotateZ(rotZ);
    rotateX(rotX);
    rotateY(rotY);
    noFill();
    stroke(200);
    box(120, 120, 120);
    strokeWeight(3);
    stroke(255, 64, 64); line(0, 0, 0, 80, 0, 0); // X - red
    stroke(64, 255, 64); line(0, 0, 0, 0, 80, 0); // Y - green
    stroke(64, 128, 255); line(0, 0, 0, 0, 0, 80); // Z - blue
    pop();

    // 2D overlay for beacons, draggable circle, HUD
    push();
    resetMatrix();
    translate(-width/2, -height/2);
    const sz = 24;
    noStroke();
    fill(0, 255, 255); rect(0, 0, sz, sz); // TL cyan
    fill(255, 0, 255); rect(width - sz, 0, sz, sz); // TR magenta
    fill(255, 255, 0); rect(width - sz, height - sz, sz, sz); // BR yellow
    fill(255, 165, 0); rect(0, height - sz, sz, sz); // BL orange

    const mapAccel = (v) => clamp(Math.round(mapRange(mapRange(v, 0, 255, -2, 2), -1, 1, 0, 255)), 0, 255);
    
    // Draw circle with tap feedback
    if (tapState) {
        // Flash white when tapped
        fill(255, 255, 255);
        stroke(255, 0, 0);
        strokeWeight(3);
    } else {
        fill(mapAccel(acc.ax), mapAccel(acc.ay), mapAccel(acc.az));
        noStroke();
    }
    circle(circlePos.x, circlePos.y, 60);

    fill(255);
    textAlign(CENTER);
    const status = ws ? (ws.readyState === WebSocket.OPEN ? 'connected' : (ws.readyState === WebSocket.CONNECTING ? 'connecting' : 'disconnected')) : 'disconnected';
    const tapStatus = tapState ? 'TAPPED!' : 'tap: click circle or press T/SPACE';
    text(`status: ${status}  ws:${wsUrl}`, width/2, height - 36);
    text(`tap: ${tapStatus}`, width/2, height - 18);
    text(lastFrame || '', width/2, height - 6);
    pop();
}

function handleCirclePointer(x, y) {
    circlePos.x = clamp(x, 0, width);
    circlePos.y = clamp(y, 0, height);
}

function startInteraction(x, y) {
    const dx = x - circlePos.x;
    const dy = y - circlePos.y;
    const insideCircle = (dx*dx + dy*dy) <= (60*60);
    
    // Check for tap (quick interaction inside circle)
    if (insideCircle) {
        triggerTap();
    }
    
    draggingCircle = insideCircle;
    rotatingCube = !insideCircle;
    lastMouse.x = x;
    lastMouse.y = y;
    if (draggingCircle) handleCirclePointer(x, y);
}

function continueInteraction(x, y) {
    if (draggingCircle) {
        handleCirclePointer(x, y);
    } else if (rotatingCube) {
        const sens = 0.01;
        rotY += (x - lastMouse.x) * sens;
        rotX -= (y - lastMouse.y) * sens;
        lastMouse.x = x;
        lastMouse.y = y;
    }
}

function endInteraction() {
    draggingCircle = false;
    // keep rotatingCube true so orientation continues to define accelerometer
}

window.mousePressed = function() { startInteraction(mouseX, mouseY); }
window.mouseDragged = function() { continueInteraction(mouseX, mouseY); }
window.mouseReleased = function() { endInteraction(); }

window.touchStarted = function(e) { if (e.touches && e.touches[0]) startInteraction(e.touches[0].clientX, e.touches[0].clientY); return false; }
window.touchMoved = function(e) { if (e.touches && e.touches[0]) continueInteraction(e.touches[0].clientX, e.touches[0].clientY); return false; }
window.touchEnded = function() { endInteraction(); }

// Keyboard support for tap detection
window.keyPressed = function() {
    if (key === ' ' || key === 't' || key === 'T') {
        triggerTap();
    }
}


