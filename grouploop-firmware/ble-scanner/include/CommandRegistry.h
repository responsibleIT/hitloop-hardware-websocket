#ifndef COMMAND_REGISTRY_H
#define COMMAND_REGISTRY_H

#include "Arduino.h"
#include <map>
#include <functional>

class CommandRegistry {
private:
    std::map<String, std::function<void(const String&)>> handlers;
    
public:
    CommandRegistry() {}
    
    // Register a command handler
    void registerCommand(const String& name, std::function<void(const String&)> handler) {
        handlers[name] = handler;
        Serial.print("Registered command: ");
        Serial.println(name);
    }
    
    // Execute a command with parameters
    bool executeCommand(const String& command, const String& parameters) {
        if (handlers.count(command)) {
            try {
                handlers[command](parameters);
                Serial.print("Executed command: ");
                Serial.print(command);
                if (parameters.length() > 0) {
                    Serial.print(" with parameters: ");
                    Serial.println(parameters);
                } else {
                    Serial.println();
                }
                return true;
            } catch (...) {
                Serial.print("Error executing command: ");
                Serial.println(command);
                return false;
            }
        } else {
            Serial.print("Unknown command: ");
            Serial.println(command);
            return false;
        }
    }
    
    // Check if a command is registered
    bool hasCommand(const String& command) const {
        return handlers.count(command) > 0;
    }
    
    // Get list of registered commands
    void listCommands() const {
        Serial.println("Registered commands:");
        for (const auto& pair : handlers) {
            Serial.print("  - ");
            Serial.println(pair.first);
        }
    }
    
    // Get number of registered commands
    size_t getCommandCount() const {
        return handlers.size();
    }
};

// Global command registry instance
extern CommandRegistry commandRegistry;

#endif // COMMAND_REGISTRY_H
