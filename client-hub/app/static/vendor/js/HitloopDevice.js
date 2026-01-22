/**
 * HitloopDevice class represents a single hitloop device
 * It holds a reference to the websocket and contains methods to parse HEX data
 */
class HitloopDevice {
    constructor(id, color = [255, 255, 255], motorState = false) {
        this.id = id;
        this.color = color;
        this.motorState = motorState;
        this.ws = null;
        this.commandsConfig = null;

        // Parsed sensor values
        this.ax = 0;
        this.ay = 0;
        this.az = 0;
        this.dNW = 0; // North-West distance (top-left)
        this.dNE = 0; // North-East distance (top-right)
        this.dSW = 0; // South-West distance (bottom-left)
        this.dSE = 0; // South-East distance (bottom-right)
        this.tap = false; // Tap detection state
    }

    /**
     * Parse HEX string received from socket server
     * Format: idHex(4) + ax(2) + ay(2) + az(2) + dTL(2) + dTR(2) + dBR(2) + dBL(2) + tap(2)
     * @param {string} hexString - The HEX string to parse
     */
    parseHexData(hexString) {
        // Remove any whitespace and newlines, normalize case
        const raw = String(hexString || '').trim();
        // Expect at least 20 hex chars (id 4 + 8 bytes * 2)
        if (raw.length < 20) {
            return false;
        }
        // Consider only first 20 chars in case of trailing data/newline
        const cleanHex = raw.slice(0, 20);
        // Validate hex charset
        if (!/^[0-9a-fA-F]{20}$/.test(cleanHex)) {
            return false;
        }

        try {
            // Parse the HEX string
            const idHex = cleanHex.substring(0, 4);
            const axHex = cleanHex.substring(4, 6);
            const ayHex = cleanHex.substring(6, 8);
            const azHex = cleanHex.substring(8, 10);
            const dTLHex = cleanHex.substring(10, 12); // dNW (North-West)
            const dTRHex = cleanHex.substring(12, 14); // dNE (North-East)
            const dBRHex = cleanHex.substring(14, 16); // dSE (South-East)
            const dBLHex = cleanHex.substring(16, 18); // dSW (South-West)
            const tapHex = cleanHex.substring(18, 20); // Tap detection

            // Convert HEX to decimal values
            const ax = parseInt(axHex, 16);
            const ay = parseInt(ayHex, 16);
            const az = parseInt(azHex, 16);
            const dNW = parseInt(dTLHex, 16); // Top-left -> North-West
            const dNE = parseInt(dTRHex, 16); // Top-right -> North-East
            const dSE = parseInt(dBRHex, 16); // Bottom-right -> South-East
            const dSW = parseInt(dBLHex, 16); // Bottom-left -> South-West
            const tapValue = parseInt(tapHex, 16); // Tap detection value

            // Validate parsed numbers are finite
            if ([ax, ay, az, dNW, dNE, dSE, dSW, tapValue].some(n => !Number.isFinite(n))) {
                return false;
            }

            this.ax = ax;
            this.ay = ay;
            this.az = az;
            this.dNW = dNW;
            this.dNE = dNE;
            this.dSE = dSE;
            this.dSW = dSW;
            this.tap = tapValue === 255; // Convert to boolean: 255 = true, 0 = false
            return true;
        } catch (_e) {
            return false;
        }
    }

    /**
     * Set the WebSocket reference
     * @param {WebSocket} websocket - The WebSocket instance
     */
    setWebSocket(websocket) {
        this.ws = websocket;
    }

    /**
     * Get current sensor data as an object
     * @returns {Object} Object containing all sensor values
     */
    getSensorData() {
        return {
            id: this.id,
            ax: this.ax,
            ay: this.ay,
            az: this.az,
            dNW: this.dNW,
            dNE: this.dNE,
            dSW: this.dSW,
            dSE: this.dSE,
            tap: this.tap,
            color: this.color,
            motorState: this.motorState
        };
    }

    /**
     * Set the commands configuration from commands.json
     * @param {Object} commandsConfig - The commands configuration object
     */
    setCommandsConfig(commandsConfig) {
        this.commandsConfig = commandsConfig;
    }

