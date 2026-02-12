#ifndef CONFIGURATION_PROCESS_H
#define CONFIGURATION_PROCESS_H

#include "Process.h"
#include "Configuration.h"
#include "config.h"

class ConfigurationProcess : public Process {
private:
    int bootButtonPin;
    int lastButtonState;
    bool configurationMode;
    String incomingConfig;
    unsigned long configTimeout;
    static const unsigned long CONFIG_TIMEOUT_MS = 30000; // 30 seconds timeout
    
public:
    ConfigurationProcess() : 
        bootButtonPin(BOOT_BUTTON_PIN),
        lastButtonState(HIGH),
        configurationMode(false),
        configTimeout(0) {}
    
    bool isInConfigurationMode() const { return configurationMode; }
    
    void setup() override {
        pinMode(bootButtonPin, INPUT_PULLUP);
        lastButtonState = digitalRead(bootButtonPin);
        configurationMode = false;
        incomingConfig = "";
        configTimeout = 0;
    }
    
    void update() override {
        int currentButtonState = digitalRead(bootButtonPin);
        
        // Check for button press (HIGH to LOW transition)
        if (lastButtonState == HIGH && currentButtonState == LOW) {
            handleButtonPress();
        }
        
        lastButtonState = currentButtonState;
        
        // Handle configuration mode
        if (configurationMode) {
            handleConfigurationMode();
        }
    }
    
    String getState() override {
        if (configurationMode) {
            return "configuration_mode";
        }
        return "normal";
    }
    
private:
    void handleButtonPress() {
        Serial.println("\n=== CONFIGURATION MODE ACTIVATED ===");
        Serial.println("Boot button pressed - entering configuration mode");
        
        // Dump current configuration to serial        
        Serial.println("\nCurrent configuration:");
        configuration.printConfiguration();
        Serial.println("\nCurrent configuration as JSON:");
        Serial.println(configuration.toJSON());
        
        // Enter configuration mode
        configurationMode = true;
        incomingConfig = "";
        configTimeout = millis() + CONFIG_TIMEOUT_MS;
        
        Serial.println("\nSend new configuration JSON within 30 seconds...");
        Serial.println("Format: {\"wifiSSID\":\"value\",\"wifiPassword\":\"value\",...}");
        Serial.println("Send 'CANCEL' to exit configuration mode");
        Serial.println("==========================================\n");
    }
    
    void handleConfigurationMode() {
        // Check for timeout
        if (millis() > configTimeout) {
            Serial.println("\nConfiguration timeout - exiting configuration mode");
            exitConfigurationMode();
            return;
        }
        
        // Read incoming serial data
        while (Serial.available() > 0) {
            char c = Serial.read();
            
            if (c == '\n' || c == '\r') {
                // End of line received
                if (incomingConfig.length() > 0) {
                    processIncomingConfiguration();
                }
                incomingConfig = "";
            } else {
                incomingConfig += c;
            }
        }
    }
    
    void processIncomingConfiguration() {
        incomingConfig.trim();
        
        // Check for cancel command
        if (incomingConfig.equalsIgnoreCase("CANCEL")) {
            Serial.println("Configuration cancelled by user");
            exitConfigurationMode();
            return;
        }
        
        // Try to parse the JSON configuration
        
        if (configuration.parseFromJSON(incomingConfig)) {
            Serial.println("\nConfiguration accepted!");
            Serial.println("New configuration:");
            configuration.printConfiguration();
            
            Serial.println("\nResetting device in 2 seconds...");
            delay(2000);
            
            // Reset the device
            ESP.restart();
        } else {
            Serial.println("Invalid JSON configuration. Please try again.");
            Serial.println("Format: {\"wifiSSID\":\"value\",\"wifiPassword\":\"value\",...}");
        }
    }
    
    void exitConfigurationMode() {
        configurationMode = false;
        incomingConfig = "";
        configTimeout = 0;
        Serial.println("Exited configuration mode - returning to normal operation");
    }
};

#endif // CONFIGURATION_PROCESS_H
