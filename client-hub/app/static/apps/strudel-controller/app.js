/* global HitloopDeviceManager, DeviceMidi */

(() => {
  const AXES = [
    { key: "ax", label: "aX", cc: 1 },
    { key: "ay", label: "aY", cc: 2 },
    { key: "az", label: "aZ", cc: 3 },
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function setFooter(msg) {
    const el = $("footerMessage");
    if (el) el.textContent = msg || "";
  }

  function setStatus(kind, text) {
    const dot = $("statusDot");
    const label = $("statusText");
    if (label) label.textContent = text || "";
    if (!dot) return;
    if (kind === "ok") dot.style.background = "var(--ok)";
    else if (kind === "warn") dot.style.background = "var(--warn)";
    else if (kind === "danger") dot.style.background = "var(--danger)";
    else dot.style.background = "rgba(255,255,255,0.25)";
  }

  function safeClipboardWrite(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function insertIntoStrudel(replEl, text) {
    if (!replEl || !replEl.editor || !replEl.editor.editor) return false;
    const view = replEl.editor.editor;
    const sel = view.state.selection.main;
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } });
    view.focus();
    return true;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const wsUrlInput = $("wsUrl");
    const connectBtn = $("connectBtn");
    const disconnectBtn = $("disconnectBtn");
    const midiSelect = $("midiSelect");
    const devicesList = $("devicesList");
    const replEl = $("repl");
    const editorWrap = document.querySelector(".editorWrap");

    const defaultWsUrl =
      (window.APP_CONFIG && window.APP_CONFIG.wsDefaultUrl) || "ws://localhost:5003/";
    if (wsUrlInput && !wsUrlInput.value) wsUrlInput.value = defaultWsUrl;

    let manager = null;
    const channelMap = new Map(); // deviceId → MIDI channel (1–16)
    let nextChannel = 1;
    let renderQueued = false;
    let dragSnippet = null;

    // --- MIDI ---

    async function initMidi() {
      await DeviceMidi.enableIfNeeded();
      populateMidiSelect();
    }

    function populateMidiSelect() {
      if (!midiSelect) return;
      const outputs = DeviceMidi.listOutputs();
      midiSelect.innerHTML = '<option value="">— select MIDI output —</option>';
      for (const o of outputs) {
        const opt = document.createElement("option");
        opt.value = o.id;
        opt.textContent = o.name;
        midiSelect.appendChild(opt);
      }
      const savedId = DeviceMidi.getSelectedOutputId();
      if (savedId && outputs.some((o) => o.id === savedId)) {
        midiSelect.value = savedId;
      }
    }

    // --- Channel assignment ---

    function getChannel(deviceId) {
      if (!channelMap.has(deviceId)) {
        if (channelMap.size >= 16) return null;
        channelMap.set(deviceId, nextChannel++);
      }
      return channelMap.get(deviceId);
    }

    // --- MIDI CC loop (RAF) ---

    function mappingLoop() {
      if (manager) {
        for (const [id, device] of manager.getAllDevices()) {
          const ch = getChannel(id);
          if (!ch) continue;
          const data = device.getSensorData();
          DeviceMidi.sendControlChange(1, Math.round((data.ax ?? 0) / 2), ch);
          DeviceMidi.sendControlChange(2, Math.round((data.ay ?? 0) / 2), ch);
          DeviceMidi.sendControlChange(3, Math.round((data.az ?? 0) / 2), ch);
        }
      }
      requestAnimationFrame(mappingLoop);
    }

    // --- Device card rendering ---

    function snippetFor(cc, ch) {
      return ch ? `cc(${cc}).midichan(${ch})` : `cc(${cc})`;
    }

    function createDeviceCard(deviceId, idUpper, ch) {
      const card = document.createElement("div");
      card.className = "device-card";
      card.dataset.deviceId = String(deviceId);

      const header = document.createElement("div");
      header.className = "device-card__header";

      const idEl = document.createElement("span");
      idEl.className = "device-card__id";
      idEl.textContent = idUpper;

      const chEl = document.createElement("span");
      chEl.className = "device-card__channel";
      chEl.textContent = ch ? `ch ${ch}` : "—";

      header.appendChild(idEl);
      header.appendChild(chEl);
      card.appendChild(header);

      const axesEl = document.createElement("div");
      axesEl.className = "device-card__axes";

      for (const axis of AXES) {
        const snippet = snippetFor(axis.cc, ch);
        const row = document.createElement("div");
        row.className = "axis-row";
        row.draggable = true;
        row.title = "Drag into Strudel, or click to copy.";
        row.dataset.snippet = snippet;

        const labelEl = document.createElement("span");
        labelEl.className = "axis-row__label";
        labelEl.textContent = axis.label;

        const snippetEl = document.createElement("code");
        snippetEl.className = "axis-row__snippet";
        snippetEl.textContent = snippet;

        const barEl = document.createElement("div");
        barEl.className = "axis-row__bar";

        const fillEl = document.createElement("div");
        fillEl.className = "axis-row__fill";
        fillEl.dataset.axis = axis.key;
        fillEl.style.width = "0%";
        barEl.appendChild(fillEl);

        const valueEl = document.createElement("span");
        valueEl.className = "axis-row__value";
        valueEl.dataset.axis = axis.key;
        valueEl.textContent = "0";

        row.appendChild(labelEl);
        row.appendChild(snippetEl);
        row.appendChild(barEl);
        row.appendChild(valueEl);
        axesEl.appendChild(row);

        row.addEventListener("dragstart", (ev) => {
          dragSnippet = snippet;
          ev.dataTransfer.setData("text/plain", snippet);
          ev.dataTransfer.effectAllowed = "copy";
        });
        row.addEventListener("dragend", () => {
          dragSnippet = null;
        });
        row.addEventListener("click", () => {
          safeClipboardWrite(snippet);
          setFooter(`copied: ${snippet}`);
        });
      }

      card.appendChild(axesEl);
      return card;
    }

    function updateDeviceCardValues(card, data) {
      for (const axis of AXES) {
        const rawVal = data[axis.key] ?? 0;
        const ccVal = Math.round(rawVal / 2);
        const pct = Math.round((rawVal / 255) * 100);

        const fill = card.querySelector(`.axis-row__fill[data-axis="${axis.key}"]`);
        const valueEl = card.querySelector(`.axis-row__value[data-axis="${axis.key}"]`);
        if (fill) fill.style.width = pct + "%";
        if (valueEl) valueEl.textContent = ccVal;
      }
    }

    function renderDevices() {
      renderQueued = false;

      const count = manager ? manager.getDeviceCount() : 0;
      const countEl = $("deviceCount");
      if (countEl) countEl.textContent = `${count} device${count === 1 ? "" : "s"}`;

      if (!devicesList) return;

      if (!manager || count === 0) {
        devicesList.innerHTML = '<div class="hint">No devices connected.</div>';
        return;
      }

      const devices = Array.from(manager.getAllDevices());
      const currentIds = new Set(devices.map(([id]) => String(id)));

      for (const card of devicesList.querySelectorAll(".device-card")) {
        if (!currentIds.has(card.dataset.deviceId)) card.remove();
      }

      for (const [id, device] of devices) {
        const ch = getChannel(id);
        const data = device.getSensorData();
        const idUpper = String(id).slice(0, 4).toUpperCase();
        const idStr = String(id);

        let card = devicesList.querySelector(`.device-card[data-device-id="${idStr}"]`);
        if (!card) {
          card = createDeviceCard(id, idUpper, ch);
          devicesList.appendChild(card);
        }
        updateDeviceCardValues(card, data);
      }
    }

    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(renderDevices);
    }

    // --- Manager hooks ---

    function attachManagerHooks(mgr) {
      const originalParse = mgr.parseAndUpdateDevice.bind(mgr);
      mgr.parseAndUpdateDevice = (frame) => {
        const ok = originalParse(frame);
        if (ok) scheduleRender();
        return ok;
      };

      const originalPrune = mgr.pruneInactive.bind(mgr);
      mgr.pruneInactive = () => {
        originalPrune();
        for (const id of [...channelMap.keys()]) {
          if (!mgr.getDevice(id)) channelMap.delete(id);
        }
        scheduleRender();
      };
    }

    // --- WebSocket connect / disconnect ---

    async function connect() {
      const url = String(wsUrlInput?.value || "").trim();
      if (!url) return;
      try {
        setFooter("");
        setStatus("warn", "connecting…");
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        manager = new HitloopDeviceManager(url);
        attachManagerHooks(manager);
        await manager.connect();
        scheduleRender();
      } catch (e) {
        setStatus("danger", "error");
        setFooter(`connect error: ${String(e?.message || e)}`);
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
      }
    }

    function disconnect() {
      try {
        manager?.disconnect?.();
      } catch (_e) {}
      manager = null;
      setStatus(null, "disconnected");
      setFooter("disconnected");
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      scheduleRender();
    }

    function updateConnectionStatusLoop() {
      const ws = manager?.ws;
      const ready = ws && ws.readyState === WebSocket.OPEN;
      if (ready) {
        const n = manager.getDeviceCount();
        setStatus("ok", `connected · ${n} device${n === 1 ? "" : "s"}`);
      } else if (manager) {
        setStatus("warn", "connecting…");
      } else {
        setStatus(null, "disconnected");
      }
    }

    // --- Strudel controls ---

    async function evaluatePlay() {
      try {
        setFooter("");
        await replEl?.editor?.evaluate(true);
        setFooter(`evaluated @ ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        setFooter(`eval error: ${String(e?.message || e)}`);
      }
    }

    function stop() {
      try {
        replEl?.editor?.stop?.();
        setFooter("stopped");
      } catch (e) {
        setFooter(`stop error: ${String(e?.message || e)}`);
      }
    }

    // --- Drag onto Strudel editor ---

    if (editorWrap) {
      editorWrap.addEventListener("dragover", (ev) => {
        if (!dragSnippet) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
        editorWrap.classList.add("drop-active");
      });
      editorWrap.addEventListener("dragleave", (ev) => {
        if (!editorWrap.contains(ev.relatedTarget)) {
          editorWrap.classList.remove("drop-active");
        }
      });
      editorWrap.addEventListener("drop", (ev) => {
        ev.preventDefault();
        editorWrap.classList.remove("drop-active");
        const text = ev.dataTransfer.getData("text/plain") || dragSnippet;
        if (!text) return;
        const ok = insertIntoStrudel(replEl, text);
        if (ok) setFooter(`inserted: ${text}`);
        else setFooter("Could not insert — click into the editor first to set cursor position.");
      });
    }

    // --- Wire up ---

    midiSelect?.addEventListener("change", () => {
      DeviceMidi.setSelectedOutputId(midiSelect.value || null);
    });

    connectBtn?.addEventListener("click", connect);
    disconnectBtn?.addEventListener("click", disconnect);
    $("evalBtn")?.addEventListener("click", evaluatePlay);
    $("stopBtn")?.addEventListener("click", stop);

    replEl?.addEventListener("update", (ev) => {
      const st = ev?.detail;
      const started = st?.scheduler?.started;
      if (typeof started === "boolean") setFooter(started ? "playing" : "stopped");
    });

    // Start
    await initMidi();
    scheduleRender();
    requestAnimationFrame(mappingLoop);
    setInterval(updateConnectionStatusLoop, 250);
    setInterval(scheduleRender, 1000);
  });
})();
