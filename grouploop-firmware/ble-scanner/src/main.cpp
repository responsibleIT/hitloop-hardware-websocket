/* 
Deze code moet:
BLE ontvangen van de beacons.                             |Check
De RSSI en de naam van de beacon naar de server sturen.   |Check
Data ontvangen van de server.                             |
Commands van de server uitvoeren.                         |
*/
#include "Arduino.h"
#include <map>
#include "config.h"
#include "Timer.h"
#include "Configuration.h"

// Process classes
#include "processes/IMUProcess.h"
#include "processes/LedProcess.h"
#include "processes/VibrationProcess.h"
#include "processes/BLEProcess.h"
#include "processes/PublishProcess.h"
#include "processes/ReceiveProcess.h"
#include "processes/ConfigurationProcess.h"
#include "processes/WiFiProcess.h"
#include "Process.h"
#include "ProcessManager.h"
#include "WebSocketManager.h"
#include "CommandRegistry.h"


// Global pointer for BLE callback
BLEProcess* g_BLEProcess = nullptr;

// Global Configuration instance
Configuration configuration;

// Global ProcessManager instance
ProcessManager processManager;


void registerGlobalCommands() {
  // Register status command
  commandRegistry.registerCommand("status", [](const String& params) {
    Serial.println("=== Device Status ===");
    Serial.print("WiFi: ");
    WiFiProcess* wifiProcess = static_cast<WiFiProcess*>(processManager.getProcess("wifi"));
    if (wifiProcess) {
      Serial.println(wifiProcess->isWiFiConnected() ? "Connected" : "Disconnected");
    } else {
      Serial.println("Unknown");
    }
    
    Serial.print("BLE: ");
    BLEProcess* bleProcess = static_cast<BLEProcess*>(processManager.getProcess("ble"));
    if (bleProcess) {
      Serial.println(bleProcess->isProcessRunning() ? "Running" : "Stopped");
    } else {
      Serial.println("Unknown");
    }
    
    Serial.print("WebSocket: ");
    Serial.println(webSocketManager.isConnected() ? "Connected" : "Disconnected");
    
    Serial.print("Device ID: ");
    Serial.println(webSocketManager.getDeviceId());
    
    Serial.print("Registered Commands: ");
    Serial.println(commandRegistry.getCommandCount());
    
    Serial.println("===================");
  });
}

void setup() {
  delay(SETUP_DELAY);
  Serial.println("Starting setup");
  Serial.begin(SERIAL_BAUD_RATE);
  
  // Initialize random seed for LED color selection
  randomSeed(analogRead(0));

  // Initialize configuration with default values
  configuration.initialize();
 

  // Add processes to the ProcessManager
  processManager.addProcess("configuration", new ConfigurationProcess());
  processManager.addProcess("wifi", new WiFiProcess());
  processManager.addProcess("led", new LedProcess());
  processManager.addProcess("vibration", new VibrationProcess());
  processManager.addProcess("imu", new IMUProcess());
  processManager.addProcess("ble", new BLEProcess());
  processManager.addProcess("publish", new PublishProcess());
  processManager.addProcess("receive", new ReceiveProcess());
  
  
  // Initially halt BLE process until WiFi is connected
  processManager.haltProcess("ble");

  // Set up LED behavior
  LedProcess* ledProcess = static_cast<LedProcess*>(processManager.getProcess("led"));
  if (ledProcess) {
    ledsBreathing.setColor(0xFF0000);
    ledProcess->setBehavior(&ledsBreathing);
  }

  // Initialize all processes
  processManager.setupProcesses();
  
  // Register global commands
  registerGlobalCommands();
}

void loop() {
  // Always update configuration process first
  ConfigurationProcess* configurationProcess = static_cast<ConfigurationProcess*>(processManager.getProcess("configuration"));
  if (configurationProcess && configurationProcess->isProcessRunning()) {
    configurationProcess->update();
  }
  
  // If in configuration mode, halt other processes until exit or timeout
  if (configurationProcess && configurationProcess->isInConfigurationMode()) {
    return;
  }
  
  // Check WiFi status and start BLE process when WiFi is connected
  WiFiProcess* wifiProcess = static_cast<WiFiProcess*>(processManager.getProcess("wifi"));
  BLEProcess* bleProcess = static_cast<BLEProcess*>(processManager.getProcess("ble"));
  LedProcess* ledProcess = static_cast<LedProcess*>(processManager.getProcess("led"));
  
  if (wifiProcess && bleProcess) {
    if (wifiProcess->isWiFiConnected() && !bleProcess->isProcessRunning()) {
      Serial.println("WiFi connected - starting BLE process");
      processManager.startProcess("ble");
      
      // Change LED to random non-red color when WiFi connects
      if (ledProcess) {
        ledProcess->changeToRandomColor();
      }
    } else if (!wifiProcess->isWiFiConnected() && bleProcess->isProcessRunning()) {
      Serial.println("WiFi disconnected - halting BLE process");
      processManager.haltProcess("ble");
      
      // Change LED back to red breathing when WiFi disconnects
      if (ledProcess) {
        ledProcess->setToRedBreathing();
      }
    }
  }
  
  
  // Update the shared WebSocket connection
  webSocketManager.update();
  
  // Update all other running processes
  processManager.updateProcesses();
}
