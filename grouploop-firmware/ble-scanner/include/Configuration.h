#ifndef CONFIGURATION_H
#define CONFIGURATION_H

#include "Arduino.h"
#include <ArduinoJson.h>
#include <Preferences.h>

class Configuration {
private:    
    // Device-specific configuration variables
    String wifiSSID;
    String wifiPassword;
    String socketServerURL;
    int LEDPin;
    int motorPin;
    String deviceNamePrefix;
    
    // Beacon identifiers for the four cardinal directions
    String beaconNE;
    String beaconNW;
    String beaconSE;
    String beaconSW;
    
    // Preferences object for NVS storage
    Preferences preferences;
    
    // Default values
    static const String DEFAULT_WIFI_SSID;
    static const String DEFAULT_WIFI_PASSWORD;
    static const String DEFAULT_SOCKET_SERVER_URL;
    static const int DEFAULT_LED_PIN;
    static const int DEFAULT_MOTOR_PIN;
    static const String DEFAULT_DEVICE_NAME_PREFIX;
    static const String DEFAULT_BEACON_NE;
    static const String DEFAULT_BEACON_NW;
    static const String DEFAULT_BEACON_SE;
    static const String DEFAULT_BEACON_SW;
    
    // NVS key names
    static const char* NVS_NAMESPACE;
    static const char* KEY_WIFI_SSID;
    static const char* KEY_WIFI_PASSWORD;
    static const char* KEY_SOCKET_SERVER_URL;
    static const char* KEY_LED_PIN;
    static const char* KEY_MOTOR_PIN;
    static const char* KEY_DEVICE_NAME_PREFIX;
    static const char* KEY_BEACON_NE;
    static const char* KEY_BEACON_NW;
    static const char* KEY_BEACON_SE;
    static const char* KEY_BEACON_SW;

public:

    // Private constructor for singleton pattern
    Configuration() {}
        
    // Initialize configuration from NVS or defaults
    void initialize() {
        // Open preferences namespace
        if (!preferences.begin(NVS_NAMESPACE, false)) {
            Serial.println("Failed to open preferences namespace");
            loadDefaults();
            return;
        }
        
        // Load values from NVS, use defaults if not found
        wifiSSID = preferences.getString(KEY_WIFI_SSID, DEFAULT_WIFI_SSID);
        wifiPassword = preferences.getString(KEY_WIFI_PASSWORD, DEFAULT_WIFI_PASSWORD);
        socketServerURL = preferences.getString(KEY_SOCKET_SERVER_URL, DEFAULT_SOCKET_SERVER_URL);
        LEDPin = preferences.getInt(KEY_LED_PIN, DEFAULT_LED_PIN);
        motorPin = preferences.getInt(KEY_MOTOR_PIN, DEFAULT_MOTOR_PIN);
        deviceNamePrefix = preferences.getString(KEY_DEVICE_NAME_PREFIX, DEFAULT_DEVICE_NAME_PREFIX);
        beaconNE = preferences.getString(KEY_BEACON_NE, DEFAULT_BEACON_NE);
        beaconNW = preferences.getString(KEY_BEACON_NW, DEFAULT_BEACON_NW);
        beaconSE = preferences.getString(KEY_BEACON_SE, DEFAULT_BEACON_SE);
        beaconSW = preferences.getString(KEY_BEACON_SW, DEFAULT_BEACON_SW);
        
        preferences.end();
        
        Serial.println("Configuration loaded from NVS");
    }
    
    // Load default values
    void loadDefaults() {
        wifiSSID = DEFAULT_WIFI_SSID;
        wifiPassword = DEFAULT_WIFI_PASSWORD;
        socketServerURL = DEFAULT_SOCKET_SERVER_URL;
        LEDPin = DEFAULT_LED_PIN;
        motorPin = DEFAULT_MOTOR_PIN;
        deviceNamePrefix = DEFAULT_DEVICE_NAME_PREFIX;
        beaconNE = DEFAULT_BEACON_NE;
        beaconNW = DEFAULT_BEACON_NW;
        beaconSE = DEFAULT_BEACON_SE;
        beaconSW = DEFAULT_BEACON_SW;
        Serial.println("Configuration loaded with default values");
    }
    
