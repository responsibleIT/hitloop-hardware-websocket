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

            // If we are in individual mode, exit to a global mode so legacy
            // led/pattern flows from device-control keep working.
            if (currentBehavior == &ledsIndividual) {
                setBehavior(&ledsSolid);
            }

            // Keep global behaviors in sync with the latest chosen color.
            ledsSolid.setColor(color);
            ledsBreathing.setColor(color);
            ledsHeartBeat.setColor(color);
            ledsCycle.setColor(color);
            ledsSpring.setColor(color);

            if (currentBehavior) {
                currentBehavior->setColor(color);
            }
            Serial.print("Set LED color to: ");
            Serial.println(params);
        
        });
        
        // Register pattern command
        commandRegistry.registerCommand("pattern", [this](const String& params) {
            if (params == "breathing") {
                if (currentBehavior == &ledsIndividual) {
                    ledsIndividual.setPatternBreathing();
                    Serial.println("Set individual LED pattern to breathing");
                } else {
                    setBehavior(&ledsBreathing);
                    Serial.println("Set LED pattern to breathing");
                }
            }
            else if (params == "heartbeat") {
                if (currentBehavior == &ledsIndividual) {
                    ledsIndividual.setPatternHeartBeat();
                    Serial.println("Set individual LED pattern to heartbeat");
                } else {
                    setBehavior(&ledsHeartBeat);
                    Serial.println("Set LED pattern to heartbeat");
                }
            }
            else if (params == "solid") {
                if (currentBehavior == &ledsIndividual) {
                    ledsIndividual.setPatternSolid();
                    Serial.println("Set individual LED pattern to solid");
                } else {
                    setBehavior(&ledsSolid);
                    Serial.println("Set LED pattern to solid");
                }
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

        // Register led_set command - Set individual LED on with color
        // Format: led_set:<index>:<color_hex>
        // Example: led_set:0:ff0000 (LED 0, red)
        commandRegistry.registerCommand("led_set", [this](const String& params) {
            // Switch to individual LED behavior
            setBehavior(&ledsIndividual);
            
            // Parse params: index:color
            int colonIndex = params.indexOf(':');
            if (colonIndex <= 0 || colonIndex >= params.length() - 1) {
                Serial.println("led_set format: <index>:<color_hex>");
                return;
            }
            
            int index = params.substring(0, colonIndex).toInt();
            String colorStr = params.substring(colonIndex + 1);
            unsigned long color = strtoul(colorStr.c_str(), NULL, 16);
            
            if (index >= 0 && index < 6) {
                ledsIndividual.setLedOn(index, color);
                Serial.print("Set LED ");
                Serial.print(index);
                Serial.print(" to color 0x");
                Serial.println(colorStr);
            } else {
                Serial.print("LED index out of range: ");
                Serial.println(index);
            }
        });

        // Register led_off command - Turn off individual LED
        // Format: led_off:<index>
        // Example: led_off:0 (turn off LED 0)
        commandRegistry.registerCommand("led_off", [this](const String& params) {
            // Switch to individual LED behavior if not already
            if (currentBehavior != &ledsIndividual) {
                setBehavior(&ledsIndividual);
            }
            
            int index = params.toInt();
            if (index >= 0 && index < 6) {
                ledsIndividual.setLedOff(index);
                Serial.print("Turned off LED ");
                Serial.println(index);
            } else {
                Serial.print("LED index out of range: ");
                Serial.println(index);
            }
        });

        // Register led_all_off command - Turn off all LEDs
        commandRegistry.registerCommand("led_all_off", [this](const String& params) {
            // Switch to individual LED behavior
            setBehavior(&ledsIndividual);
            ledsIndividual.clearAll();
            Serial.println("Turned off all LEDs");
        });

        // Register led_get_state command - Get state of all LEDs (for debugging)
        commandRegistry.registerCommand("led_get_state", [this](const String& params) {
            Serial.println("LED States:");
            if (currentBehavior == &ledsIndividual) {
                for (int i = 0; i < 6; i++) {
                    Serial.print("  LED ");
                    Serial.print(i);
                    Serial.print(": ");
                    if (ledsIndividual.isLedOn(i)) {
                        Serial.print("ON  color=0x");
                        Serial.println(ledsIndividual.getLedColor(i), HEX);
                    } else {
                        Serial.println("OFF");
                    }
                }
            } else {
                Serial.print("Current behavior: ");
                Serial.println(currentBehavior->type);
            }
        });
    }
};

#endif // LED_PROCESS_H 