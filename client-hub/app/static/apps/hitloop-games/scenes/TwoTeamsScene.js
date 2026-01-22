// socket-demo/scenes/TwoTeamsScene.js
class DeviceTeamCircle {
  constructor(key, team, color, radius, deviceManager) {
    this.id = key;
    this.team = team;
    this.color = color;
    this.radius = radius;
    this.deviceManager = deviceManager;
    this.setRandomPosition();
    this.eyeSeparation = 16;
    this.eyeRadius = 12;
    this.lastLedHex = undefined;
  }

  setRandomPosition() {
    this.position = {
      x: random(60, width - 60),
      y: random(60, height - 60)
    };
  }

  updateTeam(team, color) {
    this.team = team;
    this.color = color;
  }

  initializeColorAndPattern() {
    const wantHex = this.color.hex.toLowerCase();
    try {
      this.deviceManager.sendCommandToDevice?.(this.id, "led", wantHex);
      this.lastLedHex = wantHex;
    } catch (_) {}
  }

  draw() {
    noStroke();
    fill(...this.color.rgb);
    ellipse(this.position.x, this.position.y, this.radius * 2);
    fill(0);
    ellipse(this.position.x - this.eyeSeparation, this.position.y - 10, this.eyeRadius, this.eyeRadius);
    ellipse(this.position.x + this.eyeSeparation, this.position.y - 10, this.eyeRadius, this.eyeRadius);
  }
}

class TwoTeamsScene extends Scene {
  constructor(...a) {
    super(...a);
    this.deviceRadius = 40;
    this._teamById = new Map();
    this.colors = {
      blue: { rgb: [0, 0, 255], hex: "0000ff" },
      red: { rgb: [255, 0, 0], hex: "ff0000" },
    };
    this._deviceCircles = new Map();
  }

  setup() {
    this._deviceCircles.clear();
    this._teamById.clear();
    const devs = [...this.deviceManager.getAllDevices().values()];
    this._assignTeamsEqual(devs);
    for (const dev of devs) {
      const key = dev.id ?? dev.getId?.() ?? dev;
      const team = this._teamById.get(key) || "blue";
      const col = this.colors[team];
      const dc = new DeviceTeamCircle(key, team, col, this.deviceRadius, this.deviceManager);
      dc.initializeColorAndPattern();
      this._deviceCircles.set(key, dc);
    }
  }

  _assignTeamsEqual(devs) {
    const ids = devs.map((d) => d.id ?? d.getId?.() ?? d);
    const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
    const n = sorted.length;
    const blueCount = Math.floor(n / 2);
    const blueSet = new Set(sorted.slice(0, blueCount));
    for (const id of ids)
      this._teamById.set(id, blueSet.has(id) ? "blue" : "red");
  }

  draw() {
    background(0);
    // Check for newly connected or removed devices
    const devs = [...this.deviceManager.getAllDevices().values()];
    const present = new Set(devs.map((d) => d.id ?? d.getId?.() ?? d));
    // Remove missing
    for (const id of [...this._deviceCircles.keys()]) {
      if (!present.has(id)) {
        this._deviceCircles.delete(id);
        this._teamById.delete(id);
      }
    }
    // Add newly connected
    let needsTeamAssign = false;
    for (const dev of devs) {
      const key = dev.id ?? dev.getId?.() ?? dev;
      if (!this._deviceCircles.has(key)) {
        needsTeamAssign = true;
        break;
      }
    }
    if (needsTeamAssign) {
      // Reassign all teams and re-init just new ones
      this._assignTeamsEqual(devs);
      for (const dev of devs) {
        const key = dev.id ?? dev.getId?.() ?? dev;
        const team = this._teamById.get(key) || "blue";
        const col = this.colors[team];
        if (!this._deviceCircles.has(key)) {
          const dc = new DeviceTeamCircle(key, team, col, this.deviceRadius, this.deviceManager);
          dc.initializeColorAndPattern();
          this._deviceCircles.set(key, dc);
        } else {
          // Update team/color if changed (do not re-init LED unless changed)
          const dc = this._deviceCircles.get(key);
          if (dc.team !== team || dc.color !== col) {
            dc.updateTeam(team, col);
            dc.initializeColorAndPattern();
          }
        }
      }
    }
    // Draw all device circles
    for (const dc of this._deviceCircles.values()) {
      dc.draw();
    }
    fill(255);
    noStroke();
    text(`Devices: ${this.deviceManager.getDeviceCount?.() ?? devs.length}`, 10, 20);
  }
}