    // Save current configuration to NVS
    bool save() {
        if (!preferences.begin(NVS_NAMESPACE, false)) {
            Serial.println("Failed to open preferences for saving");
            return false;
        }
        
        preferences.putString(KEY_WIFI_SSID, wifiSSID);
        preferences.putString(KEY_WIFI_PASSWORD, wifiPassword);
        preferences.putString(KEY_SOCKET_SERVER_URL, socketServerURL);
        preferences.putInt(KEY_LED_PIN, LEDPin);
        preferences.putInt(KEY_MOTOR_PIN, motorPin);
        preferences.putString(KEY_DEVICE_NAME_PREFIX, deviceNamePrefix);
        preferences.putString(KEY_BEACON_NE, beaconNE);
        preferences.putString(KEY_BEACON_NW, beaconNW);
        preferences.putString(KEY_BEACON_SE, beaconSE);
        preferences.putString(KEY_BEACON_SW, beaconSW);
        
        preferences.end();
        
        Serial.println("Configuration saved to NVS");
        return true;
    }
    
    // Parse configuration from JSON string
    bool parseFromJSON(const String& jsonString) {
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, jsonString);
        
        if (error) {
            Serial.print("JSON parsing failed: ");
            Serial.println(error.c_str());
            return false;
        }
        
        // Parse each configuration value if present
        if (doc["wifiSSID"].is<String>()) {
            wifiSSID = doc["wifiSSID"].as<String>();
        }
        
        if (doc["wifiPassword"].is<String>()) {
            wifiPassword = doc["wifiPassword"].as<String>();
        }
        
        if (doc["socketServerURL"].is<String>()) {
            socketServerURL = doc["socketServerURL"].as<String>();
        }
        
        if (doc["LEDPin"].is<int>()) {
            LEDPin = doc["LEDPin"].as<int>();
        }
        
        if (doc["motorPin"].is<int>()) {
            motorPin = doc["motorPin"].as<int>();
        }
        
        if (doc["deviceNamePrefix"].is<String>()) {
            deviceNamePrefix = doc["deviceNamePrefix"].as<String>();
        }
        
        if (doc["beaconNE"].is<String>()) {
            beaconNE = doc["beaconNE"].as<String>();
        }
        
        if (doc["beaconNW"].is<String>()) {
            beaconNW = doc["beaconNW"].as<String>();
        }
        
        if (doc["beaconSE"].is<String>()) {
            beaconSE = doc["beaconSE"].as<String>();
        }
        
        if (doc["beaconSW"].is<String>()) {
            beaconSW = doc["beaconSW"].as<String>();
        }
        
        // Save the updated configuration to NVS
        save();
        
