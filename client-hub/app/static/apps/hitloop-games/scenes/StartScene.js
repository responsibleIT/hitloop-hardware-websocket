class StartScene extends Scene {
  constructor(...a) {
    super(...a);
    this.deviceRadius = 40;
    this._devState = new Map();
  }
  setup() {}
  _updateDevice(k) {
    let p = this._devState.get(k);
    if (!p) {
      p = { x: random(60, width - 60), y: random(60, height - 60) };
      this._devState.set(k, p);
    }
    return p;
  }
  draw() {
    background(0);
    const devs = [...this.deviceManager.getAllDevices().values()];
    noStroke();
    for (const dev of devs) {
      const key = dev.id ?? dev.getId?.() ?? dev,
        p = this._updateDevice(key);
      if (window.DeviceCircle) {
        window.DeviceCircle.draw(p.x, p.y, this.deviceRadius);
      } else {
        // fallback if DeviceCircle isn't loaded
        fill(255); ellipse(p.x, p.y, this.deviceRadius * 2);
        fill(255); ellipse(p.x - 16, p.y - 10, 32, 32); ellipse(p.x + 16, p.y - 10, 32, 32);
        fill(0);   ellipse(p.x - 16, p.y - 10, 12, 12);  ellipse(p.x + 16, p.y - 10, 12, 12);
      }
    }
    fill(255);
    noStroke();
    text(
      `Devices: ${this.deviceManager.getDeviceCount?.() ?? devs.length}`,
      10,
      20
    );
  }
}
