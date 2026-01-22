/**
 * HitloopDeviceManager class represents a collection of hitloop devices
 * It manages multiple devices and handles WebSocket communication
 */
class HitloopDeviceManager {
    constructor(websocketUrl) {
        this.ws = null;
        this.websocketUrl = websocketUrl;
        this.devices = new Map(); // Key-value pairs: deviceId -> HitloopDevice
        this.lastSeen = new Map(); // Key-value pairs: deviceId -> timestamp (ms)
        this.pruneInterval = null;
        this.inactiveTimeoutMs = 5000;
        this.commandsConfig = null;
    }

    /**
     * Load commands configuration from commands.json
     * @returns {Promise<Object>} The commands configuration
     */
    async loadCommandsConfig() {
        try {
            const response = await fetch('https://cdn.hitloop.feib.nl/static/commands.json');
            if (!response.ok) {
                throw new Error(`Failed to load commands.json: ${response.status}`);
            }
            this.commandsConfig = await response.json();
            
            // Set commands config for all existing devices
            for (const device of this.devices.values()) {
                device.setCommandsConfig(this.commandsConfig);
            }
            
            console.log('Commands configuration loaded successfully');
            return this.commandsConfig;
        } catch (error) {
            console.error('Failed to load commands configuration:', error);
            return null;
        }
    }

    /**
     * Set commands configuration manually
     * @param {Object} commandsConfig - The commands configuration object
     */
    setCommandsConfig(commandsConfig) {
        this.commandsConfig = commandsConfig;
        
        // Set commands config for all existing devices
        for (const device of this.devices.values()) {
            device.setCommandsConfig(this.commandsConfig);
        }
    }

    /**
     * Connect to the WebSocket server
     */
    async connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        // Load commands configuration if not already loaded
        if (!this.commandsConfig) {
            await this.loadCommandsConfig();
        }

        this.ws = new WebSocket(this.websocketUrl);

        this.ws.addEventListener('open', (event) => {
            // Send 's' to start receiving data
            this.ws.send('s');
        });

        this.ws.addEventListener('message', (event) => {
            this.handleMessage(event.data);            
        });

        this.ws.addEventListener('close', (event) => {
        });

        this.ws.addEventListener('error', (error) => {
        });

