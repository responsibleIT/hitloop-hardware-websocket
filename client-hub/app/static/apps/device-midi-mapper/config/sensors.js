// Sensor configuration for the Device MIDI Mapper app.
// Centralizes sensor keys, labels, and default mapping creation so that
// both the mapping engine and UI can share a single source of truth.

(function () {
  const SENSOR_KEYS = ["ax", "ay", "az", "magnitude", "tap"];

  const SENSOR_LABELS = {
    ax: "Accel X",
    ay: "Accel Y",
    az: "Accel Z",
    magnitude: "Movement magnitude",
    tap: "Tap",
  };

  function getSensorDefinitions() {
    return SENSOR_KEYS.map((key) => ({
      key,
      label: SENSOR_LABELS[key] || key,
    }));
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

  window.DeviceMidiSensors = {
    SENSOR_KEYS: SENSOR_KEYS.slice(),
    SENSOR_LABELS: Object.assign({}, SENSOR_LABELS),
    getSensorDefinitions,
    createDefaultMappingForSensor,
  };
})();