    /**
     * Validate command parameters based on commands.json schema
     * @param {string} command - The command name
     * @param {Array} params - The command parameters
     * @returns {boolean} True if parameters are valid
     */
    validateCommand(command, params) {
        if (!this.commandsConfig || !this.commandsConfig.commands[command]) {
            console.warn(`Unknown command: ${command}`);
            return false;
        }

        const commandConfig = this.commandsConfig.commands[command];
        const expectedParamCount = commandConfig.parameters.length;
        const actualParamCount = params.length;

        if (actualParamCount !== expectedParamCount) {
            console.warn(`Command '${command}' expects ${expectedParamCount} parameters, got ${actualParamCount}`);
            return false;
        }

        // Additional validation for specific commands
        switch (command) {
            case 'brightness':
                const brightness = parseInt(params[0]);
                if (isNaN(brightness) || brightness < 0 || brightness > 255) {
                    console.warn(`Invalid brightness value: ${params[0]}. Must be between 0 and 255.`);
                    return false;
                }
                break;
            case 'spring_param':
                if (!/^[0-9a-fA-F]{6}$/.test(params[0])) {
                    console.warn(`Invalid spring parameters: ${params[0]}. Must be 6 hex characters.`);
                    return false;
                }
                break;
            case 'vibrate':
                const duration = parseInt(params[0]);
                if (isNaN(duration) || duration < 0) {
                    console.warn(`Invalid vibration duration: ${params[0]}. Must be positive.`);
                    return false;
                }
                break;
        }

        return true;
    }

    /**
     * Send a command to this device using unified command system
     * @param {string} command - The command name
     * @param {...any} params - The command parameters
     * @returns {boolean} True if command was sent successfully
     */
    sendCommand(command, ...params) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`Cannot send command to device ${this.id}: WebSocket not connected`);
            return false;
        }

        // Validate command and parameters
        if (!this.validateCommand(command, params)) {
            return false;
        }

        try {
            // Format: cmd:command:param1:param2:...
            const commandString = `cmd:${this.id}:${command}:${params.join(':')}`;
            this.ws.send(commandString);
            console.log(`Sent command to device ${this.id}: ${commandString}`);
            
            // Update local state for certain commands
            this.updateLocalState(command, params);
            
            return true;
        } catch (error) {
            console.error(`Failed to send command to device ${this.id}:`, error);
            return false;
        }
    }

    /**
     * Update local device state based on sent commands
     * @param {string} command - The command name
     * @param {Array} params - The command parameters
     */
    updateLocalState(command, params) {
        switch (command) {
            case 'led':
                this.color = this.parseColor(params[0]);
                break;
            case 'vibrate':
                this.motorState = true;
                const duration = parseInt(params[0]);
                setTimeout(() => {
                    this.motorState = false;
                }, duration);
                break;
        }
    }

    /**
     * Convenience method to send command with single parameter
     * @param {string} command - The command name
     * @param {string} param - The single parameter
     * @returns {boolean} True if command was sent successfully
     */
    sendCommandWithParam(command, param) {
        return this.sendCommand(command, param);
    }

    /**
     * Convenience method to send command without parameters
     * @param {string} command - The command name
     * @returns {boolean} True if command was sent successfully
     */
    sendCommandNoParams(command) {
        return this.sendCommand(command);
    }

    /**
     * Parse color string to RGB array
     * @param {string} color - Color string (hex or named)
     * @returns {Array} RGB array [r, g, b]
     */
    parseColor(color) {
        // Handle named colors
        const namedColors = {
            'red': [255, 0, 0],
            'green': [0, 255, 0],
            'blue': [0, 0, 255],
            'white': [255, 255, 255],
            'yellow': [255, 255, 0],
            'cyan': [0, 255, 255],
            'magenta': [255, 0, 255],
            'orange': [255, 128, 0]
        };

        if (namedColors[color.toLowerCase()]) {
            return namedColors[color.toLowerCase()];
        }

        // Handle hex colors
        if (color.startsWith('#')) {
            color = color.substring(1);
        }

        if (/^[0-9a-fA-F]{6}$/.test(color)) {
            return [
                parseInt(color.substring(0, 2), 16),
                parseInt(color.substring(2, 4), 16),
                parseInt(color.substring(4, 6), 16)
            ];
        }

        // Default to white if invalid
        return [255, 255, 255];
    }
}


