/* globals createCanvas, windowWidth, windowHeight, WEBGL, background, fill, noFill, noStroke, stroke, strokeWeight, line, box, circle, rect, text, textAlign, CENTER, touchStarted, touchMoved, resetMatrix, translate, rotateX, rotateY, rotateZ, push, pop, preload, loadFont, textFont, textSize */

let ws = null;
let wsUrl = window.DEFAULT_WS_URL;
let deviceId = Math.floor(Math.random() * 65536)
  .toString(16)
  .padStart(4, "0");

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

// --- LED state ---
let ledColor = [0, 0, 0]; // current LED RGB (0-255 each)
let ledBrightness = 1.0; // 0-1, controlled by 'brightness' command
let ledPattern = "off"; // off | solid | breathing | heartbeat | cycle | spring

// Individual LED states (new)
let individualLeds = [
  { isOn: false, color: [0, 0, 0] },
  { isOn: false, color: [0, 0, 0] },
  { isOn: false, color: [0, 0, 0] },
  { isOn: false, color: [0, 0, 0] },
  { isOn: false, color: [0, 0, 0] },
  { isOn: false, color: [0, 0, 0] },
];

// Spring physics state (mirrors firmware SpringBehavior)
let springPhysics = {
  brightness: 1.0,
  velocity: 0,
  k: 20.1,
  damping: 2.0,
  mass: 1.0,
  lastTime: 0,
};

// --- Vibration state ---
let vibEndTime = 0; // epoch ms when vibration stops
let vibRings = []; // [{x, y, startTime}]
let lastRingSpawnTime = 0;

// Commands that the device can receive from the socket server
const DEVICE_COMMANDS = new Set([
  "led",
  "pattern",
  "brightness",
  "spring_param",
  "vibrate",
  "reset",
  "status",
  "ota",
  "led_set",
  "led_off",
  "led_all_off",
  "led_get_state",
]);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function toHexByte(n) {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
}
function toHexWord(n) {
  return clamp(Math.round(n), 0, 65535).toString(16).padStart(4, "0");
}

