#ifndef VIBRATION_PROCESS_H
#define VIBRATION_PROCESS_H

#include <Arduino.h>
#include "Process.h"
#include "config.h"
#include "VibrationBehaviors.h"
#include "CommandRegistry.h"

class VibrationProcess : public Process {
public:
    VibrationProcess() : Process(), currentBehavior(nullptr) {
    }

    ~VibrationProcess() {
    }

    void setBehavior(VibrationBehavior* newBehavior) {
        currentBehavior = newBehavior;
        if (currentBehavior) {
            currentBehavior->setup();
        }
    }

    void setup() override {
        // Register vibration commands
        registerCommands();
    }

    void update() override {
        if (currentBehavior) {
            currentBehavior->update();
        }
    }
    
    // Method to trigger vibration for a specific duration
    void vibrate(int duration) {
        // This would need to be implemented based on your vibration hardware
        Serial.print("Vibrating for ");
        Serial.print(duration);
        Serial.println("ms");
        // TODO: Implement actual vibration control
    }

    VibrationBehavior* currentBehavior;

private:
    void registerCommands() {
        // Register vibration command
        commandRegistry.registerCommand("vibrate", [this](const String& params) {
            int duration = params.toInt();
            if (duration > 0) {
                vibrate(duration);
            } else {
                Serial.println("Invalid vibration duration");
            }
        });
    }
};

#endif // VIBRATION_PROCESS_H 