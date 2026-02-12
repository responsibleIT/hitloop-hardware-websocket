// Mapping event handlers and debounced updates for the Device MIDI Mapper app.
// Encapsulates how UI input changes mutate the mapping model and trigger persistence.

(function () {
  function createHandlers(options) {
    const state = options.state;
    const persistState = options.persistState;
    const deviceCards = options.deviceCards;
    const rebuildDeviceCardMappings = options.rebuildDeviceCardMappings;
    const soloSnapshots = options.soloSnapshots || Object.create(null);
    const pendingFieldTimers = Object.create(null);

    function scheduleDelayedFieldUpdate(deviceId, sensorKey, field, rawValue) {
      if (!pendingFieldTimers[deviceId]) {
        pendingFieldTimers[deviceId] = Object.create(null);
      }
      const key = `${sensorKey}:${field}`;
      const existing = pendingFieldTimers[deviceId][key];
      if (existing && existing.timerId) {
        clearTimeout(existing.timerId);
      }

      const value = Number(rawValue);
      const timerId = window.setTimeout(() => {
        const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
          state.mappingsByDevice,
          deviceId
        );
        const mapping = deviceMappings[sensorKey];
        if (!mapping) return;

        if (field === "channel") {
          const num = Number.isFinite(value) ? value : 1;
          mapping[field] = Math.min(16, Math.max(1, num));
        } else {
          const num = Number.isFinite(value) ? value : 0;
          mapping[field] = Math.min(127, Math.max(0, num));
        }

        persistState();
        pendingFieldTimers[deviceId][key] = null;
      }, 1000);

      pendingFieldTimers[deviceId][key] = { timerId, value };
    }

    function handleMappingChange(event) {
      const target = event.target;
      const deviceId = target.dataset.deviceId;
      const sensorKey = target.dataset.sensorKey;
      const field = target.dataset.field;
      if (!deviceId || !sensorKey || !field) return;

      if (target.type === "checkbox" && field === "solo") {
        const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
          state.mappingsByDevice,
          deviceId
        );
        const current = deviceMappings[sensorKey];
        if (!current) return;

        if (target.checked) {
          // Solo ON: snapshot current enabled state then activate only this mapping.
          const snapshot = Object.create(null);
          Object.keys(deviceMappings).forEach((key) => {
            const m = deviceMappings[key];
            if (!m) return;
            snapshot[key] = !!m.enabled;
          });
          soloSnapshots[deviceId] = snapshot;

          Object.keys(deviceMappings).forEach((key) => {
            const m = deviceMappings[key];
            if (!m) return;
            if (key === sensorKey) {
              m.enabled = true;
              m.solo = true;
            } else {
              m.enabled = false;
              m.solo = false;
            }
          });
        } else {
          // Solo OFF: restore previous enabled states if we have a snapshot.
          const snapshot = soloSnapshots[deviceId];
          if (snapshot) {
            Object.keys(deviceMappings).forEach((key) => {
              const m = deviceMappings[key];
              if (!m) return;
              m.enabled = !!snapshot[key];
              m.solo = false;
            });
            soloSnapshots[deviceId] = null;
          } else {
            current.solo = false;
          }
        }

        persistState();
        const card = deviceCards[deviceId];
        if (card) {
          rebuildDeviceCardMappings(card, deviceId);
        }
        return;
      }

      if (target.type === "number" || target.type === "text") {
        const val = target.value;
        const num = Number(val);
        if (field === "channel" || field === "ccNumber" || field === "noteNumber") {
          scheduleDelayedFieldUpdate(deviceId, sensorKey, field, num);
        } else if (field === "durationMs") {
          const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
            state.mappingsByDevice,
            deviceId
          );
          const mapping = deviceMappings[sensorKey];
          if (!mapping) return;
          mapping[field] = Math.min(2000, Math.max(10, isNaN(num) ? 200 : num));
          persistState();
        } else {
          const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
            state.mappingsByDevice,
            deviceId
          );
          const mapping = deviceMappings[sensorKey];
          if (!mapping) return;
          const safe = isNaN(num) ? 0 : num;
          // For mapping endpoints we allow values outside 0..127;
          // they will be clamped later when sending actual MIDI.
          if (field === "outputMin" || field === "outputMax") {
            mapping[field] = safe;
          } else {
            // Generic clamp for other value-like fields such as velocity.
            mapping[field] = Math.min(127, Math.max(0, safe));
          }
          persistState();
        }
      }
    }

    function handleAddMappingClick(event) {
      const target = event.target;
      if (target.classList.contains("mapping-remove-btn")) {
        const deviceId = target.dataset.deviceId;
        const sensorKey = target.dataset.sensorKey;
        if (!deviceId || !sensorKey) return;

        const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
          state.mappingsByDevice,
          deviceId
        );
        const mapping = deviceMappings[sensorKey];
        if (!mapping) return;

        mapping.enabled = false;
        persistState();
        const card = deviceCards[deviceId];
        if (card) {
          rebuildDeviceCardMappings(card, deviceId);
        }
        return;
      }

      if (!target.classList.contains("mapping-add-btn")) return;

      const deviceId = target.dataset.deviceId;
      if (!deviceId) return;

      const container = target.parentElement;
      if (!container) return;

      const select = container.querySelector(".mapping-add-select");
      if (!select) return;

      const sensorKey = select.value;
      if (!sensorKey) return;

      const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
        state.mappingsByDevice,
        deviceId
      );
      const mapping = deviceMappings[sensorKey];
      if (!mapping) return;

      mapping.enabled = true;
      persistState();
      // Rebuild just this device's mappings so the new row appears
      const card = deviceCards[deviceId];
      if (card) {
        rebuildDeviceCardMappings(card, deviceId);
      }
    }

    return {
      handleMappingChange,
      handleAddMappingClick,
    };
  }

  window.DeviceMidiMappingEvents = {
    createHandlers,
  };
})();

