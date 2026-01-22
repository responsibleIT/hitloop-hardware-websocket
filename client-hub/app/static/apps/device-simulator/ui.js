/* globals createDiv, createSpan, createSlider, createButton */

function setupUI(cfg, handlers) {
	const panel = document.querySelector('.panel');

	// Replace HTML controls with p5-created elements, mounted into panel
	panel.innerHTML = '<h1>Simulator</h1>';

	const devWrap = createDiv('').parent(panel).addClass('control');
	createSpan('Devices: ').parent(devWrap);
	const devValue = createSpan(String(cfg.sim.defaultDevices)).parent(devWrap);
	const devSlider = createSlider(cfg.sim.minDevices, cfg.sim.maxDevices, cfg.sim.defaultDevices, 1).parent(devWrap);
	devSlider.input(() => {
		handlers.onDeviceCountChange(devSlider.value());
		devValue.html(String(devSlider.value()));
	});

	const rateWrap = createDiv('').parent(panel).addClass('control');
	createSpan('Send rate (Hz): ').parent(rateWrap);
	const rateValue = createSpan(String(cfg.sim.defaultHz)).parent(rateWrap);
	const rateSlider = createSlider(cfg.sim.minHz, cfg.sim.maxHz, cfg.sim.defaultHz, 1).parent(rateWrap);
	rateSlider.input(() => {
		handlers.onRateChange(rateSlider.value());
		rateValue.html(String(rateSlider.value()));
	});

    const row = createDiv('').parent(panel).addClass('control row');
    // WebSocket URL + Start/Stop toggle
    createSpan('WS URL: ').parent(row);
    const urlInput = createInput(cfg.websocketUrl).parent(row);
    const toggleBtn = createButton('Start').parent(row);
    let running = false;
    toggleBtn.mousePressed(() => {
        if (!running) {
            const val = urlInput.value();
            if (val && typeof val === 'string') handlers.onWsUrlChange(val.trim());
            handlers.onStart();
            urlInput.attribute('disabled', '');
            toggleBtn.html('Stop');
            running = true;
        } else {
            handlers.onStop();
            urlInput.removeAttribute('disabled');
            toggleBtn.html('Start');
            running = false;
        }
    });

	const status = createDiv('').parent(panel).addClass('status');
	status.html(`WS endpoint: <code>${cfg.websocketUrl}</code> · Active sockets: <span id="socketCount">0</span>`);

    // Angular velocity sliders
    const angHeader = createDiv('<strong>Angular velocity max (rad/s)</strong>').parent(panel).addClass('control');
    // Rotation mode selector
    const modeWrap = createDiv('').parent(panel).addClass('control');
    createSpan('rotation: ').parent(modeWrap);
    const modeSelect = createSelect().parent(modeWrap);
    modeSelect.option('off', 'off');
    modeSelect.option('constant', 'constant');
    modeSelect.option('random', 'random');
    modeSelect.selected(cfg.sim.rotationMode);
    modeSelect.changed(() => { handlers.onRotationModeChange(modeSelect.value()); });
    const rollWrap = createDiv('').parent(panel).addClass('control');
    createSpan('rotZ: ').parent(rollWrap);
    const rollVal = createSpan(String(cfg.sim.angularMax.rotZ.toFixed(2))).parent(rollWrap);
    const rollSlider = createSlider(0, 3, cfg.sim.angularMax.rotZ, 0.01).parent(rollWrap);
    rollSlider.input(() => { handlers.onAngularMaxChange('rotZ', rollSlider.value()); rollVal.html(rollSlider.value().toFixed(2)); });

    const pitchWrap = createDiv('').parent(panel).addClass('control');
    createSpan('rotX: ').parent(pitchWrap);
    const pitchVal = createSpan(String(cfg.sim.angularMax.rotX.toFixed(2))).parent(pitchWrap);
    const pitchSlider = createSlider(0, 3, cfg.sim.angularMax.rotX, 0.01).parent(pitchWrap);
    pitchSlider.input(() => { handlers.onAngularMaxChange('rotX', pitchSlider.value()); pitchVal.html(pitchSlider.value().toFixed(2)); });

    const yawWrap = createDiv('').parent(panel).addClass('control');
    createSpan('rotY: ').parent(yawWrap);
    const yawVal = createSpan(String(cfg.sim.angularMax.rotY.toFixed(2))).parent(yawWrap);
    const yawSlider = createSlider(0, 3, cfg.sim.angularMax.rotY, 0.01).parent(yawWrap);
    yawSlider.input(() => { handlers.onAngularMaxChange('rotY', yawSlider.value()); yawVal.html(yawSlider.value().toFixed(2)); });

    // Flocking controls
    const flockHeader = createDiv('<strong>Flocking</strong>').parent(panel).addClass('control');

    const maxSpeedWrap = createDiv('').parent(panel).addClass('control');
    createSpan('max speed: ').parent(maxSpeedWrap);
    const maxSpeedVal = createSpan(String(cfg.world.maxSpeed.toFixed(0))).parent(maxSpeedWrap);
    const maxSpeedSlider = createSlider(10, 300, cfg.world.maxSpeed, 1).parent(maxSpeedWrap);
    maxSpeedSlider.input(() => { handlers.onFlockingChange('maxSpeed', maxSpeedSlider.value()); maxSpeedVal.html(String(maxSpeedSlider.value())); });

    const alignWrap = createDiv('').parent(panel).addClass('control');
    createSpan('alignment: ').parent(alignWrap);
    const alignVal = createSpan(String(cfg.flocking.alignmentWeight.toFixed(2))).parent(alignWrap);
    const alignSlider = createSlider(0, 3, cfg.flocking.alignmentWeight, 0.01).parent(alignWrap);
    alignSlider.input(() => { handlers.onFlockingChange('alignmentWeight', alignSlider.value()); alignVal.html(alignSlider.value().toFixed(2)); });

    const cohWrap = createDiv('').parent(panel).addClass('control');
    createSpan('cohesion: ').parent(cohWrap);
    const cohVal = createSpan(String(cfg.flocking.cohesionWeight.toFixed(2))).parent(cohWrap);
    const cohSlider = createSlider(0, 3, cfg.flocking.cohesionWeight, 0.01).parent(cohWrap);
    cohSlider.input(() => { handlers.onFlockingChange('cohesionWeight', cohSlider.value()); cohVal.html(cohSlider.value().toFixed(2)); });

    const sepWrap = createDiv('').parent(panel).addClass('control');
    createSpan('separation: ').parent(sepWrap);
    const sepVal = createSpan(String(cfg.flocking.separationWeight.toFixed(2))).parent(sepWrap);
    const sepSlider = createSlider(0, 3, cfg.flocking.separationWeight, 0.01).parent(sepWrap);
    sepSlider.input(() => { handlers.onFlockingChange('separationWeight', sepSlider.value()); sepVal.html(sepSlider.value().toFixed(2)); });

    const radA = createDiv('').parent(panel).addClass('control');
    createSpan('align. rad.: ').parent(radA);
    const radAVal = createSpan(String(cfg.flocking.alignmentRadius.toFixed(0))).parent(radA);
    const radASlider = createSlider(10, 400, cfg.flocking.alignmentRadius, 1).parent(radA);
    radASlider.input(() => { handlers.onFlockingChange('alignmentRadius', radASlider.value()); radAVal.html(String(radASlider.value())); });

    const radC = createDiv('').parent(panel).addClass('control');
    createSpan('coh. rad.: ').parent(radC);
    const radCVal = createSpan(String(cfg.flocking.cohesionRadius.toFixed(0))).parent(radC);
    const radCSlider = createSlider(10, 400, cfg.flocking.cohesionRadius, 1).parent(radC);
    radCSlider.input(() => { handlers.onFlockingChange('cohesionRadius', radCSlider.value()); radCVal.html(String(radCSlider.value())); });

    const radS = createDiv('').parent(panel).addClass('control');
    createSpan('sep. rad.: ').parent(radS);
    const radSVal = createSpan(String(cfg.flocking.separationRadius.toFixed(0))).parent(radS);
    const radSSlider = createSlider(10, 400, cfg.flocking.separationRadius, 1).parent(radS);
    radSSlider.input(() => { handlers.onFlockingChange('separationRadius', radSSlider.value()); radSVal.html(String(radSSlider.value())); });

    const distS = createDiv('').parent(panel).addClass('control');
    createSpan('sep. dis.: ').parent(distS);
    const distSVal = createSpan(String(cfg.flocking.separationDistance.toFixed(0))).parent(distS);
    const distSSlider = createSlider(5, 200, cfg.flocking.separationDistance, 1).parent(distS);
    distSSlider.input(() => { handlers.onFlockingChange('separationDistance', distSSlider.value()); distSVal.html(String(distSSlider.value())); });
}

window.setupUI = setupUI;

