import asyncio
import json
import os
from typing import Optional, Set, Dict
import aiohttp

import websockets
from websockets.server import WebSocketServerProtocol

subscribers: Set[WebSocketServerProtocol] = set()
client_labels: Dict[WebSocketServerProtocol, str] = {}
devices: Dict[str, WebSocketServerProtocol] = {}  # device_id -> websocket
command_registry: Dict = {}  # Command definitions from CDN

def default_label(ws: WebSocketServerProtocol) -> str:
    try:
        host, port = ws.remote_address[:2]
        return f"{host}:{port}"
    except Exception:
        return "unknown"

def _default_commands():
    return {
        "commands": {
            "led":          {"parameters": ["color"],    "description": "Set LED color (hex RGB)"},
            "pattern":      {"parameters": ["id"],       "description": "Set LED pattern"},
            "brightness":   {"parameters": ["value"],    "description": "Set LED brightness (0-255)"},
            "spring_param": {"parameters": ["params"],   "description": "Set spring parameters (6 hex chars)"},
            "vibrate":      {"parameters": ["duration"], "description": "Vibrate device (ms)"},
            "reset":        {"parameters": [],           "description": "Reset device"},
            "status":       {"parameters": [],           "description": "Get device status"},
            "ota":          {"parameters": ["url"],      "description": "OTA firmware update from URL"},
            "led_set":      {"parameters": ["index", "color"], "description": "Set individual LED on (index 0-5, color hex)"},
            "led_off":      {"parameters": ["index"],    "description": "Turn off individual LED (index 0-5)"},
            "led_all_off":  {"parameters": [],           "description": "Turn all 6 LEDs off"},
            "led_get_state":{"parameters": [],           "description": "Get state of all LEDs (debug)"},
        }
    }

async def load_commands():
    """Load command definitions from client_hub, falling back to built-in defaults"""
    global command_registry
    client_hub_url = os.environ.get("CLIENT_HUB_URL", "http://client_hub:5000")
    commands_url = f"{client_hub_url}/static/commands.json"

    command_registry = _default_commands()
    for attempt in range(1, 6):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(commands_url) as response:
                    if response.status == 200:
                        data = await response.json()
                        command_registry["commands"].update(data.get("commands", {}))
                        print(f"[COMMANDS] Loaded {len(command_registry['commands'])} commands from client_hub", flush=True)
                        return
                    else:
                        print(f"[COMMANDS] client_hub returned HTTP {response.status}, using defaults", flush=True)
                        return
        except Exception as e:
            print(f"[COMMANDS] Attempt {attempt}/5: could not reach client_hub ({e}), retrying in 3s...", flush=True)
            await asyncio.sleep(3)
    print("[COMMANDS] client_hub unavailable after 5 attempts, using defaults", flush=True)

async def broadcast_to_subscribers(message: str) -> None:
    if not subscribers:
        return
    stale: Set[WebSocketServerProtocol] = set()
    send_coroutines = []
    for ws in subscribers:
        send_coroutines.append(ws.send(message))
    results = await asyncio.gather(*send_coroutines, return_exceptions=True)
    for ws, result in zip(list(subscribers), results):
        if isinstance(result, Exception):
            stale.add(ws)
    if stale:
        for ws in stale:
            subscribers.discard(ws)

async def send_to_device(device_id: str, message: str, parameters: str = "") -> bool:
    """Send a message to a specific device by device ID"""
    if device_id in devices:
        try:
            await devices[device_id].send(message + ":" + parameters)
            print(f"[SEND] {device_id}: {message}", flush=True)
            return True
        except Exception as e:
            print(f"[ERROR] Failed to send to {device_id}: {e}", flush=True)
            # Remove stale device connection
            devices.pop(device_id, None)
            return False
    else:
        print(f"[ERROR] Device {device_id} not found", flush=True)
        return False

async def send_to_all_devices(message: str, parameters: str = "") -> int:
    """Send a message to all connected devices"""
    if not devices:
        return 0
    
    sent_count = 0
    stale_devices = []
    
    for device_id, ws in devices.items():
        try:
            await ws.send(message + ":" + parameters)
            sent_count += 1
            print(f"[BROADCAST] {device_id}: {message}", flush=True)
        except Exception as e:
            print(f"[ERROR] Failed to send to {device_id}: {e}", flush=True)
            stale_devices.append(device_id)
    
    # Remove stale device connections
    for device_id in stale_devices:
        devices.pop(device_id, None)
    
    return sent_count

