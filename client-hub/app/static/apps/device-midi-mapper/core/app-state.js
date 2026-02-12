// Central app state and persistence wiring for the Device MIDI Mapper app.
// Keeps a single mutable state object that other modules can read and update.

(function () {
  const state = {
    deviceManager: null,
    lastUpdateTs: null,
    mappingsByDevice: {},
    selectedOutputId: null,
  };

  function loadFromStorage() {
    if (!window.DeviceMidiStorage || typeof DeviceMidiStorage.loadState !== "function") {
      return;
    }
    const stored = DeviceMidiStorage.loadState();
    if (!stored || typeof stored !== "object") {
      return;
    }
    state.mappingsByDevice = stored.mappingsByDevice || {};
    state.selectedOutputId = stored.selectedOutputId || null;
  }

  function persist() {
    if (!window.DeviceMidiStorage || typeof DeviceMidiStorage.saveState !== "function") {
      return;
    }
    DeviceMidiStorage.saveState({
      selectedOutputId: state.selectedOutputId,
      mappingsByDevice: state.mappingsByDevice,
    });
  }

  function setSelectedOutputId(id) {
    state.selectedOutputId = id || null;
  }

  function setDeviceManager(manager) {
    state.deviceManager = manager || null;
  }

  function setLastUpdateTs(ts) {
    state.lastUpdateTs = ts;
  }

  window.DeviceMidiAppState = {
    state,
    loadFromStorage,
    persist,
    setSelectedOutputId,
    setDeviceManager,
    setLastUpdateTs,
  };
})();