        return true;
    }
    
    // Getter methods
    const String& getWifiSSID() const { return wifiSSID; }
    const String& getWifiPassword() const { return wifiPassword; }
    const String& getSocketServerURL() const { return socketServerURL; }
    int getLEDPin() const { return LEDPin; }
    int getMotorPin() const { return motorPin; }
    const String& getDeviceNamePrefix() const { return deviceNamePrefix; }
    const String& getBeaconNE() const { return beaconNE; }
    const String& getBeaconNW() const { return beaconNW; }
    const String& getBeaconSE() const { return beaconSE; }
    const String& getBeaconSW() const { return beaconSW; }
    
    // Setter methods (for runtime configuration changes)
    void setWifiSSID(const String& ssid) { 
        wifiSSID = ssid; 
        save();
    }
    void setWifiPassword(const String& password) { 
        wifiPassword = password; 
        save();
    }
    void setSocketServerURL(const String& url) { 
        socketServerURL = url; 
        save();
    }
    void setLEDPin(int pin) { 
        LEDPin = pin; 
        save();
    }
    void setMotorPin(int pin) { 
        motorPin = pin; 
        save();
    }
    void setDeviceNamePrefix(const String& prefix) { 
        deviceNamePrefix = prefix; 
        save();
    }
    void setBeaconNE(const String& beaconId) { 
        beaconNE = beaconId; 
        save();
    }
    void setBeaconNW(const String& beaconId) { 
        beaconNW = beaconId; 
        save();
    }
    void setBeaconSE(const String& beaconId) { 
        beaconSE = beaconId; 
        save();
    }
    void setBeaconSW(const String& beaconId) { 
        beaconSW = beaconId; 
        save();
    }
    
    // Generate JSON string from current configuration
    String toJSON() const {
        JsonDocument doc;
        
        doc["wifiSSID"] = wifiSSID;
        doc["wifiPassword"] = wifiPassword;
        doc["socketServerURL"] = socketServerURL;
        doc["LEDPin"] = LEDPin;
        doc["motorPin"] = motorPin;
        doc["deviceNamePrefix"] = deviceNamePrefix;
        doc["beaconNE"] = beaconNE;
        doc["beaconNW"] = beaconNW;
        doc["beaconSE"] = beaconSE;
        doc["beaconSW"] = beaconSW;
        
        String output;
        serializeJson(doc, output);
        return output;
    }
    
    // Print current configuration to Serial
    void printConfiguration() const {
        Serial.println("=== Configuration ===");
        Serial.print("WiFi SSID: ");
        Serial.println(wifiSSID);
        Serial.print("WiFi Password: ");
        Serial.println(wifiPassword);
        Serial.print("Socket Server URL: ");
        Serial.println(socketServerURL);
        Serial.print("LED Pin: ");
        Serial.println(LEDPin);
        Serial.print("Motor Pin: ");
        Serial.println(motorPin);
        Serial.print("Device Name Prefix: ");
        Serial.println(deviceNamePrefix);
        Serial.print("Beacon NE: ");
        Serial.println(beaconNE);
        Serial.print("Beacon NW: ");
        Serial.println(beaconNW);
        Serial.print("Beacon SE: ");
        Serial.println(beaconSE);
        Serial.print("Beacon SW: ");
        Serial.println(beaconSW);
        Serial.println("====================");
    }
};

// Define default values
const String Configuration::DEFAULT_WIFI_SSID = "IOT";
const String Configuration::DEFAULT_WIFI_PASSWORD = "!HVAIOT!";
const String Configuration::DEFAULT_SOCKET_SERVER_URL = "ws://feib.nl:5003";
const int Configuration::DEFAULT_LED_PIN = 3;
const int Configuration::DEFAULT_MOTOR_PIN = 2;
const String Configuration::DEFAULT_DEVICE_NAME_PREFIX = "HitloopScanner";
const String Configuration::DEFAULT_BEACON_NE = "64:e8:33:84:43:9a";
const String Configuration::DEFAULT_BEACON_NW = "64:e8:33:87:0d:62";
const String Configuration::DEFAULT_BEACON_SE = "98:3d:ae:aa:16:8a";
const String Configuration::DEFAULT_BEACON_SW = "98:3d:ae:ab:b2:7a";

// Define NVS key names
const char* Configuration::NVS_NAMESPACE = "config";
const char* Configuration::KEY_WIFI_SSID = "wifi_ssid";
const char* Configuration::KEY_WIFI_PASSWORD = "wifi_pass";
const char* Configuration::KEY_SOCKET_SERVER_URL = "socket_url";
const char* Configuration::KEY_LED_PIN = "led_pin";
const char* Configuration::KEY_MOTOR_PIN = "motor_pin";
const char* Configuration::KEY_DEVICE_NAME_PREFIX = "device_prefix";
const char* Configuration::KEY_BEACON_NE = "beacon_ne";
const char* Configuration::KEY_BEACON_NW = "beacon_nw";
const char* Configuration::KEY_BEACON_SE = "beacon_se";
const char* Configuration::KEY_BEACON_SW = "beacon_sw";

extern Configuration configuration;

#endif // CONFIGURATION_H
