#ifndef RECEIVE_PROCESS_H
#define RECEIVE_PROCESS_H

#include "Process.h"
#include "ProcessManager.h"
#include "Timer.h"
#include "Configuration.h"
#include "WebSocketManager.h"
#include "CommandRegistry.h"
#include <WiFi.h>

class ReceiveProcess : public Process {

private:
	String state;
	Timer messageCheckTimer;

public:
	ReceiveProcess()
		: Process()
		, state("DISCONNECTED")
		, messageCheckTimer(10) // Check for messages every 10ms
	{}

	void setup() override {
		// Set up message callback for the shared WebSocket connection
		webSocketManager.setMessageCallback([this](const String& message) {
			// This callback will be called when messages are received
			// The message is already stored in webSocketManager
		});
	}

	void update() override {
		state = webSocketManager.getState();
		
		// Check for new messages and process them
		if (webSocketManager.isConnected() && messageCheckTimer.checkAndReset()) {
			processMessages();
		}
	}

	// Check if there's a new message available
	bool hasMessage() const {
		return webSocketManager.hasMessage();
	}

	// Get the last received message and mark it as processed
	String getMessage() {
		return webSocketManager.getMessage();
	}

	// Get the current connection state
	String getState() const {
		return state;
	}

	// Get the device ID
	String getDeviceId() const {
		return webSocketManager.getDeviceId();
	}

	// Check if connected
	bool isConnected() const {
		return webSocketManager.isConnected();
	}

private:
	// Process incoming messages and execute commands
	void processMessages() {
		if (!webSocketManager.hasMessage()) return;
		
		String message = getMessage();
		Serial.print("Received message from server: '");
		Serial.print(message);
		Serial.print("' (length: ");
		Serial.print(message.length());
		Serial.println(")");
		
		// Parse command:parameters
		int colonIndex = message.indexOf(':');
		if (colonIndex > 0) {
			String command = message.substring(0, colonIndex);
			String parameters = message.substring(colonIndex + 1);
			
			// Use the command registry to execute the command
			if (!commandRegistry.executeCommand(command, parameters)) {
				Serial.print("Failed to execute command: ");
				Serial.println(command);
			}
		} else {
			// Command without parameters
			if (!commandRegistry.executeCommand(message, "")) {
				Serial.print("Failed to execute command: ");
				Serial.println(message);
			}
		}
	}
};

#endif // RECEIVE_PROCESS_H
