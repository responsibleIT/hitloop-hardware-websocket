class DeviceListScene extends Scene {
    setup() {}
    draw() {
        background(220);
        const dm = this.deviceManager;
        const count = dm.getDeviceCount();
        let y = 40;
        for (const device of dm.getAllDevices().values()) {
            const d = device.getSensorData();
            fill(0);
            text(`ID:${d.id} ax:${d.ax} ay:${d.ay} az:${d.az}`, 10, y);
            y += 16;
            if (y > height - 10) break;
        }
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



