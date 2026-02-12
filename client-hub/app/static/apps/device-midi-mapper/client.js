// Main client for the Device MIDI Mapper app.
// - Connects to WS via HitloopDeviceManager
// - Renders device + mapping UI
// - Drives the mapping engine + MIDI layer

(function () {
  const devicesContainer = document.getElementById("devicesContainer");
  const deviceTemplate = document.getElementById("deviceTemplate");
  const deviceCountEl = document.getElementById("deviceCount");
  const wsLastUpdateEl = document.getElementById("wsLastUpdate");
  const wsStatusEl = document.getElementById("wsStatus");
  const wsUrlInput = document.getElementById("wsUrl");
  const connectBtn = document.getElementById("connectBtn");
  const midiOutputSelect = document.getElementById("midiOutputSelect");
  const refreshMidiBtn = document.getElementById("refreshMidiBtn");
  const togglePresetsBtn = document.getElementById("togglePresetsBtn");
  const presetsPanel = document.getElementById("presetsPanel");
  const savePresetBtn = document.getElementById("savePresetBtn");
  const loadPresetBtn = document.getElementById("loadPresetBtn");
  const exportPresetBtn = document.getElementById("exportPresetBtn");
  const importPresetInput = document.getElementById("importPresetInput");

  const state = {
    deviceManager: null,
    lastUpdateTs: null,
    mappingsByDevice: {},
    selectedOutputId: null,
  };

  // Keep a stable mapping from deviceId -> DOM node so we only update
  // the affected elements instead of re-rendering the whole container.
  const deviceCards = Object.create(null);
  let emptyStateEl = null;
  const pendingFieldTimers = Object.create(null);
  const soloSnapshots = Object.create(null);

  function init() {
    // Restore from local storage
    const stored = window.DeviceMidiStorage && window.DeviceMidiStorage.loadState();
    if (stored) {
      state.mappingsByDevice = stored.mappingsByDevice || {};
      state.selectedOutputId = stored.selectedOutputId || null;
    }

    // Initialize MIDI
    if (window.DeviceMidi) {
      DeviceMidi.enableIfNeeded().then(() => {
        if (state.selectedOutputId) {
          DeviceMidi.setSelectedOutputId(state.selectedOutputId);
        }
        refreshMidiOutputsUI();
      });
    }

    attachEventHandlers();
    startRenderLoop();
    startMappingLoop();
  }

  function attachEventHandlers() {
    connectBtn.addEventListener("click", () => {
      const rawUrl = wsUrlInput && wsUrlInput.value ? wsUrlInput.value.trim() : "";
      const url = rawUrl || "ws://localhost:5003/";
      if (!url) return;

      if (!state.deviceManager || state.deviceManager.websocketUrl !== url) {
        if (state.deviceManager) {
          try {
            state.deviceManager.disconnect();
          } catch (_e) {
            // ignore
          }
        }
        state.deviceManager = new HitloopDeviceManager(url);
      }

      updateWsStatus("connecting");
      try {
        state.deviceManager.connect();
      } catch (e) {
        console.error("Failed to connect WebSocket:", e);
        updateWsStatus("disconnected");
      }
    });

    refreshMidiBtn.addEventListener("click", () => {
      if (window.DeviceMidi) {
        DeviceMidi.enableIfNeeded().then(refreshMidiOutputsUI);
      }
    });

    midiOutputSelect.addEventListener("change", () => {
      const id = midiOutputSelect.value || null;
      if (window.DeviceMidi) {
        DeviceMidi.setSelectedOutputId(id);
      }
      state.selectedOutputId = id;
      persistState();
    });

    savePresetBtn.addEventListener("click", () => {
      persistState();
    });

    loadPresetBtn.addEventListener("click", () => {
      const stored = window.DeviceMidiStorage && window.DeviceMidiStorage.loadState();
      if (!stored) return;
      state.mappingsByDevice = stored.mappingsByDevice || {};
      state.selectedOutputId = stored.selectedOutputId || null;
      if (window.DeviceMidi && state.selectedOutputId) {
        DeviceMidi.setSelectedOutputId(state.selectedOutputId);
      }
      refreshMidiOutputsUI();
      renderDevices();
    });

    exportPresetBtn.addEventListener("click", () => {
      if (!window.DeviceMidiStorage) return;
      const json = DeviceMidiStorage.exportToJson(state);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      DeviceMidiStorage.triggerDownload(`device-midi-mapper-${ts}.json`, json);
    });

    importPresetInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file || !window.FileReader || !window.DeviceMidiStorage) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const text = e.target.result;
          const imported = DeviceMidiStorage.importFromJson(text);
          state.mappingsByDevice = imported.mappingsByDevice || {};
          state.selectedOutputId = imported.selectedOutputId || null;
          if (window.DeviceMidi && state.selectedOutputId) {
            DeviceMidi.setSelectedOutputId(state.selectedOutputId);
          }
          persistState();
          refreshMidiOutputsUI();
          renderDevices();
        } catch (err) {
          console.error("Failed to import preset:", err);
          alert("Failed to import preset JSON.");
        }
      };
      reader.readAsText(file);
      // Reset so the same file can be selected again if needed
      importPresetInput.value = "";
    });

    if (togglePresetsBtn && presetsPanel) {
      togglePresetsBtn.addEventListener("click", () => {
        presetsPanel.classList.toggle("panel--hidden");
      });
    }
  }

  function updateWsStatus(status) {
    if (!wsStatusEl) return;
    if (status === "connected") {
      wsStatusEl.textContent = "connected";
      wsStatusEl.classList.remove("status-pill--disconnected");
      wsStatusEl.classList.add("status-pill--connected");
    } else if (status === "connecting") {
      wsStatusEl.textContent = "connecting";
      wsStatusEl.classList.remove("status-pill--connected");
      wsStatusEl.classList.add("status-pill--disconnected");
    } else {
      wsStatusEl.textContent = "disconnected";
      wsStatusEl.classList.remove("status-pill--connected");
      wsStatusEl.classList.add("status-pill--disconnected");
    }
  }

  function refreshMidiOutputsUI() {
    if (!window.DeviceMidi || !midiOutputSelect) return;
    const outputs = DeviceMidi.listOutputs();
    const selectedId = DeviceMidi.getSelectedOutputId();
    midiOutputSelect.innerHTML = "";
    if (!outputs.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No outputs available";
      midiOutputSelect.appendChild(opt);
      return;
    }

    outputs.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.name;
      if (selectedId && o.id === selectedId) {
        opt.selected = true;
      }
      midiOutputSelect.appendChild(opt);
    });

    if (!selectedId && outputs.length > 0) {
      const first = outputs[0];
      DeviceMidi.setSelectedOutputId(first.id);
      state.selectedOutputId = first.id;
      midiOutputSelect.value = first.id;
      persistState();
    }
  }

  function persistState() {
    if (!window.DeviceMidiStorage) return;
    DeviceMidiStorage.saveState({
      selectedOutputId: state.selectedOutputId,
      mappingsByDevice: state.mappingsByDevice,
    });
  }

  function startRenderLoop() {
    function loop() {
      renderDevices();
      updateMeta();
      window.setTimeout(loop, 500);
    }
    loop();
  }

  function startMappingLoop() {
    function loop() {
      if (window.DeviceMidiMappingEngine && state.deviceManager && window.DeviceMidi) {
        DeviceMidiMappingEngine.processAllDevices(
          state.deviceManager,
          state.mappingsByDevice,
          DeviceMidi
        );
      }
      window.requestAnimationFrame(loop);
    }
    loop();
  }

  function updateMeta() {
    if (!state.deviceManager) {
      if (deviceCountEl) {
        deviceCountEl.textContent = "0 devices";
      }
      updateWsStatus("disconnected");
      if (wsLastUpdateEl) {
        wsLastUpdateEl.textContent = "no data yet";
      }
      return;
    }

    const devicesMap = state.deviceManager.getAllDevices();
    const count = devicesMap ? devicesMap.size : 0;
    if (deviceCountEl) {
      deviceCountEl.textContent = `${count} device${count === 1 ? "" : "s"}`;
    }

    // Derive connection state from underlying WebSocket, like device-dashboard
    const ws = state.deviceManager.ws;
    const ready = ws && ws.readyState === WebSocket.OPEN;
    updateWsStatus(ready ? "connected" : "disconnected");

    if (wsLastUpdateEl) {
      if (!state.lastUpdateTs) {
        wsLastUpdateEl.textContent = "no data yet";
      } else {
        const secondsAgo = Math.round((Date.now() - state.lastUpdateTs) / 1000);
        wsLastUpdateEl.textContent = `last frame: ${secondsAgo}s ago`;
      }
    }
  }

  function renderDevices() {
    if (!devicesContainer) return;

    const manager = state.deviceManager;
    const devicesMap = manager && manager.getAllDevices ? manager.getAllDevices() : null;

    if (!manager || !devicesMap || !devicesMap.size) {
      // No active devices: clear individual cards but keep the container itself intact.
      state.lastUpdateTs = null;

      Object.keys(deviceCards).forEach((id) => {
        const card = deviceCards[id];
        if (card && card.parentNode === devicesContainer) {
          devicesContainer.removeChild(card);
        }
        delete deviceCards[id];
      });

      if (!emptyStateEl) {
        emptyStateEl = document.createElement("div");
        emptyStateEl.className = "empty-state";
        emptyStateEl.textContent =
          "No active devices. Connect and move a device to see it here.";
      }
      if (!emptyStateEl.parentNode) {
        devicesContainer.appendChild(emptyStateEl);
      }
      return;
    }

    // We have at least one device frame.
    state.lastUpdateTs = Date.now();

    if (emptyStateEl && emptyStateEl.parentNode === devicesContainer) {
      devicesContainer.removeChild(emptyStateEl);
    }

    const seenIds = new Set();
    devicesMap.forEach((device, id) => {
      const deviceId = String(id);
      seenIds.add(deviceId);
      const data = device.getSensorData();

      let card = deviceCards[deviceId];
      if (!card) {
        card = renderDeviceCard(deviceId, data);
        deviceCards[deviceId] = card;
        devicesContainer.appendChild(card);
      } else {
        updateDeviceCardLive(card, deviceId, data);
      }
    });

    // Remove cards for devices that disappeared.
    Object.keys(deviceCards).forEach((id) => {
      if (!seenIds.has(id)) {
        const card = deviceCards[id];
        if (card && card.parentNode === devicesContainer) {
          devicesContainer.removeChild(card);
        }
        delete deviceCards[id];
      }
    });
  }

  function renderDeviceCard(deviceId, sensorData) {
    const tpl = deviceTemplate;
    const node = tpl.content.firstElementChild.cloneNode(true);
    // Single delegated listeners per card; rows can be rebuilt safely.
    node.addEventListener("change", handleMappingChange);
    node.addEventListener("click", handleAddMappingClick);
    updateDeviceCardMeta(node, deviceId, sensorData);
    rebuildDeviceCardMappings(node, deviceId);
    return node;
  }

  function updateDeviceCardMeta(node, deviceId, sensorData) {
    const idEl = node.querySelector(".device-id");
    const metaEl = node.querySelector(".device-meta");

    if (idEl) idEl.textContent = `Device ${deviceId}`;
    if (metaEl) {
      const ax = sensorData && typeof sensorData.ax === "number" ? sensorData.ax : 0;
      const ay = sensorData && typeof sensorData.ay === "number" ? sensorData.ay : 0;
      const az = sensorData && typeof sensorData.az === "number" ? sensorData.az : 0;
      metaEl.textContent = `ax:${ax.toFixed(0)} ay:${ay.toFixed(0)} az:${az.toFixed(
        0
      )} tap:${sensorData && sensorData.tap ? "yes" : "no"}`;
    }
  }

  function rebuildDeviceCardMappings(node, deviceId) {
    const tbody = node.querySelector("tbody");
    if (!tbody) return;

    // Rebuild only this device's table body structure.
    tbody.innerHTML = "";

    const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
      state.mappingsByDevice,
      deviceId
    );

    const rows = [
      { key: "ax", label: "Accel X" },
      { key: "ay", label: "Accel Y" },
      { key: "az", label: "Accel Z" },
      { key: "magnitude", label: "Movement magnitude" },
      { key: "tap", label: "Tap" },
    ];

    const enabledRows = rows.filter((row) => {
      const mapping = deviceMappings[row.key];
      return mapping && mapping.enabled;
    });

    const availableRows = rows.filter((row) => {
      const mapping = deviceMappings[row.key];
      return !mapping || !mapping.enabled;
    });

    enabledRows.forEach((row) => {
      const mapping = deviceMappings[row.key];
      const tr = document.createElement("tr");

      tr.dataset.deviceId = deviceId;
      tr.dataset.sensorKey = row.key;

      const nameTd = document.createElement("td");
      nameTd.textContent = row.label;
      tr.appendChild(nameTd);

      const soloTd = document.createElement("td");
      const soloInput = document.createElement("input");
      soloInput.type = "checkbox";
      soloInput.checked = !!mapping.solo;
      soloInput.dataset.deviceId = deviceId;
      soloInput.dataset.sensorKey = row.key;
      soloInput.dataset.field = "solo";
      soloTd.appendChild(soloInput);
      tr.appendChild(soloTd);

      const channelTd = document.createElement("td");
      const channelInput = document.createElement("input");
      channelInput.type = "number";
      channelInput.min = "1";
      channelInput.max = "16";
      channelInput.value = mapping.channel || 1;
      channelInput.dataset.deviceId = deviceId;
      channelInput.dataset.sensorKey = row.key;
      channelInput.dataset.field = "channel";
      channelTd.appendChild(channelInput);
      tr.appendChild(channelTd);

      const ccNoteTd = document.createElement("td");
      const ccOrNoteInput = document.createElement("input");
      ccOrNoteInput.type = "number";
      ccOrNoteInput.min = "0";
      ccOrNoteInput.max = "127";
      ccOrNoteInput.dataset.deviceId = deviceId;
      ccOrNoteInput.dataset.sensorKey = row.key;
      if (row.key === "tap") {
        ccOrNoteInput.value =
          typeof mapping.noteNumber === "number" ? mapping.noteNumber : 60;
        ccOrNoteInput.dataset.field = "noteNumber";
      } else {
        ccOrNoteInput.value = typeof mapping.ccNumber === "number" ? mapping.ccNumber : 1;
        ccOrNoteInput.dataset.field = "ccNumber";
      }
      ccNoteTd.appendChild(ccOrNoteInput);
      tr.appendChild(ccNoteTd);

      const out0Td = document.createElement("td");
      if (row.key === "tap") {
        out0Td.textContent = "-";
      } else {
        const out0Input = document.createElement("input");
        out0Input.type = "number";
        out0Input.value =
          typeof mapping.outputMin === "number" ? mapping.outputMin : 0;
        out0Input.dataset.deviceId = deviceId;
        out0Input.dataset.sensorKey = row.key;
        out0Input.dataset.field = "outputMin";
        out0Td.appendChild(out0Input);
      }
      tr.appendChild(out0Td);

      const out255Td = document.createElement("td");
      if (row.key === "tap") {
        out255Td.textContent = "-";
      } else {
        const out255Input = document.createElement("input");
        out255Input.type = "number";
        out255Input.value =
          typeof mapping.outputMax === "number" ? mapping.outputMax : 127;
        out255Input.dataset.deviceId = deviceId;
        out255Input.dataset.sensorKey = row.key;
        out255Input.dataset.field = "outputMax";
        out255Td.appendChild(out255Input);
      }
      tr.appendChild(out255Td);

      const velocityTd = document.createElement("td");
      if (row.key === "tap") {
        const velInput = document.createElement("input");
        velInput.type = "number";
        velInput.min = "0";
        velInput.max = "127";
        velInput.value =
          typeof mapping.velocity === "number" ? mapping.velocity : 110;
        velInput.dataset.deviceId = deviceId;
        velInput.dataset.sensorKey = row.key;
        velInput.dataset.field = "velocity";
        velocityTd.appendChild(velInput);
      } else {
        velocityTd.textContent = "-";
      }
      tr.appendChild(velocityTd);

      const durationTd = document.createElement("td");
      if (row.key === "tap") {
        const durInput = document.createElement("input");
        durInput.type = "number";
        durInput.min = "10";
        durInput.max = "2000";
        durInput.step = "10";
        durInput.value =
          typeof mapping.durationMs === "number" ? mapping.durationMs : 200;
        durInput.dataset.deviceId = deviceId;
        durInput.dataset.sensorKey = row.key;
        durInput.dataset.field = "durationMs";
        durationTd.appendChild(durInput);
      } else {
        durationTd.textContent = "-";
      }
      tr.appendChild(durationTd);

      const valueTd = document.createElement("td");
      const lastValue =
        DeviceMidiMappingEngine.getLastValue(deviceId, row.key);
      valueTd.className = "mapping-value";
      valueTd.textContent =
        lastValue === null || typeof lastValue === "undefined"
          ? "—"
          : String(Math.round(lastValue));
      tr.appendChild(valueTd);

      const removeTd = document.createElement("td");
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "−";
      removeBtn.className = "mapping-remove-btn";
      removeBtn.dataset.deviceId = deviceId;
      removeBtn.dataset.sensorKey = row.key;
      removeTd.appendChild(removeBtn);
      tr.appendChild(removeTd);

      tbody.appendChild(tr);
    });

    // Add-mapping control: only show when there are unmapped sensor outputs
    if (availableRows.length > 0) {
      const addTr = document.createElement("tr");
      const addTd = document.createElement("td");
      addTd.colSpan = 10;

      const labelSpan = document.createElement("span");
      labelSpan.textContent = "Add mapping:";
      labelSpan.className = "mapping-add-label";
      addTd.appendChild(labelSpan);

      const select = document.createElement("select");
      select.className = "mapping-add-select";
      select.dataset.deviceId = deviceId;
      availableRows.forEach((row) => {
        const opt = document.createElement("option");
        opt.value = row.key;
        opt.textContent = row.label;
        select.appendChild(opt);
      });
      addTd.appendChild(select);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "+";
      addBtn.className = "mapping-add-btn";
      addBtn.dataset.deviceId = deviceId;
      addTd.appendChild(addBtn);

      addTr.appendChild(addTd);
      tbody.appendChild(addTr);
    }
  }

  function updateDeviceCardLive(node, deviceId, sensorData) {
    updateDeviceCardMeta(node, deviceId, sensorData);

    const tbody = node.querySelector("tbody");
    if (!tbody) return;

    const rows = tbody.querySelectorAll("tr[data-sensor-key]");
    rows.forEach((tr) => {
      const key = tr.dataset.sensorKey;
      if (!key) return;
      const valueTd = tr.querySelector(".mapping-value");
      if (!valueTd) return;
      const lastValue = DeviceMidiMappingEngine.getLastValue(deviceId, key);
      valueTd.textContent =
        lastValue === null || typeof lastValue === "undefined"
          ? "—"
          : String(Math.round(lastValue));
    });
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
      return;
    }
  }

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

  document.addEventListener("DOMContentLoaded", init);
})();

