class FirstDeviceDetailsScene extends Scene {
    setup() {}
    draw() {
        background(220);
        const dm = this.deviceManager;
        const count = dm.getDeviceCount();
        if (count === 0) return;
        const first = dm.getAllDevices().values().next().value;
        const data = first.getSensorData();
        fill(0);
        textAlign(LEFT, TOP);
        textSize(16);
        text(`Device ID: ${data.id}`, 10, 40);
        text(`Accel: ${data.ax}, ${data.ay}, ${data.az}`, 10, 60);
        text(`Distances: NW:${data.dNW} NE:${data.dNE} SW:${data.dSW} SE:${data.dSE}`, 10, 80);
    }
    
    drawDebugText() {
        blendMode(BLEND);
        fill(0);
        textAlign(LEFT, TOP);
        textSize(16);
        text(`Devices: ${this.deviceManager.getDeviceCount()}`, 10, 20);
        text('Press D to toggle debug info', 10, height - 20);
    }
}



