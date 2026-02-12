// Device list rendering for the Device MIDI Mapper app.
// Responsible for adding/removing device cards and managing the empty-state UI.

(function () {
  let emptyStateEl = null;

  function renderDevices(state, deviceCards, devicesContainer, deviceTemplate, renderDeviceCard, updateDeviceCardLive) {
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
        if (!card) return;
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

  window.DeviceMidiDeviceList = {
    renderDevices,
  };
})();