function mapRange(v, inMin, inMax, outMin, outMax) {
  const t = (v - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

function getCanvasSize() {
  const host = document.getElementById("canvasWrap");
  if (!host) {
    return { w: window.innerWidth, h: window.innerHeight };
  }
  return {
    w: Math.max(1, Math.floor(host.clientWidth || window.innerWidth)),
    h: Math.max(1, Math.floor(host.clientHeight || window.innerHeight)),
  };
}

function resizeCanvasToViewport() {
  if (typeof width !== "number" || typeof height !== "number") return;
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
  rotX = -Math.atan2(-ayG, Math.sqrt(axG * axG + azG * azG));
  rotY = -Math.atan2(axG, Math.sqrt(ayG * ayG + azG * azG));
  rotZ = 0;
}

function updateGravity(axG, ayG, azG) {
  const alpha = 0.92;
  gravityG.x = alpha * gravityG.x + (1 - alpha) * axG;
  gravityG.y = alpha * gravityG.y + (1 - alpha) * ayG;
  gravityG.z = alpha * gravityG.z + (1 - alpha) * azG;
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
    window.removeEventListener("pointerup", wrapped);
    window.removeEventListener("touchend", wrapped);
    window.removeEventListener("click", wrapped);
    window.removeEventListener("keydown", wrapped);
    await handler();
  };
  window.addEventListener("pointerup", wrapped, { passive: true });
  window.addEventListener("touchend", wrapped, { passive: true });
  window.addEventListener("click", wrapped, { passive: true });
  window.addEventListener("keydown", wrapped, { passive: true });
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (wakeLockSentinel) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch (_) {
    // Best effort only.
  }
}

function orientationLockMode() {
  const type = (screen.orientation && screen.orientation.type) || "";
  return type.startsWith("landscape") ? "landscape" : "portrait";
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
    if (screen.orientation && typeof screen.orientation.lock === "function") {
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
  console.log("Tap detected!");
}

function setupMotion() {
  // Use DeviceMotion (accelerationIncludingGravity) in m/s^2 and convert to g
  function handler(e) {
    const axMs2 =
      e.accelerationIncludingGravity &&
      typeof e.accelerationIncludingGravity.x === "number"
        ? e.accelerationIncludingGravity.x
        : null;
    const ayMs2 =
      e.accelerationIncludingGravity &&
      typeof e.accelerationIncludingGravity.y === "number"
        ? e.accelerationIncludingGravity.y
        : null;
    const azMs2 =
      e.accelerationIncludingGravity &&
      typeof e.accelerationIncludingGravity.z === "number"
        ? e.accelerationIncludingGravity.z
        : null;
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
  window.addEventListener("devicemotion", handler, true);
  const needsPermission =
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function";
  if (needsPermission) {
    addOneShotGestureListener(async () => {
      await requestImmersiveMode();
      try {
        await DeviceMotionEvent.requestPermission();
      } catch (_) {}
      connectWs();
    });
  } else {
    requestImmersiveMode();
    addOneShotGestureListener(async () => {
      await requestImmersiveMode();
    });
    connectWs();
  }
}

// --- Command handling ---

function handleServerMessage(data) {
  const text = String(data).trim();
  if (!text) return;
  // Filter: commands are "word:rest"; hex frames, server greetings, and control msgs are ignored
  const colonIdx = text.indexOf(":");
  if (colonIdx === -1) return;
  const cmd = text.substring(0, colonIdx);
  if (!DEVICE_COMMANDS.has(cmd)) return;
  const params = text.substring(colonIdx + 1);
  applyCommand(cmd, params);
}

function applyCommand(cmd, params) {
  switch (cmd) {
    case "led": {
      const hex = params.trim().replace("#", "").toLowerCase();
      if (/^[0-9a-f]{6}$/.test(hex)) {
        ledColor = [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16),
        ];
        // Receiving a 'led' color command while on 'off' implicitly switches to solid
        if (ledPattern === "off") ledPattern = "solid";
      }
      break;
    }
    case "pattern": {
      const p = params.trim().toLowerCase();
      ledPattern = p;
      if (p === "spring") {
        // Reset spring to full brightness so it bounces down
        springPhysics.brightness = 1.0;
        springPhysics.velocity = 0;
        springPhysics.lastTime = 0;
      }
      break;
    }
    case "brightness": {
      const b = parseInt(params, 10);
      if (!isNaN(b)) ledBrightness = clamp(b, 0, 255) / 255;
      break;
    }
    case "spring_param": {
      // 6 hex chars: kk dd mm (spring constant, damping, mass)
      const s = params.trim();
      if (s.length >= 6) {
        springPhysics.k = parseInt(s.substring(0, 2), 16) / 10;
        springPhysics.damping = parseInt(s.substring(2, 4), 16) / 10;
        springPhysics.mass = parseInt(s.substring(4, 6), 16) / 10 + 0.1;
      }
      break;
    }
    case "vibrate": {
      const dur = parseInt(params, 10);
      if (dur > 0) {
        vibEndTime = Date.now() + dur;
      }
      break;
    }
    case "reset": {
      // Mirror firmware: reset current LED behavior
      springPhysics.brightness = 1.0;
      springPhysics.velocity = 0;
      springPhysics.lastTime = 0;
      break;
    }
    case "led_set": {
      // Format: index:color_hex
      // Example: 0:ff0000 (LED 0, red)
      const colonIdx = params.indexOf(":");
      if (colonIdx > 0) {
        const index = parseInt(params.substring(0, colonIdx), 10);
        const colorHex = params
          .substring(colonIdx + 1)
          .trim()
          .toLowerCase();
        if (index >= 0 && index < 6 && /^[0-9a-f]{6}$/.test(colorHex)) {
          const r = parseInt(colorHex.substring(0, 2), 16);
          const g = parseInt(colorHex.substring(2, 4), 16);
          const b = parseInt(colorHex.substring(4, 6), 16);
          individualLeds[index] = {
            isOn: true,
            color: [r, g, b],
          };
          updateLedIndicators();
        }
      }
      break;
    }
    case "led_off": {
      // Format: index
      const index = parseInt(params.trim(), 10);
      if (index >= 0 && index < 6) {
        individualLeds[index] = {
          isOn: false,
          color: [0, 0, 0],
        };
        updateLedIndicators();
      }
      break;
    }
    case "led_all_off": {
      // Turn all LEDs off
      for (let i = 0; i < 6; i++) {
        individualLeds[i] = {
          isOn: false,
          color: [0, 0, 0],
        };
      }
      updateLedIndicators();
      break;
    }
    case "led_get_state": {
      // Debug command - just log to console
      console.log("LED States:", individualLeds);
      break;
    }
    // 'status' and 'ota' are not emulated visually
  }
}

function updateLedIndicators() {
  const container = document.getElementById("ledIndicators");
  if (!container) return;

  // Clear existing LEDs
  container.innerHTML = "";

  // Create 6 LED indicators
  for (let i = 0; i < 6; i++) {
    const led = document.createElement("div");
    led.className = "led";
    const state = individualLeds[i];

    if (state.isOn) {
      led.classList.add("on");
      const r = state.color[0];
      const g = state.color[1];
      const b = state.color[2];
      led.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      led.style.color = `rgb(${r}, ${g}, ${b})`;
    } else {
      led.style.backgroundColor = "#333";
    }

    container.appendChild(led);
  }
}

function connectWs() {
  try {
    if (ws) ws.close();
  } catch (e) {}
  ws = new WebSocket(wsUrl);
  ws.addEventListener("open", () => {
    ws.send("s");
  });
  ws.addEventListener("message", (event) => {
    handleServerMessage(event.data);
  });
}

let lastFrame = "";
function encodeFrame() {
  // Update tap state - check if tap duration has expired
  const now = Date.now();
  if (tapState && now - tapDuration > TAP_DURATION_MS) {
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
  const ds = corners.map((c) => {
    const d = Math.hypot(circlePos.x - c.x, circlePos.y - c.y);
    return clamp(Math.round(mapRange(d, 0, maxDist, 255, 0)), 0, 255);
  });
  const idHex = deviceId;
  const tapByte = tapState ? 255 : 0; // 255 = tapped, 0 = not tapped
  lastFrame =
    `${idHex}${toHexByte(acc.ax)}${toHexByte(acc.ay)}${toHexByte(acc.az)}${toHexByte(ds[0])}${toHexByte(ds[1])}${toHexByte(ds[2])}${toHexByte(ds[3])}${toHexByte(tapByte)}`.toLowerCase();
  return `${lastFrame}\n`;
}

function sendFrame() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  let frame = encodeFrame();
  console.log("Sending frame:", frame);
  ws.send(frame);
}

// --- LED color/pattern computation ---

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Heartbeat brightness: mirrors firmware HeartBeatBehavior timing within a 2s cycle
function getHeartbeatBrightness(now) {
  const PERIOD = 2000;
  const FI1 = 60,
    FO1 = 150,
    PZ = 100,
    FI2 = 60,
    FO2 = 400; // pulse = 770ms, idle = 1230ms
  const t = now % PERIOD;
  if (t < FI1) return t / FI1;
  if (t < FI1 + FO1) return 1 - (t - FI1) / FO1;
  if (t < FI1 + FO1 + PZ) return 0;
  const t4 = t - (FI1 + FO1 + PZ);
  if (t4 < FI2) return t4 / FI2;
  const t5 = t4 - FI2;
  if (t5 < FO2) return 1 - t5 / FO2;
  return 0; // idle
}

// Returns the effective [r, g, b] display color for the LED based on current pattern
function computeLedColor(now) {
  switch (ledPattern) {
    case "off":
      return [0, 0, 0];

    case "solid": {
      const b = ledBrightness;
      return [ledColor[0] * b, ledColor[1] * b, ledColor[2] * b];
    }

    case "breathing": {
      // 4-second sine-wave period (mirrors firmware BreathingBehavior default duration)
      const sine = Math.sin(((now % 4000) / 4000) * 2 * Math.PI);
      const b = (ledBrightness * (sine + 1)) / 2;
      return [ledColor[0] * b, ledColor[1] * b, ledColor[2] * b];
    }

    case "heartbeat": {
      const b = ledBrightness * getHeartbeatBrightness(now);
      return [ledColor[0] * b, ledColor[1] * b, ledColor[2] * b];
    }

    case "cycle": {
      // Hue cycles every 3 seconds regardless of ledColor
      const rgb = hslToRgb((now / 3000) % 1, 1, 0.5);
      return [
        rgb[0] * ledBrightness,
        rgb[1] * ledBrightness,
        rgb[2] * ledBrightness,
      ];
    }

    case "spring": {
      // Hooke's law physics (mirrors firmware SpringBehavior)
      if (springPhysics.lastTime === 0) {
        springPhysics.lastTime = now;
      } else {
        const dt = (now - springPhysics.lastTime) / 1000; // s
        springPhysics.lastTime = now;
        const disp = springPhysics.brightness - 0; // target brightness = 0
        const fSpring = -springPhysics.k * disp;
        const fDamp = -springPhysics.damping * springPhysics.velocity;
        springPhysics.velocity += ((fSpring + fDamp) / springPhysics.mass) * dt;
        springPhysics.brightness += springPhysics.velocity * dt;
      }
      const b = ledBrightness * Math.abs(springPhysics.brightness);
      return [ledColor[0] * b, ledColor[1] * b, ledColor[2] * b];
    }

    default:
      return [0, 0, 0];
  }
}

// --- Vibration ring helpers ---

// Spawn and draw eccentric expanding rings while vibrating.
// The motor's eccentric mass rotates quickly; we offset the ring spawn point along that path
// to simulate the physical movement of an eccentric-weight vibration motor.
const RING_LIFE = 1100; // ms — long enough for rings to travel well clear of the glow

function updateVibrationRings(now) {
  const isVibrating = now < vibEndTime;

  if (isVibrating) {
    // Eccentric motor speed: visually ~18 rotations/s
    const motorAngle = (now / 1000) * 18 * Math.PI * 2;
    const eccRadius = 18; // px offset from circle center
    const spawnX = circlePos.x + eccRadius * Math.cos(motorAngle);
    const spawnY = circlePos.y + eccRadius * Math.sin(motorAngle);

    // Spawn a new ring every ~65ms
    if (now - lastRingSpawnTime > 65) {
      vibRings.push({ x: spawnX, y: spawnY, startTime: now });
      lastRingSpawnTime = now;
    }
  }

  vibRings = vibRings.filter((r) => now - r.startTime < RING_LIFE);
}

function drawVibrationRings(now) {
  // Drawn last so nothing paints over them
  noFill();
  for (const r of vibRings) {
    const progress = (now - r.startTime) / RING_LIFE; // 0→1
    const radius = 38 + progress * 220; // expand from just outside circle to large radius
    const alpha = (1 - progress) * (1 - progress) * 230; // quadratic fade
    const sw = 4 * (1 - progress) + 1;
    stroke(255, 200, 80, alpha);
    strokeWeight(sw);
    circle(r.x, r.y, radius * 2);
  }
}

// Draw a colored glow behind the circle to represent the LED
function drawLedGlow(cx, cy, rgb) {
  const [r, g, b] = rgb;
  const brightness = (r + g + b) / (3 * 255);
  if (brightness < 0.01) return; // nothing to draw
  noStroke();
  // Soft outer glow layers
  for (let i = 4; i >= 1; i--) {
    const radius = 30 + i * 18;
    const alpha = brightness * (60 / i);
    fill(r, g, b, alpha);
    circle(cx, cy, radius * 2);
  }
}

window.preload = function () {
  // Load a web-safe TTF so WEBGL text rendering is enabled
  uiFont = loadFont(
    "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf",
  );
};

window.setup = function () {
  const { w, h } = getCanvasSize();
  const c = createCanvas(w, h, WEBGL);
  c.parent(document.getElementById("canvasWrap"));
  canvasEl = c.elt;
  if (uiFont) {
    textFont(uiFont);
  }
  textSize(16);
  circlePos.x = width / 2;
  circlePos.y = height / 2;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
    }
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resizeCanvasToViewport);
  }
  resizeObserver = new ResizeObserver(() => {
    resizeCanvasToViewport();
  });
  const host = document.getElementById("canvasWrap");
  if (host) {
    resizeObserver.observe(host);
  }
  setupMotion();
  updateLedIndicators(); // Show 6 LEDs at startup
  setInterval(sendFrame, 50); // 20 Hz
};

