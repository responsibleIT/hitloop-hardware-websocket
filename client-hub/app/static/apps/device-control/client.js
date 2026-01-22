let manager = null;
let selectedDevices = new Set();
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionEnd = { x: 0, y: 0 };
let selectionBox = null;

// Device positioning based on beacon signal strength
function getDevicePosition(device) {
    const data = device.getSensorData();
    const canvasWidth = width;
    const canvasHeight = height - 42; // Account for toolbar
    
    // Use dNW (North-West) for X position: stronger signal = more left
    // Use dNE (North-East) for Y position: stronger signal = more up
    const x = map(data.dNW, 0, 255, canvasWidth - 100, 50);
    const y = map(data.dNE, 0, 255, canvasHeight - 100, 50);
    
    return { x: constrain(x, 25, canvasWidth - 25), y: constrain(y, 25, canvasHeight - 25) };
}

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
    selectedDevices.clear();
    updateSelectedDevicesUI();
}

function setStatus(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
}

function updateSelectedDevicesUI() {
    const selectedInfo = document.getElementById('selectedInfo');
    const deviceList = document.getElementById('deviceList');
    
    if (selectedDevices.size === 0) {
        selectedInfo.style.display = 'none';
        // Disable all apply buttons
        document.querySelectorAll('.apply-btn').forEach(btn => btn.disabled = true);
        return;
    }
    
    selectedInfo.style.display = 'block';
    deviceList.innerHTML = '';
    
    selectedDevices.forEach(deviceId => {
        const deviceItem = document.createElement('div');
        deviceItem.className = 'device-item';
        deviceItem.textContent = deviceId;
        deviceList.appendChild(deviceItem);
    });
    
    // Enable all apply buttons
    document.querySelectorAll('.apply-btn').forEach(btn => btn.disabled = false);
}

function isPointInSelection(x, y) {
    const left = Math.min(selectionStart.x, selectionEnd.x);
    const right = Math.max(selectionStart.x, selectionEnd.x);
    const top = Math.min(selectionStart.y, selectionEnd.y);
    const bottom = Math.max(selectionStart.y, selectionEnd.y);
    
    return x >= left && x <= right && y >= top && y <= bottom;
}

function updateSelection() {
    if (!manager) return;
    
    selectedDevices.clear();
    
    for (const [id, device] of manager.getAllDevices()) {
        const pos = getDevicePosition(device);
        if (isPointInSelection(pos.x, pos.y)) {
            selectedDevices.add(id);
        }
    }
    
    updateSelectedDevicesUI();
}

function setup() {
    const container = document.getElementById('canvas-container');
    const canvas = createCanvas(window.innerWidth - 350, window.innerHeight - 42);
    canvas.parent(container);
    
    // WebSocket connection controls
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const urlInput = document.getElementById('wsUrl');
    
    connectBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (url) {
            connect(url);
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
        }
    });
    
    disconnectBtn.addEventListener('click', () => {
        disconnect();
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
    });
    
    // Command application handlers
    setupCommandHandlers();
    
    // Range slider value updates
    setupRangeSliders();
}

function setupRangeSliders() {
    // Spring parameters
    const springConstant = document.getElementById('springConstant');
    const springConstantValue = document.getElementById('springConstantValue');
    springConstant.addEventListener('input', () => {
        springConstantValue.textContent = springConstant.value;
    });
    
    const springDamping = document.getElementById('springDamping');
    const springDampingValue = document.getElementById('springDampingValue');
    springDamping.addEventListener('input', () => {
        springDampingValue.textContent = springDamping.value;
    });
    
    const springMass = document.getElementById('springMass');
    const springMassValue = document.getElementById('springMassValue');
    springMass.addEventListener('input', () => {
        springMassValue.textContent = springMass.value;
    });
    
    // LED brightness
    const ledBrightness = document.getElementById('ledBrightness');
    const ledBrightnessValue = document.getElementById('ledBrightnessValue');
    ledBrightness.addEventListener('input', () => {
        ledBrightnessValue.textContent = ledBrightness.value;
    });
}

