#include "Configuration.h"

void testConfiguration() {
    // Get the singleton instance
    Configuration& config = Configuration::getInstance();
    
    // Initialize with default values
    config.initialize();
    
    Serial.println("=== Testing Configuration Class ===");
    
    // Print default configuration
    Serial.println("Default configuration:");
    config.printConfiguration();
    
    // Test JSON parsing
    String jsonConfig = R"({
        "wifiSSID": "MyCustomWiFi",
        "wifiPassword": "MySecurePassword123",
        "socketServerURL": "ws://192.168.1.100:8080",
        "LEDPin": 12,
        "motorPin": 8,
        "deviceNamePrefix": "CustomDevice"
    })";
    
    Serial.println("\nParsing JSON configuration...");
    if (config.parseFromJSON(jsonConfig)) {
        Serial.println("JSON parsed successfully!");
        Serial.println("Updated configuration:");
        config.printConfiguration();
        
        // Test individual getters
        Serial.println("\nTesting individual getters:");
        Serial.print("WiFi SSID: ");
        Serial.println(config.getWifiSSID());
        Serial.print("LED Pin: ");
        Serial.println(config.getLEDPin());
        Serial.print("Motor Pin: ");
        Serial.println(config.getMotorPin());
        
        // Test JSON output
        Serial.println("\nCurrent configuration as JSON:");
        Serial.println(config.toJSON());
        
    } else {
        Serial.println("Failed to parse JSON configuration!");
    }
    
    // Test partial JSON (only some fields)
    String partialJson = R"({
        "wifiSSID": "PartialWiFi",
        "LEDPin": 15
    })";
    
    Serial.println("\nTesting partial JSON update...");
    if (config.parseFromJSON(partialJson)) {
        Serial.println("Partial JSON parsed successfully!");
        Serial.println("Configuration after partial update:");
        config.printConfiguration();
    }
    
    Serial.println("\n=== Configuration Test Complete ===");
}
