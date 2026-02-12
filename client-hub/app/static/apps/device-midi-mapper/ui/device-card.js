// Device card UI helpers for the Device MIDI Mapper app.
// Responsible for rendering and updating a single device card and its mapping rows.

(function () {
  function renderDeviceCard(deviceTemplate, deviceId, sensorData, mappingsByDevice, handlers) {
    const tpl = deviceTemplate;
    const node = tpl.content.firstElementChild.cloneNode(true);
    // Single delegated listeners per card; rows can be rebuilt safely.
    if (handlers && typeof handlers.onChange === "function") {
      node.addEventListener("change", handlers.onChange);
    }
    if (handlers && typeof handlers.onClick === "function") {
      node.addEventListener("click", handlers.onClick);
    }
    updateDeviceCardMeta(node, deviceId, sensorData);
    rebuildDeviceCardMappings(node, deviceId, mappingsByDevice);
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

  function getSensorRows() {
    if (
      window.DeviceMidiSensors &&
      typeof DeviceMidiSensors.getSensorDefinitions === "function"
    ) {
      return DeviceMidiSensors.getSensorDefinitions();
    }
    return [
      { key: "ax", label: "Accel X" },
      { key: "ay", label: "Accel Y" },
      { key: "az", label: "Accel Z" },
      { key: "magnitude", label: "Movement magnitude" },
      { key: "tap", label: "Tap" },
    ];
  }

  function rebuildDeviceCardMappings(node, deviceId, mappingsByDevice) {
    const tbody = node.querySelector("tbody");
    if (!tbody) return;

    // Rebuild only this device's table body structure.
    tbody.innerHTML = "";

    const deviceMappings = DeviceMidiMappingEngine.ensureDeviceMappings(
      mappingsByDevice,
      deviceId
    );

    const rows = getSensorRows();

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
        ccOrNoteInput.value = typeof mapping.noteNumber === "number" ? mapping.noteNumber : 60;
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
        out0Input.value = typeof mapping.outputMin === "number" ? mapping.outputMin : 0;
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
        out255Input.value = typeof mapping.outputMax === "number" ? mapping.outputMax : 127;
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
        velInput.value = typeof mapping.velocity === "number" ? mapping.velocity : 110;
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
        durInput.value = typeof mapping.durationMs === "number" ? mapping.durationMs : 200;
        durInput.dataset.deviceId = deviceId;
        durInput.dataset.sensorKey = row.key;
        durInput.dataset.field = "durationMs";
        durationTd.appendChild(durInput);
      } else {
        durationTd.textContent = "-";
      }
      tr.appendChild(durationTd);

      const valueTd = document.createElement("td");
      const lastValue = DeviceMidiMappingEngine.getLastValue(deviceId, row.key);
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

  window.DeviceMidiDeviceCard = {
    renderDeviceCard,
    updateDeviceCardMeta,
    rebuildDeviceCardMappings,
    updateDeviceCardLive,
  };
})();

