// socket-demo/ui/instructions.js
(function () {
  class InstructionsPage {
    constructor() {
      this.visible = false;
      this.msg = "";
      this.alpha = 0;
      this.lastChange = 0;
      this.autoHideMs = 0;
      this.dotSize = 4;
      this.targets = [];
      this.dots = [];
      this.play = false;
      this._pendingSoundKey = null;
      this._preSoundFired = false;
      this._dtEma = 16.7; // ms, EMA of frame time
      this.sndMap = {
        // w: "sounds/welcome-to-hitloop.mp3",
        // s: "sounds/shake-controller.mp3",
      };
      this._snds = {};
      this.keyMap = {
        w: "Welcome\nto Hitloop",
        k: "Kantel\n de controller",
        1: "↑ omhoog",
        2: "↓ omlaag",
        3: "← links",
        4: "→ rechts",
        s: "Schudden",
        z: "Sta bij je team",
        x: "Blauw bij blauw",
        c: "Rood bij rood",
        v: "Groen bij groen",
        d: "Ga door",
        f: "Bedankt voor uw deelname!",
        n: "Next group,\n Get ready!",
        // s: "Shake the controller",
        // 2: "Two teams"
      };
      this._onKeyDown = (e) => {
        const k = (e.key || "").toLowerCase();
        if (k === "escape") {
          this.hide();
          return;
        }
        const m = this.keyMap[k];
        if (m) {
          if (this.visible && this.msg === m) this.hide();
          else {
            this.show(m);
            this._pendingSoundKey = k; // defer sound until animation finishes
          }
        }
      };
      if (typeof window !== "undefined")
        window.addEventListener("keydown", this._onKeyDown);
    }
    setKeyMap(m) {
      this.keyMap = { ...this.keyMap, ...m };
    }
    setAutoHide(ms) {
      this.autoHideMs = ms;
    }
    setSoundMap(map) {
      this.sndMap = { ...this.sndMap, ...map };
    }
    show(t) {
      this.msg = t || "";
      this.visible = true;
      this.lastChange = this._now();
      this._prepareTextDots(this.msg);
      this._preSoundFired = false;
    }
    hide() {
      this.visible = false;
    }
    draw() {
      this.alpha += ((this.visible ? 255 : 0) - this.alpha) * 0.15;
      if (this.alpha < 1) return;
      push();
      if (this._isWEBGL()) translate(-width / 2, -height / 2);
      noStroke();
      this._drawDots();
      pop();
    }
    _prepareTextDots(message) {
      const margin = 40,
        maxW = Math.max(100, width - 2 * margin),
        maxH = Math.max(60, height - 2 * margin),
        { lines, fs } = this._fitMessageToBox(
          String(message || ""),
          Math.min(width, height) * 0.18,
          10,
          maxW,
          maxH
        );
      this.targets = [];
      this.dots = [];
      this.play = false;
      const pg = createGraphics(width, height);
      pg.pixelDensity(1);
      pg.background(255);
      pg.fill(0);
      pg.textAlign(CENTER, CENTER);
      try {
        pg.textStyle(BOLD);
      } catch (_) {}
      pg.textSize(fs);
      const lineH = fs * 0.9,
        totalH = lineH * lines.length;
      let y0 = height / 2 - totalH / 2 + lineH / 2;
      for (let i = 0; i < lines.length; i++)
        pg.text(lines[i], width / 2, y0 + i * lineH);
      pg.loadPixels();
      const m = 40,
        g = 5,
        stepX = g,
        stepY = g * 0.866025403784;
      for (let y = m, row = 0; y < height - m; y += stepY, row++) {
        const xo = (row & 1) * (stepX * 0.5);
        for (let x = m + xo; x < width - m; x += stepX) {
          const i = 4 * (int(y) * width + int(x));
          if ((pg.pixels[i] + pg.pixels[i + 1] + pg.pixels[i + 2]) / 3 < 200)
            this.targets.push({ x, y });
        }
      }
      pg.remove();
      if (this.targets.length) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const t of this.targets) {
          if (t.x < minX) minX = t.x;
          if (t.y < minY) minY = t.y;
          if (t.x > maxX) maxX = t.x;
          if (t.y > maxY) maxY = t.y;
        }
        const cx = (minX + maxX) / 2,
          cy = (minY + maxY) / 2,
          dx = width / 2 - cx,
          dy = height / 2 - cy;
        for (const t of this.targets) {
          t.x += dx;
          t.y += dy;
        }
      }
      this.dots = this.targets.map((t) => ({
        x: random(width),
        y: random(height),
        tx: t.x,
        ty: t.y,
      }));
      this.play = true;
    }
    _fitMessageToBox(message, startFS, minFS, maxW, maxH) {
      let fs = startFS;
      const blocks = String(message).split(/\n/);
      while (fs >= minFS) {
        const lines = [],
          lineH = fs * 0.9;
        let widest = 0,
          prev = textSize();
        textSize(fs);
        for (const b of blocks) {
          for (const ln of this._wrapBlock(b, fs, maxW)) {
            widest = Math.max(widest, textWidth(ln));
            lines.push(ln);
          }
        }
        textSize(prev);
        if (widest <= maxW && lines.length * lineH <= maxH)
          return { lines, fs };
        const lw = this._longestWord(message);
        prev = textSize();
        textSize(fs);
        const wordW = textWidth(lw || "");
        textSize(prev);
        fs =
          wordW > maxW
            ? Math.max(minFS, fs * Math.max(0.6, (maxW / wordW) * 0.98))
            : fs * 0.92;
      }
      return { lines: this._wrapBlock(message, minFS, maxW), fs: minFS };
    }
    _wrapBlock(txt, fs, maxW) {
      const wds = String(txt || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!wds.length) return [""];
      const out = [],
        prev = textSize();
      textSize(fs);
      let line = wds[0];
      for (let i = 1; i < wds.length; i++) {
        const t = line + " " + wds[i];
        if (textWidth(t) <= maxW) line = t;
        else {
          out.push(line);
          line = wds[i];
        }
      }
      out.push(line);
      textSize(prev);
      return out;
    }
    _longestWord(msg) {
      let L = "";
      for (const p of String(msg || "").split(/\s+/))
        if (p.length > L.length) L = p;
      return L;
    }
    _play(k) {
      const src = this.sndMap && this.sndMap[k];
      if (!src) return;
      let a = this._snds[k];
      if (!a) {
        a = new Audio(src);
        a.preload = "auto";
        a.crossOrigin = "anonymous";
        this._snds[k] = a;
      }
      try {
        a.currentTime = 0;
        a.play().catch(() => {});
      } catch (_) {}
    }
    _drawDots() {
      if (!this.dots || !this.dots.length) return;
      noStroke();
      fill(255, this.alpha);
      let moving = false, maxErr = 0;
      for (const p of this.dots) {
        p.x += (p.tx - p.x) / 18;
        p.y += (p.ty - p.y) / 18;
        const ex = p.tx - p.x, ey = p.ty - p.y;
        const err = Math.hypot(ex, ey);
        if (err > 0.15) moving = true;
        if (err > maxErr) maxErr = err;
        circle(p.x, p.y, this.dotSize);
      }
      // Predict remaining time to finish and fire ~1s before
      const finalThresh = 0.15;
      // update EMA of frame time (deltaTime in ms)
      const dt = (typeof deltaTime === 'number' && isFinite(deltaTime)) ? deltaTime : 16.7;
      this._dtEma = this._dtEma*0.9 + dt*0.1;
      if (this.play && !this._preSoundFired && this._pendingSoundKey && maxErr > finalThresh) {
        const r = 29/30; // per-frame decay factor
        const remFrames = Math.ceil(Math.log(finalThresh / maxErr) / Math.log(r));
        const remSec = Math.max(0, remFrames) * (this._dtEma / 1000);
        if (remSec <= 2.5) {
          this._play(this._pendingSoundKey);
          this._pendingSoundKey = null;
          this._preSoundFired = true;
        }
      }
      if (this.play && !moving) {
        this.play = false;
        // no-op for sound here; it already played at pre-finish if any
      }
    }
    _isWEBGL() {
      try {
        return !!(
          _renderer &&
          (_renderer.drawingContext instanceof WebGLRenderingContext ||
            _renderer.drawingContext instanceof WebGL2RenderingContext)
        );
      } catch (_) {
        return false;
      }
    }
    _now() {
      try {
        if (typeof millis === "function") return millis();
      } catch (_) {}
      return typeof performance !== "undefined"
        ? performance.now()
        : Date.now();
    }
  }
  window.Instructions = new InstructionsPage();
})();
