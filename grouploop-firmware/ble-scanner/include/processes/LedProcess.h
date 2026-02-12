#ifndef LED_PROCESS_H
#define LED_PROCESS_H

#include <Adafruit_NeoPixel.h>
#include <Ticker.h>
#include "Process.h"
#include "config.h"
#include "LedBehaviors.h"
#include "Configuration.h"
#include "CommandRegistry.h"

class LedProcess : public Process {
public:
    LedProcess() : Process(), pixels(LED_COUNT, configuration.getLEDPin(), NEO_GRB + NEO_KHZ800), currentBehavior(nullptr) {
    }

    ~LedProcess() {
        ledTicker.detach();
    }

    void setBehavior(LedBehavior* newBehavior) {
        currentBehavior = newBehavior;
        if (currentBehavior) {
            currentBehavior->setup(pixels);
        }
    }
    
    // Change LED to a random non-red color
    void changeToRandomColor() {
        // Array of non-red colors: green, blue, cyan, yellow, magenta, orange
        uint32_t colors[] = {
            0x00FF00,  // Green
            0x0000FF,  // Blue
            0x00FFFF,  // Cyan
            0xFFFF00,  // Yellow
            0xFF00FF,  // Magenta
            0xFF8000   // Orange
        };
        
        // Get random index
        int colorIndex = random(0, sizeof(colors) / sizeof(colors[0]));
        uint32_t selectedColor = colors[colorIndex];
        
        // Set the breathing behavior to the selected color
        ledsBreathing.setColor(selectedColor);
        setBehavior(&ledsBreathing);
        
        // Log the color change
        Serial.print("LED changed to random color: 0x");
        Serial.print(selectedColor, HEX);
        Serial.print(" (WiFi connected)");
        
        // Also log the color name for debugging
        const char* colorNames[] = {"Green", "Blue", "Cyan", "Yellow", "Magenta", "Orange"};
        Serial.print(" - ");
        Serial.println(colorNames[colorIndex]);
    }
    
    // Set LED to red breathing (for WiFi disconnected state)
    void setToRedBreathing() {
        ledsBreathing.setColor(0xFF0000); // Red
        setBehavior(&ledsBreathing);
        Serial.println("LED changed to red breathing (WiFi disconnected)");
    }

    void setup() override {        
        pixels.begin();
        pixels.setBrightness(255); // Don't set too high to avoid high current draw
        // Use a lambda to call the member function, passing 'this'
        ledTicker.attach_ms(20, +[](LedProcess* instance) { instance->update(); }, this);
        
        // Register LED commands
        registerCommands();
    }

    void update() override {
        if (currentBehavior) {
            currentBehavior->update();
        }

    }

    // Public members for access by BleManager
    Adafruit_NeoPixel pixels;
    LedBehavior* currentBehavior;

private:
    Ticker ledTicker;
    
    void registerCommands() {
        // Register LED command
        commandRegistry.registerCommand("led", [this](const String& params) {
            if (params.length() == 0) return;             
            // Try to parse as hex color
            unsigned long color = strtoul(params.c_str(), NULL, 16);
            currentBehavior->setColor(color);
            Serial.print("Set LED color to: ");
            Serial.println(params);
        
        });
        
        // Register pattern command
        commandRegistry.registerCommand("pattern", [this](const String& params) {
            if (params == "breathing") {
                setBehavior(&ledsBreathing);
                Serial.println("Set LED pattern to breathing");
            }
            else if (params == "heartbeat") {
                setBehavior(&ledsHeartBeat);
                Serial.println("Set LED pattern to heartbeat");
            }
            else if (params == "solid") {
                setBehavior(&ledsSolid);
                Serial.println("Set LED pattern to solid");
            }
            else if (params == "cycle") {
                setBehavior(&ledsCycle);
                Serial.println("Set LED pattern to cycle");
            }
            else if (params == "spring") {
                setBehavior(&ledsSpring);
                Serial.println("Set LED pattern to spring");
            }
            else if (params == "off") {
                setBehavior(&ledsOff);
                Serial.println("Set LED pattern to off");
            }
            else {
                Serial.print("Unknown pattern: ");
                Serial.println(params);
            }
        });
        
        // Register reset command
        commandRegistry.registerCommand("reset", [this](const String& params) {
            if (currentBehavior) {
                currentBehavior->reset();
                Serial.println("Reset LED pattern");
            }
        });

        // Register brightness command
        commandRegistry.registerCommand("brightness", [this](const String& params) {
            int brightness = params.toInt();
            if (brightness >= 0 && brightness <= 255) {
                pixels.setBrightness(brightness);
                Serial.print("Set LED brightness to: ");
                Serial.println(brightness);
            } else {
                Serial.println("Brightness must be between 0 and 255");
            }
        });

        // Register spring_param command
        commandRegistry.registerCommand("spring_param", [this](const String& params) {
            if (params.length() >= 6) {
                // Parse hex string: 6 characters = 3 bytes
                // First 2 chars: spring constant (00-FF, scaled to 0.0-25.5)
                // Next 2 chars: damping constant (00-FF, scaled to 0.0-25.5)
                // Last 2 chars: mass (00-FF, scaled to 0.1-25.6)
                
                String springHex = params.substring(0, 2);
                String dampingHex = params.substring(2, 4);
                String massHex = params.substring(4, 6);
                
                uint8_t springByte = strtol(springHex.c_str(), NULL, 16);
                uint8_t dampingByte = strtol(dampingHex.c_str(), NULL, 16);
                uint8_t massByte = strtol(massHex.c_str(), NULL, 16);
                
                // Scale bytes to appropriate ranges
                float springConstant = springByte / 10.0f;  // 0.0 to 25.5
                float dampingConstant = dampingByte / 10.0f; // 0.0 to 25.5
                float mass = (massByte / 10.0f) + 0.1f;     // 0.1 to 25.6
                
                // Apply to spring behavior
                ledsSpring.setSpringParams(springConstant, dampingConstant, mass);
                
                Serial.print("Set spring parameters - k: ");
                Serial.print(springConstant, 1);
                Serial.print(", damping: ");
                Serial.print(dampingConstant, 1);
                Serial.print(", mass: ");
                Serial.println(mass, 1);
            } else {
                Serial.println("spring_param requires 6 hex characters (e.g., AA100D)");
            }
        });
    }
};

#endif // LED_PROCESS_H 