        // Start periodic pruning of inactive devices
        if (!this.pruneInterval) {
            this.pruneInterval = setInterval(() => {
                this.pruneInactive();
            }, 1000);
        }
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.pruneInterval) {
            clearInterval(this.pruneInterval);
            this.pruneInterval = null;
        }
    }

    /**
     * Handle incoming WebSocket messages
     * @param {string} data - The received data
     */
    handleMessage(data) {
        // Support batched frames separated by newlines
        const text = String(data || '');
        const frames = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        for (const frame of frames) {
            // Parse the HEX data and update the corresponding device
            this.parseAndUpdateDevice(frame);
        }
    }

    /**
     * Parse HEX data and update the corresponding device
     * @param {string} hexString - The HEX string to parse
     * @returns {boolean} True if parsing was successful
     */
    parseAndUpdateDevice(hexString) {
        const raw = String(hexString || '').trim();
        
        // Require at least 20 hex chars and valid charset before doing anything (including tap byte)
        if (raw.length < 20) {
            return false;
        }
        const frame = raw.slice(0, 20);
        if (!/^[0-9a-fA-F]{20}$/.test(frame)) {
            return false;
        }

        // Extract device ID from first 4 hex characters
        const deviceIdHex = frame.substring(0, 4).toLowerCase();

        // If device exists, update it; otherwise validate fully before creating
        let device = this.devices.get(deviceIdHex);
        if (device) {
            const ok = device.parseHexData(frame);
            if (ok) {
                this.lastSeen.set(deviceIdHex, Date.now());
            }
            return ok;
        }

        // Validate by attempting to parse with a temporary instance
        const temp = new HitloopDevice(deviceIdHex);
        const ok = temp.parseHexData(frame);
        if (!ok) {
            return false;
        }

        // Only now add the device
        device = new HitloopDevice(deviceIdHex);
        device.setWebSocket(this.ws);
        
        // Set commands config if available
        if (this.commandsConfig) {
            device.setCommandsConfig(this.commandsConfig);
        }
        
        this.devices.set(deviceIdHex, device);
        this.lastSeen.set(deviceIdHex, Date.now());
        // Update with the validated frame
        return device.parseHexData(frame);
    }

    /**
     * Add a device to the manager
     * @param {HitloopDevice} device - The device to add
     */
    addDevice(device) {
        const key = String(device.id).slice(0, 4).toLowerCase();
        device.setWebSocket(this.ws);
        
        // Set commands config if available
        if (this.commandsConfig) {
            device.setCommandsConfig(this.commandsConfig);
        }
        
        // Ensure id key is a 4-char hex string
        this.devices.set(key, device);
        this.lastSeen.set(key, Date.now());
    }

    /**
     * Remove a device from the manager
     * @param {number} deviceId - The ID of the device to remove
     */
    removeDevice(deviceId) {
        const key = String(deviceId).slice(0, 4).toLowerCase();
        this.devices.delete(key);
        this.lastSeen.delete(key);
    }

    /**
     * Get a device by ID
     * @param {number} deviceId - The device ID
     * @returns {HitloopDevice|null} The device or null if not found
     */
    getDevice(deviceId) {
        const key = String(deviceId).slice(0, 4).toLowerCase();
        return this.devices.get(key) || null;
    }

    /**
     * Get all devices
     * @returns {Map} Map of all devices
     */
    getAllDevices() {
        return this.devices;
    }

    /**
     * Get the number of devices
     * @returns {number} Number of devices
     */
    getDeviceCount() {
        return this.devices.size;
    }

    /**
     * Remove devices that have not updated within the timeout window
     */
    pruneInactive() {
        const now = Date.now();
        const devicesToRemove = [];
        
        for (const [id, ts] of this.lastSeen.entries()) {
            if (now - ts > this.inactiveTimeoutMs) {
                devicesToRemove.push(id);
            }
        }
        
        if (devicesToRemove.length > 0) {
            for (const id of devicesToRemove) {
                this.devices.delete(id);
                this.lastSeen.delete(id);
            }
        }
    }

    /**
     * Send a command to a specific device using unified command system
     * @param {string} deviceId - The device ID
     * @param {string} command - The command name
     * @param {...any} params - The command parameters
     * @returns {boolean} True if command was sent successfully
     */
    sendCommandToDevice(deviceId, command, ...params) {
        const device = this.getDevice(deviceId);
        if (!device) {
            console.warn(`Device ${deviceId} not found`);
            return false;
        }
        return device.sendCommand(command, ...params);
    }

    /**
     * Send a command to all devices using unified command system
     * @param {string} command - The command name
     * @param {...any} params - The command parameters
     * @returns {number} Number of devices the command was sent to successfully
     */
    sendCommandToAll(command, ...params) {
        let successCount = 0;
        for (const [deviceId, device] of this.devices) {
            if (device.sendCommand(command, ...params)) {
                successCount++;
            }
        }
        console.log(`Sent command '${command}' to ${successCount}/${this.devices.size} devices`);
        return successCount;
    }

    /**
     * Get available commands from the configuration
     * @returns {Array} Array of available command names
     */
    getAvailableCommands() {
        if (!this.commandsConfig) {
            return [];
        }
        return Object.keys(this.commandsConfig.commands);
    }

    /**
     * Get command information from the configuration
     * @param {string} command - The command name
     * @returns {Object|null} Command configuration or null if not found
     */
    getCommandInfo(command) {
        if (!this.commandsConfig || !this.commandsConfig.commands[command]) {
            return null;
        }
        return this.commandsConfig.commands[command];
    }

    /**
     * Validate if a command exists in the configuration
     * @param {string} command - The command name
     * @returns {boolean} True if command exists
     */
    isValidCommand(command) {
        return this.commandsConfig && this.commandsConfig.commands[command] !== undefined;
    }
}


