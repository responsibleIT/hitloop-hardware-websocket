#ifndef WEBSOCKET_MANAGER_H
#define WEBSOCKET_MANAGER_H

#include "Arduino.h"
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <functional>

// Forward declarations
class WebSocketManager;

// Message callback type
typedef std::function<void(const String&)> MessageCallback;

class WebSocketManager {
private:
    WebSocketsClient webSocket;
    bool connected = false;
    String wsHost;
    int wsPort = 80;
    String wsPath = "/";
    String deviceIdHex;
    String state;
    
    // Message handling
    MessageCallback messageCallback;
    String lastReceivedMessage;
    bool hasNewMessage = false;
    
    // Connection management
    bool isInitialized = false;
    unsigned long lastReconnectAttempt = 0;
    const unsigned long RECONNECT_INTERVAL = 5000; // 5 seconds

public:
    WebSocketManager() 
        : connected(false)
        , deviceIdHex("0000")
        , state("DISCONNECTED")
        , hasNewMessage(false)
        , isInitialized(false)
        , lastReconnectAttempt(0)
    {}

    // Initialize the WebSocket connection
    void initialize(const String& wsUrl) {
        if (isInitialized) return;
        
        // Build device ID from MAC address
        uint8_t mac[6];
        WiFi.macAddress(mac);
        char idBuf[5];
        snprintf(idBuf, sizeof(idBuf), "%02X%02X", mac[4], mac[5]);
        deviceIdHex = String(idBuf);
        
        parseAndConnect(wsUrl);
        isInitialized = true;
    }

    // Update the WebSocket connection (call this in main loop)
    void update() {
        if (!isInitialized) return;
        
        webSocket.loop();
        state = connected ? String("CONNECTED") : String("CONNECTING");
        
        // Handle reconnection if needed
        if (!connected && (millis() - lastReconnectAttempt) > RECONNECT_INTERVAL) {
            lastReconnectAttempt = millis();
            reconnect();
        }
    }

    // Send a message through the WebSocket
    bool sendMessage(const String& message) {
        if (!connected) return false;
        
        String msg = message; // Create a non-const copy
        webSocket.sendTXT(msg);
        return true;
    }

    // Check if there's a new message available
    bool hasMessage() const {
        return hasNewMessage;
    }

    // Get the last received message and mark it as processed
    String getMessage() {
        hasNewMessage = false;
        return lastReceivedMessage;
    }

    // Set callback for incoming messages
    void setMessageCallback(MessageCallback callback) {
        messageCallback = callback;
    }

    // Get connection state
    bool isConnected() const {
        return connected;
    }

    // Get device ID
    String getDeviceId() const {
        return deviceIdHex;
    }

    // Get connection state string
    String getState() const {
        return state;
    }

    // Force reconnection
    void reconnect() {
        if (wsHost.length() > 0) {
            webSocket.begin(wsHost.c_str(), wsPort, wsPath.c_str());
        }
    }

private:
    void parseAndConnect(const String& wsUrl) {
        if (!wsUrl.startsWith("ws://")) return;
        
        String rest = wsUrl.substring(5);
        int slash = rest.indexOf('/');
        String hostPort = slash >= 0 ? rest.substring(0, slash) : rest;
        wsPath = slash >= 0 ? rest.substring(slash) : "/";
        
        int colon = hostPort.indexOf(':');
        if (colon >= 0) {
            wsHost = hostPort.substring(0, colon);
            wsPort = hostPort.substring(colon + 1).toInt();
        } else {
            wsHost = hostPort;
            wsPort = 80;
        }
        
        // Set up event handlers
        webSocket.onEvent([this](WStype_t type, uint8_t * payload, size_t length) {
            if (type == WStype_CONNECTED) {
                connected = true;
                Serial.println("WebSocketManager: Connected");
            }
            else if (type == WStype_DISCONNECTED) {
                connected = false;
                Serial.println("WebSocketManager: Disconnected");
            }
            else if (type == WStype_TEXT) {
                // Handle incoming text message
                String message = String((char*)payload);
                Serial.print("WebSocketManager: Received: ");
                Serial.println(message);
                
                // Store the message
                lastReceivedMessage = message;
                hasNewMessage = true;
                
                // Call callback if set
                if (messageCallback) {
                    messageCallback(message);
                }
            }
            else if (type == WStype_BIN) {
                // Handle incoming binary message
                Serial.print("WebSocketManager: Received binary message of length: ");
                Serial.println(length);
                
                // Convert binary to hex string
                String hexMessage = "";
                for (size_t i = 0; i < length; i++) {
                    char hex[3];
                    snprintf(hex, sizeof(hex), "%02x", payload[i]);
                    hexMessage += hex;
                }
                
                lastReceivedMessage = hexMessage;
                hasNewMessage = true;
                
                // Call callback if set
                if (messageCallback) {
                    messageCallback(hexMessage);
                }
            }
        });
        
        webSocket.setReconnectInterval(5000);
        webSocket.begin(wsHost.c_str(), wsPort, wsPath.c_str());
    }
};

// Global WebSocket manager instance
extern WebSocketManager webSocketManager;

#endif // WEBSOCKET_MANAGER_H
