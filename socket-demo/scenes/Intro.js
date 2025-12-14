class Intro extends Scene {
  constructor(...a) {
    super(...a);
    this.deviceRadius = 40;
    this._state = new Map(); // id -> {x, y, vx, vy}
    this._colors = new Map();
    this._lastLedHex = new Map();
    this.palette = [
      [255, 0, 0],   // solid red fallback
      [0, 0, 255],   // solid blue fallback
      [0, 255, 0],   // solid green fallback
    ];
  }

  setup() {
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
  }

  _getState(id) {
    let s = this._state.get(id);
    if (!s) {
      s = {
        x: random(this.deviceRadius * 1.5, width - this.deviceRadius * 1.5),
        y: random(this.deviceRadius * 1.5, height - this.deviceRadius * 1.5),
        vx: 0,
        vy: 0,
      };
      this._state.set(id, s);
    }
    return s;
  }

  _getColor(data, id) {
    const c = data?.color;
    const isUsable =
      Array.isArray(c) &&
      c.length === 3 &&
      c.every((v) => Number.isFinite(v)) &&
      // avoid nearly-white defaults
      !(c[0] > 220 && c[1] > 220 && c[2] > 220);
    if (isUsable) return c;
    if (!this._colors.has(id)) {
      const idx = Math.abs(this._hashId(id)) % this.palette.length;
      this._colors.set(id, this.palette[idx]);
    }
    return this._colors.get(id);
  }

  _rgbToHex([r, g, b]) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
    return [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  }

  _hashId(id) {
    const s = String(id ?? '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  _clampState(state) {
    const r = this.deviceRadius;
    state.x = constrain(state.x, r, width - r);
    state.y = constrain(state.y, r, height - r);
  }

  _separateOverlaps(states) {
    const r = this.deviceRadius;
    const minDist = r * 2;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
          const a = states[i];
          const b = states[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist === 0) dist = 0.001;
          if (dist < minDist) {
            const overlap = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            this._clampState(a);
            this._clampState(b);
          }
        }
      }
    }
  }

  _updateMotion(state, data) {
    // Move based on four beacons: d1=dNW, d2=dNE, d3=dSE, d4=dSW
    const d1 = Number(data?.dNW ?? data?.d1 ?? 0);
    const d2 = Number(data?.dNE ?? data?.d2 ?? 0);
    const d3 = Number(data?.dSE ?? data?.d3 ?? 0);
    const d4 = Number(data?.dSW ?? data?.d4 ?? 0);

    // Horizontal: right beacons minus left beacons
    const dxRaw = (d2 + d3) - (d1 + d4);
    // Vertical: bottom beacons minus top beacons
    const dyRaw = (d4 + d3) - (d1 + d2);

    const ax = constrain(dxRaw / 255, -1, 1) * 1.0;
    const ay = constrain(dyRaw / 255, -1, 1) * 1.0;

    state.vx = (state.vx + ax) * 0.90;
    state.vy = (state.vy + ay) * 0.90;

    state.x += state.vx;
    state.y += state.vy;
    this._clampState(state);
  }

  _drawFace(state, faceColor) {
    const r = this.deviceRadius;
    stroke(0);
    strokeWeight(2);
    fill(faceColor[0], faceColor[1], faceColor[2]);
    circle(state.x, state.y, r * 2);

    // Eyes
    const eyeOffsetX = r * 0.35;
    const eyeOffsetY = r * 0.22;
    const eyeSize = r * 0.16;
    fill(0);
    noStroke();
    circle(state.x - eyeOffsetX, state.y - eyeOffsetY, eyeSize);
    circle(state.x + eyeOffsetX, state.y - eyeOffsetY, eyeSize);

    // Mouth
    stroke(0);
    strokeWeight(3);
    line(state.x - r * 0.45, state.y + r * 0.28, state.x + r * 0.45, state.y + r * 0.28);
  }

  _drawPlant(x, y, col) {
    // Simple stylized plant: stem + two leaves + bud
    const [r, g, b] = col;
    const stemH = 32;
    stroke(r, g, b);
    strokeWeight(4);
    line(x, y, x, y - stemH);

    // leaves
    strokeWeight(3);
    line(x, y - stemH * 0.5, x - 12, y - stemH * 0.65);
    line(x, y - stemH * 0.5, x + 12, y - stemH * 0.75);

    // bud
    noStroke();
    fill(r, g, b, 220);
    circle(x, y - stemH, 10);
  }


  draw() {
    background(230);
    const devices = [...this.deviceManager.getAllDevices().values()];
    const present = new Set();

    const renderList = [];

    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data);
      const col = this._getColor(data, id);
      renderList.push({ state, col, id });
    }

    this._separateOverlaps(renderList.map((r) => r.state));

    for (const { state, col, id } of renderList) {
      this._drawFace(state, col);

      // Keep device LED in sync with drawn color (best-effort)
      const hex = this._rgbToHex(col);
      const last = this._lastLedHex.get(id);
      if (hex !== last) {
        try {
          this.deviceManager.sendCommandToDevice?.(id, 'led', hex);
          this._lastLedHex.set(id, hex);
        } catch (_) {}
      }
    }

    // Clean up state for devices that disappeared
    for (const key of [...this._state.keys()]) {
      if (!present.has(key)) this._state.delete(key);
    }
    for (const key of [...this._colors.keys()]) {
      if (!present.has(key)) this._colors.delete(key);
    }

    fill(40);
    noStroke();
    text(`devices: ${devices.length}`, 12, 20);
  }
}
