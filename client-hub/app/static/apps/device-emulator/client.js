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
let hasAccelerometer = false;
let wakeLockSentinel = null;
let resizeObserver = null;
let gravityG = { x: 0, y: 0, z: 1 };
let canvasEl = null;
const RESIZE_JITTER_PX = 8;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function toHexByte(n) { return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0'); }
function toHexWord(n) { return clamp(Math.round(n), 0, 65535).toString(16).padStart(4, '0'); }

function mapRange(v, inMin, inMax, outMin, outMax) {
    const t = (v - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
}

function getCanvasSize() {
    const host = document.getElementById('canvasWrap');
    if (!host) {
        return { w: window.innerWidth, h: window.innerHeight };
    }
    return {
        w: Math.max(1, Math.floor(host.clientWidth || window.innerWidth)),
        h: Math.max(1, Math.floor(host.clientHeight || window.innerHeight)),
    };
}

function resizeCanvasToViewport() {
    if (typeof width !== 'number' || typeof height !== 'number') return;
    const prevW = Math.max(1, width);
    const prevH = Math.max(1, height);
    const prevX = circlePos.x;
    const prevY = circlePos.y;
    const { w, h } = getCanvasSize();
    const dw = Math.abs(w - prevW);
    const dh = Math.abs(h - prevH);
    if (dw <= RESIZE_JITTER_PX && dh <= RESIZE_JITTER_PX) return;
    if (w === prevW && h === prevH) return;
    resizeCanvas(w, h);
    circlePos.x = clamp((prevX / prevW) * w, 0, w);
    circlePos.y = clamp((prevY / prevH) * h, 0, h);
}

function toCanvasCoords(clientX, clientY) {
    if (!canvasEl) return { x: clientX, y: clientY };
    const rect = canvasEl.getBoundingClientRect();
    const localX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
    const localY = ((clientY - rect.top) / Math.max(1, rect.height)) * height;
    return { x: localX, y: localY };
}

function byteToG(v) {
    return mapRange(v, 0, 255, -2, 2);
}

function updateCubeFromAccelerometer() {
    const axG = gravityG.x;
    const ayG = gravityG.y;
    const azG = gravityG.z;
    rotX = Math.atan2(-ayG, Math.sqrt((axG * axG) + (azG * azG)));
    rotY = Math.atan2(axG, Math.sqrt((ayG * ayG) + (azG * azG)));
    rotZ = 0;
}

function updateGravity(axG, ayG, azG) {
    const alpha = 0.92;
    gravityG.x = (alpha * gravityG.x) + ((1 - alpha) * axG);
    gravityG.y = (alpha * gravityG.y) + ((1 - alpha) * ayG);
    gravityG.z = (alpha * gravityG.z) + ((1 - alpha) * azG);
    const mag = Math.hypot(gravityG.x, gravityG.y, gravityG.z) || 1;
    gravityG.x /= mag;
    gravityG.y /= mag;
    gravityG.z /= mag;
}

function addOneShotGestureListener(handler) {
    let done = false;
    const wrapped = async () => {
        if (done) return;
        done = true;
        window.removeEventListener('pointerup', wrapped);
        window.removeEventListener('touchend', wrapped);
        window.removeEventListener('click', wrapped);
        window.removeEventListener('keydown', wrapped);
        await handler();
    };
    window.addEventListener('pointerup', wrapped, { passive: true });
    window.addEventListener('touchend', wrapped, { passive: true });
    window.addEventListener('click', wrapped, { passive: true });
    window.addEventListener('keydown', wrapped, { passive: true });
}

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (wakeLockSentinel) return;
    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
        });
    } catch (_) {
        // Best effort only.
    }
}

function orientationLockMode() {
    const type = (screen.orientation && screen.orientation.type) || '';
    return type.startsWith('landscape') ? 'landscape' : 'portrait';
}

async function requestImmersiveMode() {
    try {
        const root = document.documentElement;
        if (root.requestFullscreen && !document.fullscreenElement) {
            await root.requestFullscreen();
        }
    } catch (_) {
        // Best effort only.
    }
    try {
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
            await screen.orientation.lock(orientationLockMode());
        }
    } catch (_) {
        // Best effort only.
    }
    await requestWakeLock();
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
        const hasMotionSample = axMs2 !== null || ayMs2 !== null || azMs2 !== null;
        if (hasMotionSample) {
            hasAccelerometer = true;
            rotatingCube = false;
        }
        const G = 9.80665; // m/s^2 per 1g
        let axG = gravityG.x;
        let ayG = gravityG.y;
        let azG = gravityG.z;
        if (axMs2 !== null) {
            axG = axMs2 / G; // in g
            acc.ax = clamp(Math.round(mapRange(axG, -2, 2, 0, 255)), 0, 255);
        }
        if (ayMs2 !== null) {
            ayG = ayMs2 / G;
            acc.ay = clamp(Math.round(mapRange(ayG, -2, 2, 0, 255)), 0, 255);
        }
        if (azMs2 !== null) {
            azG = azMs2 / G;
            acc.az = clamp(Math.round(mapRange(azG, -2, 2, 0, 255)), 0, 255);
        }
        if (hasMotionSample) {
            updateGravity(axG, ayG, azG);
        }
    }
    window.addEventListener('devicemotion', handler, true);
    const needsPermission = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
    if (needsPermission) {
        addOneShotGestureListener(async () => {
            await requestImmersiveMode();
            try { await DeviceMotionEvent.requestPermission(); } catch (_) {}
            connectWs();
        });
    } else {
        requestImmersiveMode();
        addOneShotGestureListener(async () => { await requestImmersiveMode(); });
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
    const { w, h } = getCanvasSize();
    const c = createCanvas(w, h, WEBGL);
    c.parent(document.getElementById('canvasWrap'));
    canvasEl = c.elt;
    if (uiFont) {
        textFont(uiFont);
    }
    textSize(16);
    circlePos.x = width / 2;
    circlePos.y = height / 2;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            requestWakeLock();
        }
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resizeCanvasToViewport);
    }
    resizeObserver = new ResizeObserver(() => {
        resizeCanvasToViewport();
    });
    const host = document.getElementById('canvasWrap');
    if (host) {
        resizeObserver.observe(host);
    }
    setupMotion();
    setInterval(sendFrame, 50); // 20 Hz
}

window.draw = function() {
    background(0);

    // Map accelerometer values to cube orientation when available.
    if (hasAccelerometer) {
        updateCubeFromAccelerometer();
    } else if (rotatingCube) {
        // Fallback: synthesize accelerometer values from touch rotation.
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
    translate(0, 0, 0);
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
    const controlMode = hasAccelerometer ? 'accelerometer' : 'touch-fallback';
    const tapStatus = tapState ? 'TAPPED!' : 'tap: click circle or press T/SPACE';
    text(`status: ${status}  mode:${controlMode}  ws:${wsUrl}`, width/2, height - 36);
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
    rotatingCube = !insideCircle && !hasAccelerometer;
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

window.touchStarted = function(e) {
    if (e.touches && e.touches[0]) {
        const p = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
        startInteraction(p.x, p.y);
    }
    return false;
}
window.touchMoved = function(e) {
    if (e.touches && e.touches[0]) {
        const p = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
        continueInteraction(p.x, p.y);
    }
    return false;
}
window.touchEnded = function() { endInteraction(); }

window.windowResized = function() {
    resizeCanvasToViewport();
}

// Keyboard support for tap detection
window.keyPressed = function() {
    if (key === ' ' || key === 't' || key === 'T') {
        triggerTap();
    }
}


