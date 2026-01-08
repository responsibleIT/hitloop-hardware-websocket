# Socket Demo

This section describes the architecture and extension points of the socket-demo.

## Sensor data protocol

Each sample is a single line, ASCII hex, 20 hex chars total, then a newline:

```
id(4) aX(2) aY(2) aZ(2) rssiNW(2) rssiNE(2) rssiSW(2) rssiSE(2) color(2) motor(2) reserved(2)\n
```

- `id`: 2-byte device ID (last two bytes of MAC), big-endian, printed as 4 hex chars
- `aX aY aZ`: accelerometer bytes (encoding 0..255; 128 ≈ 0 g)
- `rssi*`: beacon RSSI bytes (0..255). If unknown, devices may send FF.
- `color`: Current LED color state (2 hex chars)
- `motor`: Motor/vibration state (2 hex chars)
- `reserved`: Reserved for future use (2 hex chars)

Example: `0D4A80A27FFF00010203FF00AA\n`

## Command protocol quick reference

The socket-demo uses the WebSocket command protocol:

**Subscribe to data stream**:
- `s` - Subscribe to receive device sensor data broadcasts
- Response: `stream:on`

**Send commands to devices**:
- `cmd:<target>:<command>:<parameters>` - Send command to device(s)
  - `target`: Device ID (4 hex chars) or `all` for broadcast
  - `command`: Command name (e.g., `led`, `vibrate`, `pattern`)
  - `parameters`: Command-specific parameters

**Examples**:
- `cmd:0D4A:led:ff0000` - Set LED to red on device 0D4A
- `cmd:all:vibrate:500` - Vibrate all devices for 500ms
- `cmd:0D4A:pattern:breathing` - Set breathing pattern on device 0D4A

**Available commands** (loaded from CDN command registry):
- `led:<color>` - Set LED color (hex format like `ff0000`, or named colors)
- `vibrate:<duration>` - Vibrate for specified milliseconds
- `pattern:<name>` - Set LED pattern (`breathing`, `heartbeat`, `cycle`, `spring`, `off`)
- `brightness:<level>` - Set brightness (0-255)
- `spring_param:<hex>` - Set spring physics parameters (6 hex chars)
- `status` - Get device status information

- Scenes: `Scene` base class and concrete scenes under `socket-demo/scenes/`
- Manager: `SceneManager` orchestrates which scene is active
- Devices: `HitloopDevice` and `HitloopDeviceManager` (served via CDN) handle device data over WebSocket
- How-tos: read device state, add a new Scene

## Architecture

- WebSocket messages are handled by `HitloopDeviceManager`, which maintains a map of `HitloopDevice` objects keyed by device id.
- The p5 draw loop delegates to a `SceneManager` that calls `draw()` on the active `Scene`.
- Scenes are modular files under `socket-demo/scenes/` and extend the `Scene` base class.
- Navigation between scenes is provided by `SceneManager.nextScene()` and `SceneManager.previousScene()`; the demo maps these to the right/left arrow keys.

### File layout

- `socket-demo/index.html`: includes p5 libraries, shared device classes from the CDN, local `Scene.js`, `SceneManager.js`, your scene files, and `sketch.js`.
- `socket-demo/sketch.js`: wires up the `HitloopDeviceManager` (WebSocket URL), registers scenes with `SceneManager`, connects, and starts the default scene.
- `socket-demo/Scene.js`: minimal base class providing `setup()` and `draw()` plus access to the `deviceManager`.
- `socket-demo/SceneManager.js`: manages scene registration, switching, and ordered traversal.
- `socket-demo/scenes/*.js`: concrete scenes such as `DeviceListScene`, `FirstDeviceDetailsScene`, `GridHeatmapScene`.

### Shared files via CDN

The demo relies on shared libraries delivered by a CDN:

- `p5.min.js`, `p5.sound.min.js`
- `HitloopDevice.js`, `HitloopDeviceManager.js`

They are referenced in `index.html` like:

```html
<script src="http://cdn.hitloop.feib.nl/js/p5.min.js"></script>
<script src="http://cdn.hitloop.feib.nl/js/p5.sound.min.js"></script>
<script src="http://cdn.hitloop.feib.nl/js/HitloopDevice.js"></script>
<script src="http://cdn.hitloop.feib.nl/js/HitloopDeviceManager.js"></script>
```

These CDN files are served by the `cdn-server` service in this repository and kept consistent across demos.

## Deployment

### GitHub Pages Deployment

The socket-demo can be deployed to GitHub Pages using the included GitHub Actions workflow.

**Automatic Deployment**:
- The workflow (`.github/workflows/deploy-socket-demo.yml`) automatically deploys the `socket-demo` folder to GitHub Pages on pushes to `main` or `master` branches
- Manual deployment can be triggered via the Actions tab in GitHub

**Setup Steps**:
1. Ensure the workflow file exists at `.github/workflows/deploy-socket-demo.yml`
2. Go to repository Settings → Pages
3. Under "Source", select "GitHub Actions" (not "Deploy from a branch")
4. Push to `main` or `master` branch, or manually trigger the workflow

**Access**:
After deployment, the demo will be available at:
- `https://[username].github.io/[repository-name]/`

**Note**: The demo requires access to the WebSocket server and CDN. Update the URLs in `index.html` if deploying to a different environment, or ensure the production WebSocket server and CDN are accessible from the deployed location.
