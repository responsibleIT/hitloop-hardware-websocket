// Composition root for the Device MIDI Mapper app.
// Wraps the existing client logic in a small MapperApp class.

(function () {
  class MapperApp {
    constructor() {
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      this.initialized = true;
      // Defer to the existing client.js init which wires everything up.
      if (window.DeviceMidiClient && typeof DeviceMidiClient.init === "function") {
        DeviceMidiClient.init();
      } else {
        // Fallback to the DOMContentLoaded handler in client.js
        const event = new Event("DOMContentLoaded");
        document.dispatchEvent(event);
      }
    }
  }

  window.DeviceMidiMapperApp = {
    MapperApp,
  };

  document.addEventListener("DOMContentLoaded", () => {
    const AppClass =
      window.DeviceMidiMapperApp && window.DeviceMidiMapperApp.MapperApp
        ? window.DeviceMidiMapperApp.MapperApp
        : MapperApp;
    const app = new AppClass();
    app.init();
  });
})();

