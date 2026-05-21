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

  function setStrudelContent(replEl, text) {
    if (!replEl || !replEl.editor || !replEl.editor.editor) return false;
    const view = replEl.editor.editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    view.focus();
    return true;
  }

  function getStrudelContent(replEl) {
    try {
      return replEl?.editor?.editor?.state?.doc?.toString() ?? null;
    } catch (_) {
      return null;
    }
  }

  // --- Script storage ---

  const SCRIPTS_KEY = "strudelController.scripts.v1";

  function loadScripts() {
    try {
      return JSON.parse(localStorage.getItem(SCRIPTS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function persistScripts(scripts) {
    localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
  }

  function saveScript(name, code) {
    const scripts = loadScripts();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    scripts.unshift({ id, name: name || "Untitled", code, savedAt: new Date().toISOString() });
    persistScripts(scripts);
    return scripts;
  }

  function deleteScript(id) {
    const scripts = loadScripts().filter((s) => s.id !== id);
    persistScripts(scripts);
    return scripts;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const wsUrlInput = $("wsUrl");
    const connectBtn = $("connectBtn");
    const disconnectBtn = $("disconnectBtn");
    const midiSelect = $("midiSelect");
    const devicesList = $("devicesList");
    const replEl = $("repl");
    const editorWrap = document.querySelector(".editorWrap");
    const scriptsPanel = $("scriptsPanel");
    const scriptList = $("scriptList");
    const scriptNameInput = $("scriptNameInput");
    const consoleMessages = $("consoleMessages");
    const consoleBadge = $("consoleBadge");

    const defaultWsUrl =
      (window.APP_CONFIG && window.APP_CONFIG.wsDefaultUrl) || "ws://localhost:5003/";
    if (wsUrlInput && !wsUrlInput.value) wsUrlInput.value = defaultWsUrl;

    let manager = null;
    const slotMap = new Map(); // deviceId → slot index (0-based); CC base = slot * 3 + 1
    let nextSlot = 0;
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

    // --- CC slot assignment (all on channel 1) ---
    // Each device gets 3 consecutive CC numbers: base, base+1, base+2
    // Device slot 0 → CC1/CC2/CC3, slot 1 → CC4/CC5/CC6, etc.

    function getCCBase(deviceId) {
      if (!slotMap.has(deviceId)) {
        slotMap.set(deviceId, nextSlot++);
      }
      return slotMap.get(deviceId) * 3 + 1;
    }

    // --- MIDI CC loop (50ms = 20/s, stable even when tab is backgrounded) ---

    // Maps raw 0–255 accelerometer byte to CC 0–127.
    // Sensor convention: 0g = 128, −1g = 64, +1g = 192  (±2g fills 0–255).
    // Desired: −1g → 0, 0g → 64, +1g → 127, clamped.
    function axisToCC(raw) {
      return Math.min(127, Math.max(0, Math.round((raw - 64) * 127 / 128)));
    }

    function mappingLoop() {
      if (!manager) return;
      for (const [id, device] of manager.getAllDevices()) {
        const base = getCCBase(id);
        const data = device.getSensorData();
        DeviceMidi.sendControlChange(base,     axisToCC(data.ax ?? 128), 1);
        DeviceMidi.sendControlChange(base + 1, axisToCC(data.ay ?? 128), 1);
        DeviceMidi.sendControlChange(base + 2, axisToCC(data.az ?? 128), 1);
      }
    }

    // --- Device card rendering ---

    function snippetFor(ccNumber) {
      return `cc(${ccNumber}).midichan(1)`;
    }

    function createDeviceCard(deviceId, idUpper, base) {
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
      chEl.textContent = `CC${base}–CC${base + 2}`;

      header.appendChild(idEl);
      header.appendChild(chEl);
      card.appendChild(header);

      const axesEl = document.createElement("div");
      axesEl.className = "device-card__axes";

      for (let i = 0; i < AXES.length; i++) {
        const axis = AXES[i];
        const snippet = snippetFor(base + i);
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
        const base = getCCBase(id);
        const data = device.getSensorData();
        const idUpper = String(id).slice(0, 4).toUpperCase();
        const idStr = String(id);

        let card = devicesList.querySelector(`.device-card[data-device-id="${idStr}"]`);
        if (!card) {
          card = createDeviceCard(id, idUpper, base);
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
        for (const id of [...slotMap.keys()]) {
          if (!mgr.getDevice(id)) slotMap.delete(id);
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

    // --- Scripts panel ---

    function renderScriptsList() {
      if (!scriptList) return;
      const scripts = loadScripts();

      if (scripts.length === 0) {
        scriptList.innerHTML = '<div class="hint">No saved scripts yet.</div>';
        return;
      }

      scriptList.innerHTML = "";
      for (const script of scripts) {
        const item = document.createElement("div");
        item.className = "script-item";

        const nameRow = document.createElement("div");
        nameRow.className = "script-item__name-row";

        const nameEl = document.createElement("span");
        nameEl.className = "script-item__name";
        nameEl.textContent = script.name;

        const actions = document.createElement("div");
        actions.className = "script-item__actions";

        const loadBtn = document.createElement("button");
        loadBtn.className = "btn btn--xs";
        loadBtn.textContent = "Load";
        loadBtn.addEventListener("click", () => {
          const ok = setStrudelContent(replEl, script.code);
          if (ok) setFooter(`loaded: ${script.name}`);
          else setFooter("Could not load — editor not ready.");
        });

        const delBtn = document.createElement("button");
        delBtn.className = "btn btn--xs btn--danger-outline";
        delBtn.title = "Delete";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
          deleteScript(script.id);
          renderScriptsList();
        });

        actions.appendChild(loadBtn);
        actions.appendChild(delBtn);
        nameRow.appendChild(nameEl);
        nameRow.appendChild(actions);

        const preview = document.createElement("pre");
        preview.className = "script-item__preview";
        const lines = script.code.split("\n").slice(0, 3).join("\n");
        preview.textContent = lines + (script.code.split("\n").length > 3 ? "\n…" : "");

        item.appendChild(nameRow);
        item.appendChild(preview);
        scriptList.appendChild(item);
      }
    }

    function toggleScriptsPanel(force) {
      const hidden = force !== undefined ? !force : scriptsPanel.classList.contains("hidden");
      scriptsPanel.classList.toggle("hidden", !hidden);
      if (hidden) renderScriptsList();
    }

    $("toggleScriptsBtn")?.addEventListener("click", () => toggleScriptsPanel());

    $("saveScriptBtn")?.addEventListener("click", () => {
      const code = getStrudelContent(replEl);
      if (code === null) {
        setFooter("Editor not ready — cannot save.");
        return;
      }
      const name = scriptNameInput?.value.trim() || "Untitled";
      saveScript(name, code);
      if (scriptNameInput) scriptNameInput.value = "";
      renderScriptsList();
      setFooter(`saved: ${name}`);
    });

    // --- Console panel ---

    let consoleErrorCount = 0;

    function formatConsoleArg(arg) {
      if (arg instanceof Error) return arg.message;
      if (typeof arg === "object" && arg !== null) {
        try { return JSON.stringify(arg); } catch (_) { return String(arg); }
      }
      return String(arg ?? "");
    }

    function addConsoleMessage(level, args) {
      if (!consoleMessages) return;
      const time = new Date().toLocaleTimeString("en", { hour12: false });
      const text = args.map(formatConsoleArg).filter(Boolean).join(" ");
      if (!text) return;

      const row = document.createElement("div");
      row.className = `console-msg console-msg--${level}`;

      const timeEl = document.createElement("span");
      timeEl.className = "console-msg__time";
      timeEl.textContent = time;

      const textEl = document.createElement("span");
      textEl.className = "console-msg__text";
      textEl.textContent = text;

      row.appendChild(timeEl);
      row.appendChild(textEl);
      consoleMessages.appendChild(row);
      consoleMessages.scrollTop = consoleMessages.scrollHeight;

      if (level === "error") {
        consoleErrorCount++;
        if (consoleBadge) {
          consoleBadge.textContent = consoleErrorCount;
          consoleBadge.hidden = false;
        }
      }
    }

    function clearConsole() {
      if (consoleMessages) consoleMessages.innerHTML = "";
      consoleErrorCount = 0;
      if (consoleBadge) consoleBadge.hidden = true;
    }

    // Intercept console.error and console.warn
    const _origError = console.error.bind(console);
    console.error = (...args) => { _origError(...args); addConsoleMessage("error", args); };

    const _origWarn = console.warn.bind(console);
    console.warn = (...args) => { _origWarn(...args); addConsoleMessage("warn", args); };

    window.addEventListener("unhandledrejection", (ev) => {
      const msg = ev.reason?.message || String(ev.reason);
      addConsoleMessage("error", [`Unhandled rejection: ${msg}`]);
    });

    $("clearConsoleBtn")?.addEventListener("click", clearConsole);

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
    setInterval(mappingLoop, 50);            // 20/s, works when tab is backgrounded
    setInterval(updateConnectionStatusLoop, 250);
    setInterval(scheduleRender, 1000);
  });
})();
