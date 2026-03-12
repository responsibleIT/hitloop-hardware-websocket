# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## System Overview

**GroupLoop** connects ESP32-based wearable devices to browser applications via a Python WebSocket relay. The stack consists of:

- **Firmware**: ESP32 firmware running on physical devices (`grouploop-firmware/ble-scanner/`)
- **Socket Server**: Python WebSocket bridge using `websockets` (`socket-server/app/app.py`)
- **Client Hub**: Flask app serving browser apps (`client-hub/app/app.py`)
- **Documentation**: MkDocs site (`documentation/`)

Orchestration is via Docker (`docker-compose.yml`).

---

## Service Ports (host → container)

| Service | Host Port | Description |
|---------|-----------|-------------|
| socket  | 5003      | WebSocket server |
| client_hub | 5004   | Flask app serving browser apps |
| docs    | 5006      | MkDocs documentation |

---

## Core Architecture

### Data Flow

```
Device ──hex frames──► Socket Server ──WebSocket──► Browser App
                                                              │
                                                              ▼
Client UI / Custom Apps ◄── commands ──Socket Server──► Device
```

### Message Formats

**Sensor Frame**: 20-char hex string
`id(4) + ax(2) + ay(2) + az(2) + dNW(2) + dNE(2) + dSE(2) + dSW(2) + tap(2)`

**Command Protocol**: `cmd:<target>:<command>:<parameters>`
- `target`: Device ID (4 hex chars) or `all` for broadcast
- Examples: `cmd:1a2b:led:ff0000`, `cmd:all:vibrate:1000`

---

## Component Locations by Task

| Task | Files to Modify |
|------|-----------------|
| Change app discovery / landing page | `client-hub/app/app.py`, `client-hub/app/templates/landing.html` |
| Add a new browser app | `client-hub/app/static/apps/<name>/index.html` |
| Update shared client-side protocol | `client-hub/app/static/vendor/js/HitloopDevice.js`, `HitloopDeviceManager.js` |
| Change device control UI | `client-hub/app/static/apps/device-control/*`, `device-dashboard/*` |
| Change simulator/swarm logic | `client-hub/app/static/apps/device-simulator/sketch.js` |
| Change MIDI mapper | `client-hub/app/static/apps/device-midi-mapper/mapping-engine.js` |
| Update WebSocket relay protocol | `socket-server/app/app.py` (`handle_websocket_connection`) |
| Add firmware process/commands | `grouploop-firmware/ble-scanner/include/processes/*`, `src/main.cpp` |
| Change frame payload/sensors | `grouploop-firmware/ble-scanner/include/processes/PublishProcess.h` |
| Update network/reconnect logic | `grouploop-firmware/ble-scanner/include/processes/WiFiProcess.h` |

---

## Development Commands

### Start all services
```bash
docker compose up --build
```

### Run a specific service
```bash
# Socket server
cd socket-server && docker compose up socket

# Client hub
cd client-hub && docker compose up client_hub

# Documentation
cd documentation && docker compose up docs
```

### Python services (direct)

**Socket server**:
```bash
cd socket-server/app
pip install -r requirements.txt
python app.py
```

**Client hub**:
```bash
cd client-hub/app
pip install -r requirements.txt
python app.py
```

### Firmware build
```bash
cd grouploop-firmware/ble-scanner
pio run --target upload
```

---

## Protocol Touchpoints (Critical: Update All When Changing)

### Sensor Frame Format Changes
Update all of:
- `grouploop-firmware/ble-scanner/include/processes/PublishProcess.h`
- `socket-server/app/app.py` (hex frame parsing)
- `client-hub/app/static/vendor/js/HitloopDevice.js`
- `client-hub/app/static/vendor/js/HitloopDeviceManager.js`
- `client-hub/app/static/apps/device-simulator/device.js`
- `client-hub/app/static/apps/device-emulator/client.js`

### Command Format Changes
Update all of:
- `client-hub/app/static/vendor/js/HitloopDevice.js` (`sendCommand*` methods)
- `socket-server/app/app.py` (`handle_command`, command registry)
- `grouploop-firmware/ble-scanner/include/processes/*` (command handlers)

---

## Firmware Process Architecture

### Adding a New Process
1. Create `include/processes/<Name>Process.h` and `src/<Name>Process.cpp`
2. Derive from `Process` class
3. Implement `setup()` and `update()`, guard with `isProcessRunning()` check
4. Register in `src/main.cpp`: `processManager.addProcess("name", new MyProcess())`

### Adding a New Command
1. Call `commandRegistry.registerCommand("name", handler)` in relevant process or `registerGlobalCommands()`
2. Handlers receive the parameters string (everything after `cmd:<id>:<command>:`)
3. Update local state for toggles so `status` command reflects reality

---

## Browser API Reference

### HitloopDevice
| Method | Description |
|--------|-------------|
| `parseHexData(hex)` | Parse 20-char frame, returns true/false |
| `getSensorData()` | Get `{id, ax, ay, az, dNW, dNE, dSE, tap, color, motor}` |
| `sendCommand(cmd, ...params)` | Send command, updates local state |
| `parseColor(name)` | Convert named/hex color to `[r,g,b]` |

### HitloopDeviceManager
| Method | Description |
|--------|-------------|
| `connect()` | Open WS, load commands.json, start prune timer |
| `disconnect()` | Close WS, clear prune timer |
| `parseAndUpdateDevice(hex)` | Parse frame, create/update device |
| `getDevice(id)` / `getAllDevices()` | Access devices |
| `pruneInactive()` | Remove inactive devices (default: 5s) |
| `sendCommandToDevice(id, cmd, ...params)` | Send to specific device |
| `sendCommandToAll(cmd, ...params)` | Broadcast to all |

---

## Source of Truth Priority

When information conflicts, trust in this order:
1. **Runtime code** (`docker-compose.yml`, Python apps, `src/main.cpp`)
2. **Documentation pages** (architecture/deployment/development/*.md)
3. **Legacy files** (READMEs may be stale; verify before editing)

---

## Known Legacy Files (Handle Carefully)

- `socket-server/README.md` - describes deprecated Flask-SocketIO pattern
- `documentation/docs/index.md` - contains mixed historical content
- `.github/workflows/deploy-socket-demo.yml` - references artifact path not in current compose
- `socket-server/app/test.py` and `grouploop-firmware/ble-scanner/test/` - legacy tests

---

## Environment Variables

| Variable | Default | Used By |
|----------|---------|---------|
| `WS_DEFAULT_URL` | `wss://ws.grouploop.feib.nl` | Client Hub, apps |
| `CDN_BASE_URL` | `https://cdn.hitloop.feib.nl` | Client Hub, apps |
| `DEFAULT_APP` | (empty) | Client Hub landing page |
| `WS_HOST` | `0.0.0.0` | Socket server |
| `WS_PORT` | `5000` | Socket server |
| `DOCS_URL` | `http://localhost:5006/` | Client Hub landing page |

---

## Important Notes

- Device pruning: `HitloopDeviceManager` removes inactive devices after 5s silence. Simulators must send frames at least every 5s.
- Command registry loads from CDN (`commands.json`), with fallback to hardcoded defaults on failure.
- Shared vendor libraries should be used for consistent parsing/modeling across all apps.
- Message schema is stable: IDs are hex strings, sensor values 0–255. Add new fields behind feature flags.
