#ifndef WIFI_PROCESS_H
#define WIFI_PROCESS_H

#include "Process.h"
#include "Timer.h"
#include "Configuration.h"
#include <WiFiMulti.h>
#include <WiFi.h>

class WiFiProcess : public Process {
public:
    WiFiProcess() 
        : Process(),
          connectionCheckTimer(5000), // Check connection every 5 seconds
          reconnectAttemptTimer(10000), // Wait 10 seconds between reconnect attempts
          lastConnectionCheck(0),
          isConnected(false),
          reconnectAttempts(0),
          maxReconnectAttempts(5)
    {
    }

    void setup() override {
        // Initialize WiFi in station mode
        WiFi.mode(WIFI_STA);
        
        // Add the configured WiFi network to WiFiMulti
        String ssid = configuration.getWifiSSID();
        String password = configuration.getWifiPassword();
        
        if (ssid.length() > 0) {
            wifiMulti.addAP(ssid.c_str(), password.c_str());
            Serial.print("Added WiFi network: ");
            Serial.println(ssid);
        } else {
            Serial.println("No WiFi SSID configured");
        }
        
        // Start initial connection attempt
        attemptConnection();
    }

    void update() override {
        uint32_t currentTime = millis();
        
        // Check connection status periodically
        if (connectionCheckTimer.checkAndReset()) {
            checkConnection();
        }
        
        // Attempt reconnection if needed
        if (!isConnected && reconnectAttemptTimer.checkAndReset()) {
            if (reconnectAttempts < maxReconnectAttempts) {
                attemptConnection();
            } else {
                Serial.println("Max reconnection attempts reached. Stopping WiFi attempts.");
            }
        }
    }

    String getState() override {
        if (isConnected) {
            return String("CONNECTED (") + WiFi.SSID() + ")";
        } else if (reconnectAttempts >= maxReconnectAttempts) {
            return String("FAILED");
        } else {
            return String("CONNECTING (") + String(reconnectAttempts) + "/" + String(maxReconnectAttempts) + ")";
        }
    }
    
    // Public methods for other processes to check WiFi status
    bool isWiFiConnected() const {
        return isConnected;
    }
    
    String getIPAddress() const {
        if (isConnected) {
            return WiFi.localIP().toString();
        }
        return String("");
    }
    
    String getSSID() const {
        if (isConnected) {
            return WiFi.SSID();
        }
        return String("");
    }
    
    int getRSSI() const {
        if (isConnected) {
            return WiFi.RSSI();
        }
        return 0;
    }
    
    // Method to force reconnection (useful for configuration changes)
    void forceReconnect() {
        Serial.println("Forcing WiFi reconnection...");
        isConnected = false;
        reconnectAttempts = 0;
        WiFi.disconnect();
        reconnectAttemptTimer.reset();
    }
    
    // Method to update WiFi credentials and reconnect
    void updateCredentials(const String& ssid, const String& password) {
        Serial.println("Updating WiFi credentials...");
        
        // Clear existing networks by reinitializing WiFiMulti
        wifiMulti = WiFiMulti();
        
        // Add new network
        if (ssid.length() > 0) {
            wifiMulti.addAP(ssid.c_str(), password.c_str());
            Serial.print("Updated WiFi network: ");
            Serial.println(ssid);
        }
        
        // Force reconnection with new credentials
        forceReconnect();
    }

private:
    void checkConnection() {
        bool wasConnected = isConnected;
        isConnected = (WiFi.status() == WL_CONNECTED);
        
        if (isConnected && !wasConnected) {
            // Just connected
            Serial.println("WiFi connected successfully!");
            Serial.print("IP address: ");
            Serial.println(WiFi.localIP());
            Serial.print("SSID: ");
            Serial.println(WiFi.SSID());
            Serial.print("Signal strength: ");
            Serial.print(WiFi.RSSI());
            Serial.println(" dBm");
            
            // Reset reconnect attempts counter
            reconnectAttempts = 0;
        } else if (!isConnected && wasConnected) {
            // Just disconnected
            Serial.println("WiFi connection lost!");
            reconnectAttemptTimer.reset();
        }
    }
    
    void attemptConnection() {
        Serial.print("Attempting WiFi connection (attempt ");
        Serial.print(reconnectAttempts + 1);
        Serial.print("/");
        Serial.print(maxReconnectAttempts);
        Serial.println(")...");
        
        // Try to connect using WiFiMulti
        uint8_t result = wifiMulti.run(10000); // 10 second timeout
        
        if (result == WL_CONNECTED) {
            isConnected = true;
            reconnectAttempts = 0;
            Serial.println("WiFi connected successfully!");
            Serial.print("IP address: ");
            Serial.println(WiFi.localIP());
        } else {
            isConnected = false;
            reconnectAttempts++;
            Serial.print("WiFi connection failed. Status: ");
            Serial.println(result);
            
            if (reconnectAttempts < maxReconnectAttempts) {
                Serial.print("Retrying in 10 seconds... (");
                Serial.print(reconnectAttempts);
                Serial.print("/");
                Serial.print(maxReconnectAttempts);
                Serial.println(")");
            }
        }
    }
    
    Timer connectionCheckTimer;
    Timer reconnectAttemptTimer;
    WiFiMulti wifiMulti;
    uint32_t lastConnectionCheck;
    bool isConnected;
    int reconnectAttempts;
    int maxReconnectAttempts;
};

#endif // WIFI_PROCESS_H
