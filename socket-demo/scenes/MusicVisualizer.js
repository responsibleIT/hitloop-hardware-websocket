class MusicVisualizer extends Scene {
  constructor(deviceManager) {
    super(deviceManager);
    this.objects = [];
    this.isPlaying = false;
    this.bpm = 135;
    
    // Audio objects
    this.kickOsc = null;
    this.kickEnv = null;
    this.hatNoise = null;
    this.hatEnv = null;
    this.hatFilter = null;
    this.clapNoise = null;
    this.clapEnv = null;
    this.clapFilter = null;
    this.clapReverb = null;
    this.arpOsc = null;
    this.arpEnv = null;

    // Timing
    this.nextNoteTime = 0;
    this.beatCount = 0;

    // Spatial Volume State
    this.volKick = 0;
    this.volHat = 0;
    this.volClap = 0;
    this.volArp = 0;

    // UI Elements container
    this.uiContainer = null;
    this.styleElement = null;

    // Device state management (copied from Intro.js)
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
    this.objects = [];
    this.playLineX = width * 0.35;
    
    // Define rows
    this.updateLayout();

    // Initialize Audio
    this.initAudio();

    // Initialize UI
    this.initUI();

    // Device setup
    this._state.clear();
    this._colors.clear();
    this._lastLedHex.clear();
    
    // Reset volumes
    this.volKick = 0;
    this.volHat = 0;
    this.volClap = 0;
    this.volArp = 0;
  }

  teardown() {
    // Stop audio
    if (this.kickOsc) this.kickOsc.stop();
    if (this.hatNoise) this.hatNoise.stop();
    if (this.clapNoise) this.clapNoise.stop();
    if (this.arpOsc) this.arpOsc.stop();
    
    this.isPlaying = false;

    // Remove UI
    if (this.uiContainer) {
      this.uiContainer.remove();
      this.uiContainer = null;
    }
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }

  // --- DEVICE HELPER METHODS (from Intro.js) ---

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
    const state = this._state.get(id);
    if (!state) return [255, 255, 255]; 

    // Calculate distances to corners
    const distNW = dist(state.x, state.y, 0, 0);
    const distNE = dist(state.x, state.y, width, 0);
    const distSW = dist(state.x, state.y, 0, height);
    const distSE = dist(state.x, state.y, width, height);

    const minDist = Math.min(distNW, distNE, distSW, distSE);

    // Target color based on closest corner
    let target = [255, 255, 255];
    if (minDist === distNW) target = [255, 255, 0];   // Yellow
    else if (minDist === distSW) target = [0, 0, 255];     // Blue
    else if (minDist === distSE) target = [255, 50, 50];   // Red
    else if (minDist === distNE) target = [0, 255, 255];   // Cyan

    // Transition Logic
    if (!this._colors.has(id)) {
      this._colors.set(id, target);
      return target;
    }

    const current = this._colors.get(id);
    const amt = 0.05; // 5% mix per frame for smooth fade
    const r = lerp(current[0], target[0], amt);
    const g = lerp(current[1], target[1], amt);
    const b = lerp(current[2], target[2], amt);
    
    const nextColor = [r, g, b];
    this._colors.set(id, nextColor);
    
    return nextColor;
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

  updateLayout() {
    this.playLineX = width * 0.35;
    let spacing = height / 4;
    this.hatY = spacing * 1;
    this.clapY = spacing * 2;
    this.kickY = spacing * 3;
    
    this.kickSize = 220;
    this.clapSize = 180;
    this.hatSize = 140;
  }

  initAudio() {
    // 1. KICK
    this.kickEnv = new p5.Envelope();
    this.kickEnv.setADSR(0.001, 0.1, 0.0, 0.1); 
    this.kickOsc = new p5.Oscillator('sine');
    this.kickOsc.amp(this.kickEnv);

    // 2. HAT
    this.hatEnv = new p5.Envelope();
    this.hatEnv.setADSR(0.001, 0.05, 0.0, 0.05); 
    this.hatNoise = new p5.Noise('white');
    this.hatNoise.amp(this.hatEnv);
    
    this.hatFilter = new p5.HighPass();
    this.hatFilter.freq(6000); 
    this.hatNoise.disconnect();
    this.hatNoise.connect(this.hatFilter);

    // 3. CLAP
    this.clapEnv = new p5.Envelope();
    this.clapEnv.setADSR(0.001, 0.12, 0.0, 0.2); 
    
    this.clapNoise = new p5.Noise('pink');
    this.clapNoise.amp(this.clapEnv);
    
    this.clapFilter = new p5.BandPass();
    this.clapFilter.freq(1500); 
    this.clapFilter.res(1.5);
    
    this.clapReverb = new p5.Reverb();
    this.clapReverb.process(this.clapNoise, 1.0, 3); 
    this.clapReverb.drywet(0.4); 

    this.clapNoise.disconnect();
    this.clapNoise.connect(this.clapFilter);
    this.clapFilter.disconnect();
    this.clapFilter.connect(p5.soundOut); 
    this.clapReverb.process(this.clapFilter, 1.0, 3);

    // 4. ARP
    this.arpEnv = new p5.Envelope();
    this.arpEnv.setADSR(0.005, 0.1, 0.0, 0.1);
    this.arpOsc = new p5.Oscillator('sine'); 
    this.arpOsc.amp(this.arpEnv);
  }

  initUI() {
    // Inject CSS
    const css = `
    /* --- UI CONTAINER --- */
    #ui-layer {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      pointer-events: none; 
      z-index: 10;
      font-family: 'Segoe UI', sans-serif;
    }

    #controls {
      position: absolute;
      top: 70px;
      left: 50px;
      width: 300px;
      padding: 25px;
      background: rgba(0, 0, 0, 0.85); 
      border-radius: 8px;
      pointer-events: auto; 
      backdrop-filter: blur(10px);
      box-shadow: 0 0 20px rgba(255,255,255,0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    
    #toggle-btn {
      position: absolute;
      top: 20px;
      left: 50px;
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid #ffffff;
      color: #ffffff;
      font-family: 'Segoe UI', sans-serif;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      cursor: pointer;
      pointer-events: auto;
      z-index: 20;
      border-radius: 4px;
      backdrop-filter: blur(5px);
      transition: all 0.2s ease;
    }
    #toggle-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
    }
    
    .hidden-controls {
      opacity: 0;
      transform: translateY(-20px);
      pointer-events: none !important;
    }

    #ui-layer h2 {
      margin: 0 0 15px 0;
      font-size: 14px;
      letter-spacing: 2px;
      color: #ffffff; 
      text-transform: uppercase;
      border-bottom: 1px solid rgba(255, 255, 255, 0.3);
      padding-bottom: 5px;
    }

    #ui-layer label {
      display: block;
      margin-top: 15px;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #cccccc; 
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    #start-btn {
      width: 100%;
      padding: 15px 0;
      margin-bottom: 30px;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid #ffffff;
      color: #ffffff;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      cursor: pointer;
      text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;
    }
    #start-btn:hover {
      background: #ffffff;
      color: #000;
      box-shadow: 0 0 25px rgba(255, 255, 255, 0.4);
    }

    #clear-btn {
      width: 100%;
      padding: 10px 0;
      margin-top: 30px;
      background: transparent;
      border: 1px solid #666;
      color: #ffffff;
      font-size: 12px;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.2s;
    }
    #clear-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: #ffffff;
    }

    #ui-layer input[type=range] {
      -webkit-appearance: none;
      width: 100%;
      background: transparent;
    }
    #ui-layer input[type=range]:focus { outline: none; }

    #ui-layer input[type=range]::-webkit-slider-runnable-track {
      width: 100%;
      height: 6px;
      cursor: pointer;
      background: #333;
      border-radius: 3px;
      border: 1px solid #555;
    }

    #ui-layer input[type=range]::-webkit-slider-thumb {
      height: 18px;
      width: 18px;
      border-radius: 50%;
      background: #ffffff;
      cursor: pointer;
      -webkit-appearance: none;
      margin-top: -7px; 
      box-shadow: 0 0 5px rgba(255, 255, 255, 0.8); 
      border: 2px solid #ffffff;
    }

    #kickVolSlider::-webkit-slider-thumb { background: #0000ff !important; border-color: #0000ff !important; }
    #hatVolSlider::-webkit-slider-thumb { background: #ffff00 !important; border-color: #ffff00 !important; }
    #clapVolSlider::-webkit-slider-thumb { background: #ff3232 !important; border-color: #ff3232 !important; }
    #arpVolSlider::-webkit-slider-thumb { background: #00ffff !important; border-color: #00ffff !important; }
    `;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);

    // Inject HTML
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'ui-layer';
    this.uiContainer.innerHTML = `
      <button id="toggle-btn">Hide Controls</button>
      <div id="controls">
        <button id="start-btn">START ENGINE</button>

        <h2>Mixer</h2>
        
        <label>Kick Vol</label>
        <input type="range" id="kickVolSlider" min="0" max="100" value="90">

        <label>Hats Vol</label>
        <input type="range" id="hatVolSlider" min="0" max="100" value="40">

        <label>Clap Vol</label>
        <input type="range" id="clapVolSlider" min="0" max="100" value="70">

        <label>Chords Vol</label>
        <input type="range" id="arpVolSlider" min="0" max="100" value="50">

        <br><br>
        <h2>System</h2>

        <label>BPM (<span id="bpmLabel">135</span>)</label>
        <input type="range" id="bpmSlider" min="60" max="180" value="135">

        <button id="clear-btn">Clear Visuals</button>
      </div>
    `;
    document.body.appendChild(this.uiContainer);

    // Bind Events
    document.getElementById('start-btn').addEventListener('click', () => this.togglePlay());
    document.getElementById('toggle-btn').addEventListener('click', () => this.toggleControls());
    document.getElementById('clear-btn').addEventListener('click', () => this.clearVisuals());
    document.getElementById('bpmSlider').addEventListener('input', (e) => this.updateBPM(e.target.value));

    // Store references to sliders for audio loop access
    this.kickVolSlider = document.getElementById('kickVolSlider');
    this.hatVolSlider = document.getElementById('hatVolSlider');
    this.clapVolSlider = document.getElementById('clapVolSlider');
    this.arpVolSlider = document.getElementById('arpVolSlider');
    this.startBtn = document.getElementById('start-btn');
  }

  togglePlay() {
    if (!this.isPlaying) {
      userStartAudio();
      
      // Start sources
      if (this.kickOsc) this.kickOsc.start();
      if (this.hatNoise) this.hatNoise.start();
      if (this.clapNoise) this.clapNoise.start();
      if (this.arpOsc) this.arpOsc.start();

      this.isPlaying = true;
      this.startBtn.innerText = "STOP ENGINE";
      this.startBtn.style.color = "#000000";
      this.startBtn.style.background = "#ffffff";
      this.startBtn.style.borderColor = "#ffffff";
      this.startBtn.style.boxShadow = "0 0 20px rgba(255, 255, 255, 0.5)";
      this.nextNoteTime = millis(); 
    } else {
      // Stop sources
      if (this.kickOsc) this.kickOsc.stop();
      if (this.hatNoise) this.hatNoise.stop();
      if (this.clapNoise) this.clapNoise.stop();
      if (this.arpOsc) this.arpOsc.stop();

      this.isPlaying = false;
      this.startBtn.innerText = "START ENGINE";
      this.startBtn.style.color = "#ffffff";
      this.startBtn.style.background = "rgba(255, 255, 255, 0.1)";
      this.startBtn.style.borderColor = "#ffffff";
      this.startBtn.style.boxShadow = "0 0 15px rgba(255, 255, 255, 0.1)";
    }
  }

  toggleControls() {
    const controls = document.getElementById('controls');
    const btn = document.getElementById('toggle-btn');
    
    controls.classList.toggle('hidden-controls');
    
    if (controls.classList.contains('hidden-controls')) {
      btn.innerText = "Show Controls";
    } else {
      btn.innerText = "Hide Controls";
    }
  }

  updateBPM(val) {
    this.bpm = parseInt(val);
    document.getElementById('bpmLabel').innerText = this.bpm;
  }

  clearVisuals() {
    this.objects = [];
  }

  spawn(type) {
    // Dynamic speed calculation so visuals hit the line roughly on beat
    let speed = 6 + (this.bpm / 20); 

    if (type === 'kick') {
      this.objects.push(new LightShape('kick', this.kickY, this.kickSize, [0, 0, 255], speed, this));
    } else if (type === 'clap') {
      this.objects.push(new LightShape('clap', this.clapY, this.clapSize, [255, 50, 50], speed, this)); 
    } else if (type === 'hat') {
      this.objects.push(new LightShape('hat', this.hatY, this.hatSize, [255, 255, 0], speed, this));
    } else if (type === 'arp') {
      let rY = random(height * 0.2, height * 0.8); // Spread out
      this.objects.push(new LightShape('arp', rY, 4, [0, 255, 255], speed, this)); // Cyan, very thin
    }
  }

  draw() {
    background(5, 10, 16); 

    // Handle Resize Logic or Dynamic Values if needed
    // In WEBGL mode, (0,0) is top-left because of translate in sketch.js
    // this.playLineX should be updated if width changes, but we do it in setup for now.
    // If needed, check width !== prevWidth.

    // --- DYNAMIC PLAY LINE ---
    stroke(255);
    strokeWeight(2);
    noFill();
    beginShape();
    
    // Draw line vertex by vertex to allow distortion
    for (let y = 0; y <= height; y += 4) {
      let x = this.playLineX;

      if (this.isPlaying) {
        for (let obj of this.objects) {
          // Apply distortion if object is hitting the line
          if (obj.triggered && obj.life > 0) {
             let dy = y - obj.y;
             
             // Customize distortion per type
             // Melodies (arp) are thinner but can have wider spread
             let isMelody = (obj.type === 'arp');
             
             // Spread determines how "wide" the curve is
             let spread = isMelody ? obj.h * 2.0 : obj.h * 0.35; 
             
             // Amplitude determines how far it pushes
             let amp = isMelody ? 15 * obj.life : obj.h * 0.4 * obj.life; 
             
             // Gaussian function for smooth bump
             let distortion = amp * Math.exp(-(dy * dy) / (2 * spread * spread));
             
             // Subtract from X to push line to the left
             x -= distortion;
          }
        }
      }
      vertex(x, y);
    }
    endShape();

    // --- SPATIAL VOLUME LOGIC ---
    const devices = [...this.deviceManager.getAllDevices().values()];
    
    // Radius of influence (how far from corner to start hearing sound)
    const maxDist = Math.max(width, height) * 0.6;
    
    // Init min distances to infinity
    let dNW = Infinity; // Hats
    let dSW = Infinity; // Kicks
    let dSE = Infinity; // Claps
    let dNE = Infinity; // Melodies

    const present = new Set();
    const renderList = [];

    // First pass: update physics and calculate distances
    for (const dev of devices) {
      const data = dev.getSensorData?.() ?? {};
      const id = data.id ?? dev.id ?? dev;
      present.add(id);

      const state = this._getState(id);
      this._updateMotion(state, data);
      
      // Distance calculations
      dNW = Math.min(dNW, dist(state.x, state.y, 0, 0));             // NW (Top-Left)
      dNE = Math.min(dNE, dist(state.x, state.y, width, 0));         // NE (Top-Right)
      dSW = Math.min(dSW, dist(state.x, state.y, 0, height));        // SW (Bottom-Left)
      dSE = Math.min(dSE, dist(state.x, state.y, width, height));    // SE (Bottom-Right)

      const col = this._getColor(data, id);
      renderList.push({ state, col, id });
    }

    // Map distances to target volumes (0.0 to 1.0)
    // If no devices, distance is Infinity -> volume 0
    // constrain(value, low, high) ensures we don't go out of bounds
    // map(value, start1, stop1, start2, stop2, [withinBounds])
    
    let targetHat = (dNW === Infinity) ? 0 : map(dNW, maxDist, 100, 0, 1, true);
    let targetArp = (dNE === Infinity) ? 0 : map(dNE, maxDist, 100, 0, 1, true);
    let targetKick = (dSW === Infinity) ? 0 : map(dSW, maxDist, 100, 0, 1, true);
    let targetClap = (dSE === Infinity) ? 0 : map(dSE, maxDist, 100, 0, 1, true);

    // Smooth volume transitions
    const lerpAmt = 0.1;
    this.volHat = lerp(this.volHat, targetHat, lerpAmt);
    this.volArp = lerp(this.volArp, targetArp, lerpAmt);
    this.volKick = lerp(this.volKick, targetKick, lerpAmt);
    this.volClap = lerp(this.volClap, targetClap, lerpAmt);

    // Update UI sliders to reflect spatial volume
    if (this.hatVolSlider) this.hatVolSlider.value = this.volHat * 100;
    if (this.kickVolSlider) this.kickVolSlider.value = this.volKick * 100;
    if (this.clapVolSlider) this.clapVolSlider.value = this.volClap * 100;
    if (this.arpVolSlider) this.arpVolSlider.value = this.volArp * 100;

    // --- RHYTHM LOGIC ---
    // Only run if playing (for generating new beats)
    if (this.isPlaying) {
      let msPerBeat = 60000 / this.bpm; 
      let msPer16th = msPerBeat / 4; 

      if (millis() > this.nextNoteTime) {
        let step = this.beatCount % 16; 

        // KICK: 4-on-the-floor (0, 4, 8, 12)
        if (step % 4 === 0) this.spawn('kick');
        
        // HAT: Offbeats (2, 6, 10, 14) are crucial for the bounce
        if (step % 4 === 2) this.spawn('hat');

        // CLAP: Classic backbeat (4, 12)
        if (step === 4 || step === 12) this.spawn('clap');

        // --- BOUNCY TECHNO PATTERNS ---

        // ARP: Fast 16th note runs, random but grid-locked
        if (random() > 0.6) this.spawn('arp');

        this.nextNoteTime += msPer16th;
        this.beatCount++;
      }
    }

    // --- RENDER AUDIO OBJECTS ---
    // Update object volumes from our spatial variables
    
    for (let i = this.objects.length - 1; i >= 0; i--) {
      let obj = this.objects[i];
      
      // Update volume references
      if(obj.type === 'kick') obj.currentVol = this.volKick;
      if(obj.type === 'hat') obj.currentVol = this.volHat;
      if(obj.type === 'clap') obj.currentVol = this.volClap;
      if(obj.type === 'arp') obj.currentVol = this.volArp;

      obj.update(this.playLineX);
      obj.display(this.playLineX);

      if (obj.isFinished()) {
        this.objects.splice(i, 1);
      }
    }

    // --- RENDER DEVICES (Overlay) ---
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
  }
}