function setupCommandHandlers() {
    // LED Color
    document.getElementById('applyLedColor').addEventListener('click', () => {
        const color = document.getElementById('ledColor').value;
        const hexColor = color.substring(1); // Remove # prefix
        
        selectedDevices.forEach(deviceId => {
            manager.sendCommandToDevice(deviceId, 'led', hexColor);
        });
    });
    
    // LED Pattern
    document.getElementById('applyLedPattern').addEventListener('click', () => {
        const pattern = document.getElementById('ledPattern').value;
        
        selectedDevices.forEach(deviceId => {
            manager.sendCommandToDevice(deviceId, 'pattern', pattern);
        });
    });
    
    // Spring Parameters
    document.getElementById('applySpringParams').addEventListener('click', () => {
        const springConstant = document.getElementById('springConstant').value;
        const springDamping = document.getElementById('springDamping').value;
        const springMass = document.getElementById('springMass').value;
        
        // Convert to hex string (pad with zeros if needed)
        const hexParams = 
            parseInt(springConstant).toString(16).padStart(2, '0') +
            parseInt(springDamping).toString(16).padStart(2, '0') +
            parseInt(springMass).toString(16).padStart(2, '0');
        
        selectedDevices.forEach(deviceId => {
            manager.sendCommandToDevice(deviceId, 'spring_param', hexParams);
        });
    });
    
    // LED Brightness
    document.getElementById('applyLedBrightness').addEventListener('click', () => {
        const brightness = document.getElementById('ledBrightness').value;
        
        selectedDevices.forEach(deviceId => {
            manager.sendCommandToDevice(deviceId, 'brightness', brightness);
        });
    });
    
    // Vibration
    document.getElementById('applyVibration').addEventListener('click', () => {
        const duration = document.getElementById('vibrationDuration').value;
        
        selectedDevices.forEach(deviceId => {
            manager.sendCommandToDevice(deviceId, 'vibrate', duration);
        });
    });
    
    // Reset
    document.getElementById('applyReset').addEventListener('click', () => {
        selectedDevices.forEach(deviceId => {
            manager.sendCommandToDevice(deviceId, 'reset');
        });
    });
}

function windowResized() {
    resizeCanvas(window.innerWidth - 350, window.innerHeight - 42);
}

function draw() {
    background(250);
    
    if (manager) {
        // Update status
        const ws = manager.ws;
        const ready = ws && ws.readyState === WebSocket.OPEN;
        if (ready) {
            setStatus(`connected • devices: ${manager.getDeviceCount()}`);
        } else {
            setStatus('disconnected');
        }
        
        // Draw devices
        for (const [id, device] of manager.getAllDevices()) {
            const pos = getDevicePosition(device);
            const data = device.getSensorData();
            const isSelected = selectedDevices.has(id);
            
            // Device circle
            if (isSelected) {
                fill(59, 130, 246, 200); // Blue for selected
                stroke(29, 78, 216);
                strokeWeight(3);
            } else {
                fill(34, 197, 94, 200); // Green for unselected
                stroke(22, 163, 74);
                strokeWeight(2);
            }
            
            circle(pos.x, pos.y, 20);
            
            // Device ID label
            fill(30);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(10);
            text(id, pos.x, pos.y);
            
            // Signal strength indicators
            fill(255, 0, 0, 150);
            noStroke();
            textAlign(LEFT, TOP);
            textSize(8);
            text(`NW:${data.dNW}`, pos.x + 15, pos.y - 15);
            text(`NE:${data.dNE}`, pos.x + 15, pos.y - 5);
        }
    }
    
    // Draw selection box
    if (isSelecting) {
        fill(59, 130, 246, 50);
        stroke(59, 130, 246);
        strokeWeight(2);
        rect(selectionStart.x, selectionStart.y, 
             selectionEnd.x - selectionStart.x, 
             selectionEnd.y - selectionStart.y);
    }
    
    // Instructions
    if (!manager || !manager.ws || manager.ws.readyState !== WebSocket.OPEN) {
        fill(120);
        noStroke();
        textSize(14);
        textAlign(LEFT, TOP);
        text('Connect to WebSocket to see devices. Drag to select devices for control.', 20, 20);
    } else if (selectedDevices.size === 0) {
        fill(100);
        noStroke();
        textSize(12);
        textAlign(LEFT, TOP);
        text('Drag to select devices, then use controls on the right.', 20, 20);
    }
}

function mousePressed() {
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
    
    isSelecting = true;
    selectionStart.x = mouseX;
    selectionStart.y = mouseY;
    selectionEnd.x = mouseX;
    selectionEnd.y = mouseY;
}

function mouseDragged() {
    if (!isSelecting) return;
    
    selectionEnd.x = mouseX;
    selectionEnd.y = mouseY;
}

function mouseReleased() {
    if (!isSelecting) return;
    
    isSelecting = false;
    updateSelection();
}
