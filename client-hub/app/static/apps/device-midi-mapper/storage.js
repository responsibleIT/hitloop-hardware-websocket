// Simple wrapper around localStorage and JSON (de)serialization for presets.
// The stored shape mirrors the in-memory app state but is kept loosely typed
// so we can evolve it without breaking older presets.

(function () {
  const STORAGE_KEY = "deviceMidiMapper.state.v1";

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch (e) {
      console.warn("Failed to parse stored Device MIDI Mapper state:", e);
      return null;
    }
  }

  function loadState() {
    if (!window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  }

  function saveState(state) {
    if (!window.localStorage) {
      return;
    }
    try {
      const serializable = {
        selectedOutputId: state.selectedOutputId || null,
        mappingsByDevice: state.mappingsByDevice || {},
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.warn("Failed to save Device MIDI Mapper state:", e);
    }
  }

  function exportToJson(state) {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      selectedOutputId: state.selectedOutputId || null,
      mappingsByDevice: state.mappingsByDevice || {},
    };
    return JSON.stringify(payload, null, 2);
  }

  function importFromJson(json) {
    const parsed = safeParse(json);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid preset JSON");
    }
    const mappingsByDevice = parsed.mappingsByDevice && typeof parsed.mappingsByDevice === "object"
      ? parsed.mappingsByDevice
      : {};
    const selectedOutputId =
      typeof parsed.selectedOutputId === "string" || parsed.selectedOutputId === null
        ? parsed.selectedOutputId
        : null;
    return {
      selectedOutputId,
      mappingsByDevice,
    };
  }

  function triggerDownload(filename, contents) {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.DeviceMidiStorage = {
    loadState,
    saveState,
    exportToJson,
    importFromJson,
    triggerDownload,
  };
})();

