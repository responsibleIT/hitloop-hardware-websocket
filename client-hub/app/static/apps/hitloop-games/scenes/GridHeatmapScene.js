class GridHeatmapScene extends Scene {
    setup() {}
    draw() {
        background(0);
        const dm = this.deviceManager;
        const devices = Array.from(dm.getAllDevices().values());
        
        if (devices.length === 0) {
            fill(255);
            text('No devices found', 10, height - 10);
            return;
        }
        
        // 5x5 grid
        const gridCols = 5;
        const gridRows = 5;
        const margin = 40;
        const cellW = (width - margin * 2) / gridCols;
        const cellH = (height - margin * 2) / gridRows;
        
        // Display devices in grid positions
        for (let i = 0; i < Math.min(devices.length, gridCols * gridRows); i++) {
            const device = devices[i];
            const d = device.getSensorData();
            
            // Calculate movement magnitude (sqrt(ax^2 + ay^2 + az^2))
            const movement = Math.sqrt(d.ax * d.ax + d.ay * d.ay + d.az * d.az);
            
            // Map movement to circle size (0-50 pixels)
            const maxMovement = Math.sqrt(3 * 255 * 255); // max possible for 3 axes at 255
            const circleSize = map(movement, 0, maxMovement, 5, 50);
            
            // Map accelerometer values from -1g to 1g (assuming 0-255 range maps to -2g to +2g)
            // So 0-255 maps to -2g to +2g, we want -1g to +1g to map to 0-255
            const mapAccel = (accel) => {
                const gValue = map(accel, 0, 255, -2, 2); // Convert to g values
                return constrain(map(gValue, -1, 1, 0, 255), 0, 255);
            };
            
            const r = mapAccel(d.ax);
            const g = mapAccel(d.ay);
            const b = mapAccel(d.az);
            
            // Calculate grid position
            const col = i % gridCols;
            const row = Math.floor(i / gridCols);
            const x = margin + col * cellW + cellW / 2;
            const y = margin + row * cellH + cellH / 2;
            
            // Draw circle
            fill(r, g, b);
            noStroke();
            circle(x, y, circleSize);
            
            // Draw device ID
            fill(255);
            textAlign(CENTER);
            text(d.id, x, y + 32);
        }
        
        // Reset text alignment
        textAlign(LEFT);
    }
    
    drawDebugText() {
        blendMode(BLEND);
        fill(255);
        textAlign(LEFT, TOP);
        textSize(16);
        text(`Devices: ${this.deviceManager.getDeviceCount()}`, 10, 20);
        text('Size: movement magnitude, Color: accelerometer (R:ax, G:ay, B:az)', 10, height - 30);
        text('Press D to toggle debug info', 10, height - 10);
    }
}



