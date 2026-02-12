// Lightweight MIDI manager built on top of WebMidi.
// Responsible for enabling WebMidi, listing outputs and sending CC / Note messages.

(function () {
  const state = {
    enabled: false,
    outputs: [],
    selectedOutputId: null,
  };

  function refreshOutputs() {
    if (!window.WebMidi || !WebMidi.outputs) {
      state.outputs = [];
      return;
    }
    state.outputs = WebMidi.outputs.map((o) => ({
      id: o.id,
      name: o.name,
    }));

    // If the currently selected output no longer exists, clear it.
    if (
      state.selectedOutputId &&
      !state.outputs.some((o) => o.id === state.selectedOutputId)
    ) {
      state.selectedOutputId = null;
    }
  }

  function getSelectedOutput() {
    if (!state.enabled || !window.WebMidi) return null;
    if (!state.selectedOutputId) return null;
    try {
      return WebMidi.getOutputById(state.selectedOutputId) || null;
    } catch (e) {
      console.warn("Error getting MIDI output:", e);
      return null;
    }
  }

  async function enableIfNeeded() {
    if (state.enabled) {
      refreshOutputs();
      return;
    }
    if (!window.WebMidi) {
      console.warn("WebMidi is not available on window");
      return;
    }
    try {
      await WebMidi.enable();
      state.enabled = true;
      refreshOutputs();
      console.log("WebMidi enabled for Device MIDI Mapper");
    } catch (e) {
      console.error("Failed to enable WebMidi:", e);
    }
  }

  function listOutputs() {
    return state.outputs.slice();
  }

  function setSelectedOutputId(id) {
    state.selectedOutputId = id || null;
  }

  function getSelectedOutputId() {
    return state.selectedOutputId || null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sendControlChange(ccNumber, value, channel) {
    const output = getSelectedOutput();
    if (!output) return;
    const cc = clamp(Number(ccNumber) || 0, 0, 127);
    const val = clamp(Number(value) || 0, 0, 127);
    const ch = clamp(Number(channel) || 1, 1, 16);
    try {
      output.sendControlChange(cc, val, ch);
    } catch (e) {
      console.error("Error sending MIDI CC:", e);
    }
  }

  function sendNoteOn(noteNumber, velocity, channel) {
    const output = getSelectedOutput();
    if (!output) return;
    const note = clamp(Number(noteNumber) || 0, 0, 127);
    const vel = clamp(Number(velocity) || 0, 0, 127);
    const ch = clamp(Number(channel) || 1, 1, 16);
    try {
      output.playNote(note, ch, { velocity: vel / 127 });
    } catch (e) {
      console.error("Error sending MIDI Note On:", e);
    }
  }

  function sendNoteOff(noteNumber, channel) {
    const output = getSelectedOutput();
    if (!output) return;
    const note = clamp(Number(noteNumber) || 0, 0, 127);
    const ch = clamp(Number(channel) || 1, 1, 16);
    try {
      output.stopNote(note, ch);
    } catch (e) {
      console.error("Error sending MIDI Note Off:", e);
    }
  }

  window.DeviceMidi = {
    enableIfNeeded,
    listOutputs,
    setSelectedOutputId,
    getSelectedOutputId,
    sendControlChange,
    sendNoteOn,
    sendNoteOff,
  };
})();

