// Mapping engine: turns sensor values into MIDI events using a per-device mapping model.
// It is deliberately stateless from the outside, but keeps internal per-device runtime
// state (smoothing, tap edge detection).

(function () {
  const runtimeByDevice = new Map();

  const SENSOR_KEYS = ["ax", "ay", "az", "magnitude", "tap"];

  function getOrCreateRuntime(deviceId) {
    let rt = runtimeByDevice.get(deviceId);
    if (!rt) {
      rt = {
        previousTap: false,
        smoothValues: {}, // sensorKey -> last smoothed numeric value
      };
      runtimeByDevice.set(deviceId, rt);
    }
    return rt;
  }

  function ensureDeviceMappings(mappingsByDevice, deviceId) {
    if (!mappingsByDevice[deviceId]) {
      mappingsByDevice[deviceId] = {};
    }
    const deviceMappings = mappingsByDevice[deviceId];
    SENSOR_KEYS.forEach((key) => {
      if (!deviceMappings[key]) {
        deviceMappings[key] = createDefaultMappingForSensor(key);
      }
    });
    return deviceMappings;
  }

  function createDefaultMappingForSensor(sensorKey) {
    const base = {
      enabled: false,
      sensorKey,
      midiType: sensorKey === "tap" ? "note" : "cc",
      channel: 1,
      inputMin: sensorKey === "magnitude" ? 0 : 0,
      inputMax: sensorKey === "magnitude" ? 2 : 255,
      outputMin: 0,
      outputMax: 127,
      invert: false,
      smoothingAlpha: 0.0,
    };
    if (sensorKey === "tap") {
      base.noteNumber = 60; // Middle C
      base.velocity = 110;
      base.durationMs = 200;
    } else {
      // Give distinct defaults but they are just a starting point.
      if (sensorKey === "ax") base.ccNumber = 1;
      else if (sensorKey === "ay") base.ccNumber = 2;
      else if (sensorKey === "az") base.ccNumber = 3;
      else if (sensorKey === "magnitude") base.ccNumber = 4;
    }
    return base;
  }

  function applySmoothing(runtime, sensorKey, value, alpha) {
    if (!alpha || alpha <= 0 || alpha >= 1) {
      runtime.smoothValues[sensorKey] = value;
      return value;
    }
    const prev = runtime.smoothValues[sensorKey];
    if (typeof prev !== "number") {
      runtime.smoothValues[sensorKey] = value;
      return value;
    }
    const smoothed = prev + alpha * (value - prev);
    runtime.smoothValues[sensorKey] = smoothed;
    return smoothed;
  }

  function normalize(value, inputMin, inputMax, outputMin, outputMax, invert) {
    const v = Number(value) || 0;
    const inMin = Number(inputMin);
    const inMax = Number(inputMax);
    if (!isFinite(inMin) || !isFinite(inMax) || inMax === inMin) {
      return outputMin;
    }
    let t = (v - inMin) / (inMax - inMin);
    t = Math.max(0, Math.min(1, t));
    if (invert) {
      t = 1 - t;
    }
    const outMin = Number(outputMin) || 0;
    const outMax = Number(outputMax) || 127;
    return outMin + t * (outMax - outMin);
  }

  function computeMagnitude(ax, ay, az) {
    // Convert 0-255 to -2g..2g as in other apps
    const toG = (v) => (v / 255.0) * 4.0 - 2.0;
    const gx = toG(ax || 0);
    const gy = toG(ay || 0);
    const gz = toG(az || 0);
    const magnitude = Math.sqrt(gx * gx + gy * gy + gz * gz);
    // Remove gravity so 0 ~= still, >0 = movement
    const movement = Math.max(0, magnitude - 1.0);
    return movement;
  }

  function processDevice(deviceId, sensorData, mappingsByDevice, midi) {
    if (!sensorData) return;
    const deviceMappings = ensureDeviceMappings(mappingsByDevice, deviceId);
    const runtime = getOrCreateRuntime(deviceId);

    // Axes: 0-255 numeric
    ["ax", "ay", "az"].forEach((key) => {
      const mapping = deviceMappings[key];
      if (!mapping || !mapping.enabled || mapping.midiType !== "cc") return;
      const raw = sensorData[key] || 0;
      const smoothed = applySmoothing(runtime, key, raw, Number(mapping.smoothingAlpha) || 0);
      const value = normalize(
        smoothed,
        mapping.inputMin,
        mapping.inputMax,
        mapping.outputMin,
        mapping.outputMax,
        !!mapping.invert
      );
      midi.sendControlChange(mapping.ccNumber || 0, Math.round(value), mapping.channel || 1);
    });

    // Magnitude: derived movement in G's, default input range 0..2
    const magMapping = deviceMappings.magnitude;
    if (magMapping && magMapping.enabled && magMapping.midiType === "cc") {
      const movement = computeMagnitude(sensorData.ax, sensorData.ay, sensorData.az);
      const smoothed = applySmoothing(
        runtime,
        "magnitude",
        movement,
        Number(magMapping.smoothingAlpha) || 0
      );
      const value = normalize(
        smoothed,
        magMapping.inputMin,
        magMapping.inputMax,
        magMapping.outputMin,
        magMapping.outputMax,
        !!magMapping.invert
      );
      midi.sendControlChange(magMapping.ccNumber || 0, Math.round(value), magMapping.channel || 1);
    }

    // Tap: boolean -> Note On + timed Note Off on rising edge
    const tapMapping = deviceMappings.tap;
    if (tapMapping && tapMapping.enabled && tapMapping.midiType === "note") {
      const currentTap = !!sensorData.tap;
      const prevTap = runtime.previousTap || false;
      if (!prevTap && currentTap) {
        const noteNumber = tapMapping.noteNumber || 60;
        const velocity = tapMapping.velocity || 110;
        const channel = tapMapping.channel || 1;
        const durationMs = tapMapping.durationMs || 200;
        midi.sendNoteOn(noteNumber, velocity, channel);
        window.setTimeout(() => {
          midi.sendNoteOff(noteNumber, channel);
        }, durationMs);
      }
      runtime.previousTap = currentTap;
    }
  }

  function processAllDevices(deviceManager, mappingsByDevice, midi) {
    if (!deviceManager || !deviceManager.getAllDevices) return;
    const map = deviceManager.getAllDevices();
    if (!map || typeof map.forEach !== "function") return;
    map.forEach((device, id) => {
      if (!device || typeof device.getSensorData !== "function") return;
      const data = device.getSensorData();
      processDevice(id, data, mappingsByDevice, midi);
    });
  }

  window.DeviceMidiMappingEngine = {
    SENSOR_KEYS: SENSOR_KEYS.slice(),
    ensureDeviceMappings,
    createDefaultMappingForSensor,
    processDevice,
    processAllDevices,
  };
})();

