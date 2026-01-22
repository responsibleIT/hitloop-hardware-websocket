let manager = null;
let tapStates = new Map(); // Track tap visualization state for each device

function ensureManager(url) {
  if (!manager || manager.websocketUrl !== url) {
    manager = new HitloopDeviceManager(url);
  }
  return manager;
}

function connect(url) {
  const m = ensureManager(url);
  try {
    setStatus('connecting…');
    m.connect();
  } catch (_e) {
    setStatus('error');
  }
}

function disconnect() {
  if (manager) {
    manager.disconnect();
  }
  setStatus('disconnected');
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function updateTapStates() {
  if (!manager) return;
  
  for (const [id, device] of manager.getAllDevices()) {
    const data = device.getSensorData();
    const currentTap = data.tap;
    
    if (!tapStates.has(id)) {
      tapStates.set(id, { active: false, frames: 0 });
    }
    
    const tapState = tapStates.get(id);
    
    if (currentTap) {
      // Tap detected, start showing for 5 frames
      tapState.active = true;
      tapState.frames = 5;
    } else if (tapState.frames > 0) {
      // Countdown frames
      tapState.frames--;
      if (tapState.frames === 0) {
        tapState.active = false;
      }
    }
  }
}

function setup() {
  const container = document.getElementById('canvas-container');
  const canvas = createCanvas(window.innerWidth, window.innerHeight - 42);
  canvas.parent(container);

  const connectBtn = document.getElementById('connectBtn');
  const urlInput = document.getElementById('wsUrl');
  connectBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) connect(url);
  });
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight - 42);
}

function draw() {
  background(250);
  const padding = 16;
  const cellW = 220;
  const cellH = 160;
  const gap = 12;
  const cols = max(1, floor((width - padding*2 + gap) / (cellW + gap)));

  let i = 0;
  if (manager) {
    // Update tap states first
    updateTapStates();
    
    // update status once per frame based on manager connection state
    const ws = manager.ws;
    const ready = ws && ws.readyState === WebSocket.OPEN;
    if (ready) {
      setStatus(`connected • devices: ${manager.getDeviceCount()}`);
    } else {
      setStatus('disconnected');
    }

    for (const [id, device] of manager.getAllDevices()) {
      const r = floor(i / cols);
      const c = i % cols;
      const x = padding + c * (cellW + gap);
      const y = padding + r * (cellH + gap);
      drawDeviceCell(device, x, y, cellW, cellH);
      i++;
    }
  }

  const isReady = manager && manager.ws && manager.ws.readyState === WebSocket.OPEN;
  if (!isReady) {
    fill(120); noStroke(); textSize(14);
    text('Enter WS URL (e.g., ws://localhost:5003/) and Connect. Frames: 20-char hex (id+ax+ay+az+d1..d4+tap).', padding, height - padding);
  }
}

function drawDeviceCell(device, x, y, w, h) {
  stroke(220); fill(255);
  rect(x, y, w, h, 8);

  // header: device ID
  fill(30); noStroke(); textSize(16);
  textAlign(LEFT, BASELINE);
  const data = device.getSensorData();
  text(data.id, x + 12, y + 22);

  // 8 bars: ax, ay, az, d1, d2, d3, d4, tap
  const labels = ['ax', 'ay', 'az', 'd1', 'd2', 'd3', 'd4', 'tap'];
  // Map device fields to legacy order: d1=dNW, d2=dNE, d3=dSE, d4=dSW
  const values = [
    // accelerometer: convert 0..255 into roughly -2..2 range like previous UI
    (data.ax / 255) * 4 - 2,
    (data.ay / 255) * 4 - 2,
    (data.az / 255) * 4 - 2,
    data.dNW,
    data.dNE,
    data.dSE,
    data.dSW,
    // Tap detection: use tap state with 5-frame persistence
    tapStates.has(data.id) && tapStates.get(data.id).active ? 100 : 0
  ];
  // Accelerometer colors (R,G,B) + beacon distance colors (cyan, magenta, yellow, orange) + tap (purple)
  const colorsArr = [
    color(239,68,68),   // ax - red
    color(34,197,94),   // ay - green
    color(59,130,246),  // az - blue
    color(0,255,255),   // d1 - cyan (top-left)
    color(255,0,255),   // d2 - magenta (top-right)
    color(255,255,0),   // d3 - yellow (bottom-right)
    color(255,165,0),   // d4 - orange (bottom-left)
    color(147,51,234)   // tap - purple
  ];

  const plotX = x + 12;
  const plotY = y + 36;
  const plotW = w - 24;
  const plotH = 90;

  const barW = 20;
  const barGap = Math.max(8, Math.floor((plotW - 8*barW) / 7));
  let bx = plotX;

  // Axes background
  stroke(230); line(plotX, plotY + plotH/2, plotX + plotW, plotY + plotH/2);

  for (let i = 0; i < 8; i++) {
    const v = values[i];
    const col = colorsArr[i];
    const label = labels[i];
    let hpx = 0;
    if (i <= 2) {
      // accel -2..2 g scaled to -100..100 px
      hpx = constrain(v * 50, -100, 100);
    } else if (i === 7) {
      // tap detection: 0 or 100 scaled to 0..100 px
      hpx = constrain(map(v, 0, 100, 0, 100), 0, 100);
    } else {
      // distances 0..255 scaled to 0..100 px
      hpx = constrain(map(v, 0, 255, 0, 100), 0, 100);
    }
    stroke(200); line(bx - 14, plotY + plotH/2, bx + 14, plotY + plotH/2);
    noStroke(); fill(col);
    if (i <= 2) {
      if (hpx >= 0) rect(bx - barW/2, plotY + plotH/2 - hpx, barW, hpx, 4);
      else rect(bx - barW/2, plotY + plotH/2, barW, -hpx, 4);
    } else {
      // distances and tap: always draw upward
      rect(bx - barW/2, plotY + plotH/2 - hpx, barW, hpx, 4);
    }
    fill(60); textSize(12); noStroke(); textAlign(CENTER);
    text(label, bx, plotY + plotH/2 + 16);
    bx += barW + barGap;
  }

  // raw frame
  fill(80); noStroke(); textSize(12); textAlign(LEFT, BASELINE);
  // Manager normalizes data, raw frame not tracked; show summarized values
  const rawText = `ax:${Math.round(values[0]*100)/100} ay:${Math.round(values[1]*100)/100} az:${Math.round(values[2]*100)/100}`;
  text(rawText, x + 12, y + h - 12);
}