class LightShape {
  constructor(type, y, h, colorRGB, speed, visualizer) {
    this.type = type; 
    this.y = y;
    this.h = h;
    // Melodies are much wider than tall
    this.w = (['arp'].includes(type)) ? 200 : this.h * 0.6; 
    this.rgb = colorRGB; 
    
    this.x = width + 50; 
    this.speed = speed; 
    this.triggered = false;
    this.currentVol = 0.5;
    this.life = 1.0; 
    
    this.visualizer = visualizer; // Reference to main class for audio access

    this.img = createGraphics(this.w + 20, this.h + 20);
    this.generateTexture();
  }

  generateTexture() {
    let pg = this.img;
    pg.noStroke();
    // pg.drawingContext is available in createGraphics
    let ctx = pg.drawingContext;
    let centerY = this.h / 2 + 10;
    
    if (['arp'].includes(this.type)) {
       // --- RECTANGLE BAR FOR MELODY ---
       let [r, g, b] = this.rgb;
       
       // Solid flat color, no gradient
       pg.fill(r, g, b);
       pg.rect(0, centerY - this.h/2, this.w, this.h); // Crisp rectangle

    } else {
       // --- D-SHAPE FOR DRUMS ---
       // D-Shape Clipping
       ctx.save();
       ctx.beginPath();
       ctx.moveTo(0, 10);
       ctx.arc(0, centerY, this.h/2, -Math.PI/2, Math.PI/2);
       ctx.closePath();
       ctx.clip(); 

       // Gradient
       let gradient = ctx.createRadialGradient(0, centerY, 0, 0, centerY, this.w);
       let [r, g, b] = this.rgb;
       gradient.addColorStop(0.0, `rgba(255, 255, 255, 1)`); 
       gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.5)`);
       gradient.addColorStop(1.0, `rgba(0, 0, 0, 0)`);
       
       ctx.fillStyle = gradient;
       ctx.fillRect(0, 0, this.w + 10, this.h + 20);
       ctx.restore(); 
    }

    // Static Noise (Applied to both)
    pg.loadPixels();
    for (let i = 0; i < pg.pixels.length; i += 4) {
       if (pg.pixels[i+3] > 10) {
         let noiseVal = random(-10, 10);
         pg.pixels[i] += noiseVal;
         pg.pixels[i+1] += noiseVal;
         pg.pixels[i+2] += noiseVal;
       }
    }
    pg.updatePixels();
  }

  update(playLineX) {
    this.x -= this.speed;

    // Trigger Point
    if (!this.triggered && this.x <= playLineX) {
      this.playSound();
      this.triggered = true;
    }

    if (this.triggered) {
       let fadeSpeed = (this.type === 'hat') ? 0.1 : 0.05;
       this.life -= fadeSpeed; 
    }
  }

  playSound() {
    const viz = this.visualizer;
    // Read volumes directly from slider elements if possible, or use currentVol passed/updated in loop
    // But here we need to trigger the envelope.
    
    // Use volumes from visualizer (which reads from sliders in draw loop)
    // Actually, in draw loop we update obj.currentVol.
    // However, playSound is called once when triggered.
    // We should read the sliders here or use the obj.currentVol set in draw loop (which runs before update usually? No, update runs then display).
    // Let's use obj.currentVol.

    let vol = this.currentVol;

    if (this.type === 'kick') {
        if (vol > 0.01) {
          viz.kickEnv.setRange(vol, 0);
          viz.kickOsc.freq(150);
          viz.kickOsc.freq(40, 0.15);
          viz.kickEnv.play();
        }
    } 
    else if (this.type === 'clap') {
        if (vol > 0.01) {
          viz.clapEnv.setRange(vol * 0.8, 0); // Slight gain reduction for reverb mix
          viz.clapEnv.play();
        }
    } 
    else if (['arp'].includes(this.type)) {
        // "David Guetta" / Pop EDM Scale (C Minor / Eb Major)
        
        let scale; 
        if (this.type === 'arp') {
           // Plucky Chords (Eb4, G4, Bb4, C5)
           scale = [311.13, 392.00, 466.16, 523.25];
           // Use dynamic volume instead of fixed 0.2
           // Arp needs to be a bit quieter usually, so we scale it
           viz.arpEnv.setRange(Math.min(vol * 0.6, 0.4), 0);
           let idx = floor(random(scale.length));
           viz.arpOsc.freq(scale[idx]);
           viz.arpEnv.play();
        }
    }
    else {
        if (vol > 0.01) {
          viz.hatEnv.setRange(vol, 0);
          viz.hatEnv.play();
        }
    }
  }

  display(playLineX) {
    let [r, g, b] = this.rgb;

    if (!this.triggered) {
      // --- MOVING OBJECT ---
      imageMode(CORNER);
      drawingContext.shadowBlur = 30;
      drawingContext.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
      image(this.img, this.x, this.y - (this.h / 2) - 10);
      drawingContext.shadowBlur = 0; 

    } else {
      // --- STRETCHED BEAM (SHAPE PRESERVED) ---
      if (this.life > 0) {
        let alpha = map(this.life, 0, 1, 0, 255);
        let [r, g, b] = this.rgb;
        
        // Add glow to the beam
        drawingContext.shadowBlur = 40;
        drawingContext.shadowColor = `rgba(${r}, ${g}, ${b}, ${this.life})`;

        tint(255, alpha); 

        push();
        // Anchor at playLineX
        translate(playLineX, this.y - (this.h / 2) - 10);
        
        // Flip horizontally so the flat side ("front") is at the play line
        scale(-1, 1);
        
        // Draw stretched image filling from playLineX back past 0
        // We stretch it extra (width * 1.5) so the fade-out happens off-screen
        image(this.img, 0, 0, playLineX * 1.5, this.img.height);
        pop();
        
        noTint();
        drawingContext.shadowBlur = 0;
      }
    }
  }

  isFinished() {
    return (this.triggered && this.life <= 0);
  }
}
