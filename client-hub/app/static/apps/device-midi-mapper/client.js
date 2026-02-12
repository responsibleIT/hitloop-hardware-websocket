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

  const state =
    window.DeviceMidiAppState && DeviceMidiAppState.state
      ? DeviceMidiAppState.state
      : {
          deviceManager: null,
          lastUpdateTs: null,
          mappingsByDevice: {},
          selectedOutputId: null,
        };

  // Keep a stable mapping from deviceId -> DOM node so we only update
  // the affected elements instead of re-rendering the whole container.
  const deviceCards = Object.create(null);
  let emptyStateEl = null;
  const soloSnapshots = Object.create(null);
  let mappingHandlers = null;

  function init() {
    // Restore from local storage
    if (window.DeviceMidiAppState && typeof DeviceMidiAppState.loadFromStorage === "function") {
      DeviceMidiAppState.loadFromStorage();
    } else {
      const stored = window.DeviceMidiStorage && window.DeviceMidiStorage.loadState();
      if (stored) {
        state.mappingsByDevice = stored.mappingsByDevice || {};
        state.selectedOutputId = stored.selectedOutputId || null;
      }
    }

    // Initialize mapping handlers now that state is ready
    if (
      window.DeviceMidiMappingEvents &&
      typeof DeviceMidiMappingEvents.createHandlers === "function"
    ) {
      mappingHandlers = DeviceMidiMappingEvents.createHandlers({
        state,
        persistState,
        deviceCards,
        rebuildDeviceCardMappings,
        soloSnapshots,
      });
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
        if (window.DeviceMidiAppState && typeof DeviceMidiAppState.setDeviceManager === "function") {
          DeviceMidiAppState.setDeviceManager(state.deviceManager);
        }
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
      if (
        window.DeviceMidiAppState &&
        typeof DeviceMidiAppState.setSelectedOutputId === "function"
      ) {
        DeviceMidiAppState.setSelectedOutputId(id);
      }
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
      if (
        window.DeviceMidiAppState &&
        typeof DeviceMidiAppState.setSelectedOutputId === "function"
      ) {
        DeviceMidiAppState.setSelectedOutputId(first.id);
      }
      midiOutputSelect.value = first.id;
      persistState();
    }
  }

  function persistState() {
    if (window.DeviceMidiAppState && typeof DeviceMidiAppState.persist === "function") {
      DeviceMidiAppState.persist();
      return;
    }
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
    if (window.DeviceMidiDeviceList && DeviceMidiDeviceList.renderDevices) {
      DeviceMidiDeviceList.renderDevices(
        state,
        deviceCards,
        devicesContainer,
        deviceTemplate,
        renderDeviceCard,
        updateDeviceCardLive
      );
    }
  }

  function renderDeviceCard(deviceId, sensorData) {
    return window.DeviceMidiDeviceCard && DeviceMidiDeviceCard.renderDeviceCard
      ? DeviceMidiDeviceCard.renderDeviceCard(deviceTemplate, deviceId, sensorData, state.mappingsByDevice, {
          onChange: handleMappingChange,
          onClick: handleAddMappingClick,
        })
      : null;
  }

  function updateDeviceCardMeta(node, deviceId, sensorData) {
    if (window.DeviceMidiDeviceCard && DeviceMidiDeviceCard.updateDeviceCardMeta) {
      DeviceMidiDeviceCard.updateDeviceCardMeta(node, deviceId, sensorData);
    }
  }

  function rebuildDeviceCardMappings(node, deviceId) {
    if (window.DeviceMidiDeviceCard && DeviceMidiDeviceCard.rebuildDeviceCardMappings) {
      DeviceMidiDeviceCard.rebuildDeviceCardMappings(node, deviceId, state.mappingsByDevice);
    }
  }

  function updateDeviceCardLive(node, deviceId, sensorData) {
    if (window.DeviceMidiDeviceCard && DeviceMidiDeviceCard.updateDeviceCardLive) {
      DeviceMidiDeviceCard.updateDeviceCardLive(node, deviceId, sensorData);
    }
  }

  function handleMappingChange(event) {
    if (mappingHandlers && typeof mappingHandlers.handleMappingChange === "function") {
      mappingHandlers.handleMappingChange(event);
    }
  }

  function handleAddMappingClick(event) {
    if (mappingHandlers && typeof mappingHandlers.handleAddMappingClick === "function") {
      mappingHandlers.handleAddMappingClick(event);
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  window.DeviceMidiClient = {
    init,
  };
})();