window.draw = function () {
  background(0);
  const now = Date.now();

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
  stroke(255, 64, 64);
  line(0, 0, 0, 80, 0, 0); // X - red
  stroke(64, 255, 64);
  line(0, 0, 0, 0, 80, 0); // Y - green
  stroke(64, 128, 255);
  line(0, 0, 0, 0, 0, 80); // Z - blue
  pop();

  // 2D overlay for beacons, draggable circle, HUD
  push();
  resetMatrix();
  translate(-width / 2, -height / 2);

  const sz = 24;
  noStroke();
  fill(0, 255, 255);
  rect(0, 0, sz, sz); // TL cyan
  fill(255, 0, 255);
  rect(width - sz, 0, sz, sz); // TR magenta
  fill(255, 255, 0);
  rect(width - sz, height - sz, sz, sz); // BR yellow
  fill(255, 165, 0);
  rect(0, height - sz, sz, sz); // BL orange

  // Compute current LED display color
  const ledRgb = computeLedColor(now);

  // Update vibration ring state
  updateVibrationRings(now);

  // Draw LED glow behind the circle
  drawLedGlow(circlePos.x, circlePos.y, ledRgb);

  // Draw the sensor circle — LED color fill, tap overrides to white flash
  if (tapState) {
    fill(255, 255, 255);
    stroke(255, 0, 0);
    strokeWeight(3);
  } else if (ledPattern === "off") {
    // No LED command yet — show dim grey so the circle is still visible
    fill(60, 60, 60);
    noStroke();
  } else {
    fill(ledRgb[0], ledRgb[1], ledRgb[2]);
    noStroke();
  }
  circle(circlePos.x, circlePos.y, 60);

  // Draw vibration rings on top of everything so glow/circle don't obscure them
  drawVibrationRings(now);

  // HUD text
  noStroke();
  fill(255);
  textAlign(CENTER);
  const wsStatus = ws
    ? ws.readyState === WebSocket.OPEN
      ? "connected"
      : ws.readyState === WebSocket.CONNECTING
        ? "connecting"
        : "disconnected"
    : "disconnected";
  const controlMode = hasAccelerometer ? "accelerometer" : "touch-fallback";
  const tapStatus = tapState ? "TAPPED!" : "tap: click circle or T/SPACE";
  const isVibrating = now < vibEndTime;
  const vibStatus = isVibrating
    ? `vibrating (${Math.ceil(((vibEndTime - now) / 1000) * 10) / 10}s)`
    : "";
  const ledHex = ledColor
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("");
  const ledStatus = `led: #${ledHex}  pattern: ${ledPattern}  brightness: ${Math.round(ledBrightness * 255)}`;

  text(
    `status: ${wsStatus}  id: ${deviceId}  mode: ${controlMode}`,
    width / 2,
    height - 54,
  );
  text(ledStatus + (vibStatus ? `  ${vibStatus}` : ""), width / 2, height - 36);
  text(`tap: ${tapStatus}`, width / 2, height - 18);
  text(lastFrame || "", width / 2, height - 6);
  pop();
};

function handleCirclePointer(x, y) {
  circlePos.x = clamp(x, 0, width);
  circlePos.y = clamp(y, 0, height);
}

function startInteraction(x, y) {
  const dx = x - circlePos.x;
  const dy = y - circlePos.y;
  const insideCircle = dx * dx + dy * dy <= 60 * 60;

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

window.mousePressed = function () {
  startInteraction(mouseX, mouseY);
};
window.mouseDragged = function () {
  continueInteraction(mouseX, mouseY);
};
window.mouseReleased = function () {
  endInteraction();
};

window.touchStarted = function (e) {
  if (e.touches && e.touches[0]) {
    const p = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    startInteraction(p.x, p.y);
  }
  return false;
};
window.touchMoved = function (e) {
  if (e.touches && e.touches[0]) {
    const p = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    continueInteraction(p.x, p.y);
  }
  return false;
};
window.touchEnded = function () {
  endInteraction();
};

window.windowResized = function () {
  resizeCanvasToViewport();
};

// Keyboard support for tap detection
window.keyPressed = function () {
  if (key === " " || key === "t" || key === "T") {
    triggerTap();
  }
};