async def handle_command(target: str, command: str, parameters: str = "") -> tuple[bool, str]:
    """Handle a command using the command registry"""
    commands = command_registry.get("commands", {})
    
    if command not in commands:
        return False, f"Unknown command: {command}"
    
    cmd_def = commands[command]
    expected_params = cmd_def.get("parameters", [])
    
    # Validate parameters
    if len(expected_params) > 0 and not parameters:
        return False, f"Command {command} requires parameters: {expected_params}"
    
    # Send the command
    if target == "all":
        sent_count = await send_to_all_devices(command, parameters)
        return True, f"sent_to_{sent_count}_devices"
    else:
        success = await send_to_device(target, command, parameters)
        return True if success else False, "success" if success else "failed"

async def handle_websocket_connection(websocket: WebSocketServerProtocol) -> None:
    try:
        # Send a greeting similar to previous behavior
        await websocket.send("Connected to GroupLoop WebSocket server")
        # Assign default label based on remote address
        client_labels[websocket] = default_label(websocket)
        print(f"[CONNECT] {client_labels[websocket]}", flush=True)

        async for message in websocket:
            # Basic protocol: respond to "ping" and echo everything else
            if message == "ping":
                await websocket.send("pong")
            elif isinstance(message, str) and message.startswith("id:"):
                label = message[3:].strip()
                if label:
                    client_labels[websocket] = label
                    await websocket.send("id:ok")
                else:
                    await websocket.send("id:error")
            elif message == "s":
                subscribers.add(websocket)
                await websocket.send("stream:on")
            elif isinstance(message, str) and message.startswith("cmd:"):
                # Handle command messages: cmd:device_id:command:parameters
                # e.g., "cmd:1234:led:ff0000" or "cmd:all:vibrate:1000"
                try:
                    parts = message[4:].split(":", 2)  # Remove "cmd:" and split
                    if len(parts) >= 2:
                        target = parts[0]  # device_id or "all"
                        command = parts[1]  # the actual command
                        parameters = parts[2] if len(parts) > 2 else ""
                        
                        # Use the command registry to handle the command
                        success, result = await handle_command(target, command, parameters)
                        await websocket.send(f"cmd:result:{result}")
                    else:
                        await websocket.send("cmd:error:invalid_format")
                except Exception as e:
                    await websocket.send(f"cmd:error:{str(e)}")
            else:
                # Handle device registration and hex frames
                try:
                    text = str(message).strip()
                    if text:
                        parts = [p for p in text.splitlines() if p]
                        for p in parts:
                            hp = p.strip()
                            if len(hp) == 20 and all(c in '0123456789abcdefABCDEF' for c in hp):
                                # Extract device ID from first 4 characters
                                device_id = hp[:4].lower()
                                # Register this websocket as a device
                                devices[device_id] = websocket
                                # Broadcast to subscribers
                                await broadcast_to_subscribers(hp.lower() + "\n")
                except Exception:
                    pass
    except websockets.ConnectionClosedOK:
        pass
    except websockets.ConnectionClosedError:
        pass
    finally:
        subscribers.discard(websocket)
        label = client_labels.pop(websocket, default_label(websocket))
        
        # Remove device from registry if it was registered
        devices_to_remove = [device_id for device_id, ws in devices.items() if ws == websocket]
        for device_id in devices_to_remove:
            devices.pop(device_id, None)
            print(f"[DEVICE_DISCONNECT] {device_id}", flush=True)
        
        print(f"[DISCONNECT] {label}", flush=True)


async def start_websocket_server(host: str, port: int) -> None:
    # Load commands from CDN on startup
    await load_commands()
    
    async with websockets.serve(handle_websocket_connection, host, port, ping_interval=20, ping_timeout=20):
        await asyncio.Future()  # run forever


def main() -> None:
    ws_host = os.environ.get("WS_HOST", "0.0.0.0")
    ws_port = int(os.environ.get("WS_PORT", "5000"))

    # Run WebSocket server on the main thread's event loop
    asyncio.run(start_websocket_server(ws_host, ws_port))


if __name__ == "__main__":
    main()