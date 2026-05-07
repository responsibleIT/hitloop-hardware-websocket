#ifndef LED_BEHAVIORS_H
#define LED_BEHAVIORS_H

#include <Adafruit_NeoPixel.h>
#include "Timer.h"
#include "Utils.h"

// --- LED Behavior Base Class ---
class LedBehavior {
protected:
    uint32_t color;
    Timer updateTimer;
public:
    const char* type;
    virtual ~LedBehavior() {}
    virtual void setup(Adafruit_NeoPixel& pixels) {
        this->pixels = &pixels;
    }
    virtual void update() = 0;
    virtual void updateParams() {}
    virtual void reset() {
        updateTimer.resetMillis();
    }

    void setColor(uint32_t color) {
        this->color = color;        
    }

    void setTimerInterval(uint32_t interval) {
        updateTimer.interval = interval;
    }

protected:
    LedBehavior(const char* type) : type(type) {        
    }
    Adafruit_NeoPixel* pixels;
    uint32_t scaleColor(uint32_t color, uint8_t brightness) {
        uint8_t r = (uint8_t)(((color >> 16) & 0xFF) * brightness / 255);
        uint8_t g = (uint8_t)(((color >> 8) & 0xFF) * brightness / 255);
        uint8_t b = (uint8_t)((color & 0xFF) * brightness / 255);
        return pixels->Color(r, g, b);
    }
};

// --- Concrete LED Behaviors ---

// 1. LedsOffBehavior
class LedsOffBehavior : public LedBehavior {
public:
    LedsOffBehavior() : LedBehavior("Off") {}
    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        this->pixels->clear();
        this->pixels->show();
    }
    void update() override {
        // Do nothing, LEDs are off
    }
};

// 2. SolidBehavior
class SolidBehavior : public LedBehavior {
public:    
    SolidBehavior(uint32_t color = 0) : LedBehavior("Solid") {
        setColor(color);
    }
  
    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        this->pixels->fill(color);
        this->pixels->show();
    }
    void update() override {
        // Do nothing, color is set in setup.
    }
};

// 2. BreathingBehavior
class BreathingBehavior : public LedBehavior {
public:    
    uint32_t duration;
    BreathingBehavior(uint32_t color, uint32_t duration) : LedBehavior("Breathing"), duration(duration) {
        setColor(color);
        setTimerInterval(1000 / 50);
    } // 50Hz for smooth animation

    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        updateTimer.reset();
    }

    void update() override {
        if (updateTimer.checkAndReset()) {
            float sine_wave = sin(updateTimer.elapsed() * 2.0 * PI / duration); // 4-second period
            uint8_t brightness = (uint8_t)(((sine_wave + 1.0) / 2.0) * 255.0);
            pixels->fill(scaleColor(color, brightness));
            pixels->show();
        }
    }

};

// 3. HeartBeatBehavior
class HeartBeatBehavior : public LedBehavior {
public:
    unsigned long pulse_duration;
    unsigned long pulse_interval;

    HeartBeatBehavior(uint32_t color = 0xFF0000, unsigned long duration = 770, unsigned long interval = 2000) 
        : LedBehavior("HeartBeat"), 
          pulse_duration(duration), 
          pulse_interval(interval), 
          state(IDLE),
          stateStartTime(0),
          currentStateDuration(0) {
        setColor(color);
        setTimerInterval(20); // 50Hz update rate for smooth animation
    }    

    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        state = IDLE;
        stateStartTime = updateTimer.elapsed();
        currentStateDuration = pulse_interval;
        updateTimer.reset();
        this->pixels->clear();
        this->pixels->show();
    }

    void update() override {
        if (!updateTimer.checkAndReset()) return;
        
        unsigned long currentTime = updateTimer.elapsed();
        unsigned long elapsed = currentTime - stateStartTime;
        
        switch (state) {
            case IDLE:
                if (elapsed >= currentStateDuration) {
                    startState(FADE_IN_1, getScaledDuration(FADE_IN_1_DUR));
                }
                break;
                
            case FADE_IN_1: {
                if (elapsed >= currentStateDuration) {
                    pixels->fill(color);
                    pixels->show();
                    startState(FADE_OUT_1, getScaledDuration(FADE_OUT_1_DUR));
                } else {
                    uint8_t brightness = (elapsed * 255) / currentStateDuration;
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }
            
            case FADE_OUT_1: {
                if (elapsed >= currentStateDuration) {
                    pixels->clear();
                    pixels->show();
                    startState(PAUSE, getScaledDuration(PAUSE_DUR));
                } else {
                    uint8_t brightness = 255 - (elapsed * 255 / currentStateDuration);
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }
            
            case PAUSE:
                if (elapsed >= currentStateDuration) {
                    startState(FADE_IN_2, getScaledDuration(FADE_IN_2_DUR));
                }
                break;
                
            case FADE_IN_2: {
                if (elapsed >= currentStateDuration) {
                    pixels->fill(color);
                    pixels->show();
                    startState(FADE_OUT_2, getScaledDuration(FADE_OUT_2_DUR));
                } else {
                    uint8_t brightness = (elapsed * 255) / currentStateDuration;
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }
            
            case FADE_OUT_2: {
                if (elapsed >= currentStateDuration) {
                    pixels->clear();
                    pixels->show();
                    startState(IDLE, pulse_interval);
                } else {
                    uint8_t brightness = 255 - (elapsed * 255 / currentStateDuration);
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }
        }
    }

    void setParams(uint32_t c, unsigned long dur, unsigned long inter) {
        setColor(c);
        pulse_duration = dur;
        pulse_interval = inter;
    }

private:
    enum BeatState { IDLE, FADE_IN_1, FADE_OUT_1, PAUSE, FADE_IN_2, FADE_OUT_2 };
    BeatState state;
    unsigned long stateStartTime;
    unsigned long currentStateDuration;

    static const unsigned long BASE_DURATION = 770;
    static const unsigned long FADE_IN_1_DUR = 60;
    static const unsigned long FADE_OUT_1_DUR = 150;
    static const unsigned long PAUSE_DUR = 100;
    static const unsigned long FADE_IN_2_DUR = 60;
    static const unsigned long FADE_OUT_2_DUR = 400;

    void startState(BeatState newState, unsigned long duration) {
        state = newState;
        stateStartTime = updateTimer.elapsed();
        currentStateDuration = duration;
    }

    unsigned long getScaledDuration(unsigned long base_part_duration) {
        if (pulse_duration == 0 || BASE_DURATION == 0) return 0;
        return (base_part_duration * pulse_duration) / BASE_DURATION;
    }
};


// 4. CycleBehavior
class CycleBehavior : public LedBehavior {
public:
    int delay;
    CycleBehavior(uint32_t color, int delay) : LedBehavior("Cycle"), delay(delay) {
        setColor(color);
        setTimerInterval(delay);
    }

    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        updateTimer.reset();
        currentPixel = 0;
    }

    void update() override {
        if (updateTimer.checkAndReset()) {
            pixels->clear();
            pixels->setPixelColor(currentPixel, color);
            pixels->show();
            currentPixel = (currentPixel + 1) % pixels->numPixels();
        }
    }

private:
    int currentPixel;
};

// 5. SpringBehavior - Implements Hooke's law for LED brightness
class SpringBehavior : public LedBehavior {
public:
    float targetBrightness;    // Target brightness (0.0 to 1.0)
    float springConstant;      // Spring constant (k) - higher = stiffer spring
    float damping;             // Damping factor (0.0 to 1.0) - higher = more damping
    float mass;                // Mass of the spring system
    
    SpringBehavior(uint32_t color, float targetBrightness = 0.0f, float springConstant = 20.1f, float damping = 2.0f, float mass = 1.0f) 
        : LedBehavior("Spring"), 
          targetBrightness(targetBrightness),
          springConstant(springConstant),
          damping(damping),
          mass(mass),
          currentBrightness(1.0f),
          velocity(0.0f),
          lastUpdateTime(0) {
        setColor(color);
        setTimerInterval(16); // ~60Hz for smooth physics simulation
    }

    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        updateTimer.reset();
        currentBrightness = 1.0f;
        velocity = 0.0f;
        lastUpdateTime = 0;
    }

    void update() override {
        if (updateTimer.checkAndReset()) {
            unsigned long currentTime = updateTimer.elapsed();
            if (lastUpdateTime == 0) {
                lastUpdateTime = currentTime;
                return;
            }
            
            // Calculate delta time in seconds
            float deltaTime = (currentTime - lastUpdateTime) / 1000.0f;
            lastUpdateTime = currentTime;
            
            // Hooke's law: F = -k * x (where x is displacement from equilibrium)
            float displacement = currentBrightness - targetBrightness;
            float springForce = -springConstant * displacement;
            
            // Apply damping force (proportional to velocity)
            float dampingForce = -damping * velocity;
            
            // Net force
            float netForce = springForce + dampingForce;
            
            // Newton's second law: F = ma, so a = F/m
            float acceleration = netForce / mass;
            
            // Update velocity and position using simple Euler integration
            velocity += acceleration * deltaTime;
            currentBrightness += velocity * deltaTime;
            
            // Clamp brightness to valid range
            //currentBrightness = constrain(currentBrightness, 0.0f, 1.0f);
            
            // Convert to 8-bit brightness and apply to LEDs
            uint8_t brightness = (uint8_t)(abs(currentBrightness) * 255.0f);
            pixels->fill(scaleColor(color, brightness));
            pixels->show();
        }
    }

    void setTargetBrightness(float target) {
        targetBrightness = constrain(target, 0.0f, 1.0f);
    }

    void setSpringParams(float k, float damp, float m) {
        springConstant = k;
        damping = damp;
        mass = m;
    }

    void reset() override {
        LedBehavior::reset();
    
        currentBrightness = 1.0f;
        targetBrightness = 0.0f;
        velocity = 0.0f;
        lastUpdateTime = 0;
    }

private:
    float currentBrightness;   // Current brightness (0.0 to 1.0)
    float velocity;            // Current velocity of the spring
    unsigned long lastUpdateTime; // Last update time for delta calculation
};

// 6. IndividualLedBehavior - Control each of 6 LEDs independently
class IndividualLedBehavior : public LedBehavior {
private:
    enum PatternMode {
        PATTERN_SOLID,
        PATTERN_BREATHING,
        PATTERN_HEARTBEAT
    };

    struct LedState {
        bool isOn;
        uint32_t color;
        uint8_t brightness;
    };
    LedState ledStates[6];  // State for each of 6 LEDs
    PatternMode patternMode;
    uint32_t breathingDurationMs;
    unsigned long heartbeatIntervalMs;

public:
    IndividualLedBehavior() : LedBehavior("Individual") {
        setTimerInterval(20); // 50Hz
        patternMode = PATTERN_SOLID;
        breathingDurationMs = 2000;
        heartbeatIntervalMs = 2000;
        // Initialize all LEDs as off
        for (int i = 0; i < 6; i++) {
            ledStates[i] = {false, 0x000000, 255};
        }
    }

    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        updateTimer.reset();
        this->pixels->clear();
        this->pixels->show();
    }

    void update() override {
        if (!updateTimer.checkAndReset()) return;

        uint8_t frameBrightness = computeFrameBrightness();

        // Render each LED according to its individual state
        for (int i = 0; i < 6; i++) {
            if (ledStates[i].isOn) {
                uint16_t combined = ((uint16_t)ledStates[i].brightness * (uint16_t)frameBrightness) / 255;
                uint32_t scaledColor = scaleColor(ledStates[i].color, (uint8_t)combined);
                pixels->setPixelColor(i, scaledColor);
            } else {
                pixels->setPixelColor(i, 0);  // Off
            }
        }
        pixels->show();
    }

    void reset() override {
        LedBehavior::reset();
        patternMode = PATTERN_SOLID;
        // Reset all LEDs to off
        for (int i = 0; i < 6; i++) {
            ledStates[i] = {false, 0x000000, 255};
        }
        pixels->clear();
        pixels->show();
    }

    // Set individual LED state
    void setLedOn(int index, uint32_t color, uint8_t brightness = 255) {
        if (index >= 0 && index < 6) {
            ledStates[index] = {true, color, brightness};
        }
    }

    // Turn off individual LED
    void setLedOff(int index) {
        if (index >= 0 && index < 6) {
            ledStates[index] = {false, 0x000000, 255};
        }
    }

    // Turn off all LEDs
    void clearAll() {
        for (int i = 0; i < 6; i++) {
            ledStates[i] = {false, 0x000000, 255};
        }
        if (pixels) {
            pixels->clear();
            pixels->show();
        }
    }

    void setPatternSolid() {
        patternMode = PATTERN_SOLID;
    }

    void setPatternBreathing(uint32_t durationMs = 2000) {
        patternMode = PATTERN_BREATHING;
        breathingDurationMs = durationMs;
    }

    void setPatternHeartBeat(unsigned long intervalMs = 2000) {
        patternMode = PATTERN_HEARTBEAT;
        heartbeatIntervalMs = intervalMs;
    }

    // Get current state of a specific LED
    bool isLedOn(int index) const {
        if (index >= 0 && index < 6) {
            return ledStates[index].isOn;
        }
        return false;
    }

    // Get current color of a specific LED
    uint32_t getLedColor(int index) const {
        if (index >= 0 && index < 6) {
            return ledStates[index].color;
        }
        return 0;
    }

private:
    uint8_t computeFrameBrightness() {
        switch (patternMode) {
            case PATTERN_BREATHING: {
                if (breathingDurationMs == 0) return 255;
                float sine_wave = sin(updateTimer.elapsed() * 2.0 * PI / breathingDurationMs);
                return (uint8_t)(((sine_wave + 1.0) / 2.0) * 255.0);
            }
            case PATTERN_HEARTBEAT:
                return computeHeartBeatBrightness(updateTimer.elapsed());
            case PATTERN_SOLID:
            default:
                return 255;
        }
    }

    uint8_t computeHeartBeatBrightness(unsigned long elapsedMs) {
        if (heartbeatIntervalMs == 0) return 255;

        // Match HeartBeatBehavior timing shape for synchronized per-LED pulsing.
        const unsigned long cycle = heartbeatIntervalMs;
        const unsigned long fadeIn1 = 60;
        const unsigned long fadeOut1 = 150;
        const unsigned long pause = 100;
        const unsigned long fadeIn2 = 60;
        const unsigned long fadeOut2 = 400;
        const unsigned long active = fadeIn1 + fadeOut1 + pause + fadeIn2 + fadeOut2;
        if (active >= cycle) {
            return 255;
        }
        const unsigned long idle = cycle - active;

        unsigned long t = elapsedMs % cycle;
        if (t < idle) {
            return 0;
        }
        t -= idle;

        if (t < fadeIn1) {
            return (uint8_t)((t * 255UL) / fadeIn1);
        }
        t -= fadeIn1;
        if (t < fadeOut1) {
            return (uint8_t)(255UL - ((t * 255UL) / fadeOut1));
        }
        t -= fadeOut1;
        if (t < pause) {
            return 0;
        }
        t -= pause;
        if (t < fadeIn2) {
            return (uint8_t)((t * 255UL) / fadeIn2);
        }
        t -= fadeIn2;
        if (t < fadeOut2) {
            return (uint8_t)(255UL - ((t * 255UL) / fadeOut2));
        }
        return 0;
    }
};

// --- Global LED Behavior Instances ---
// These instances are available globally to any file that includes LedBehaviors.h

// Basic behaviors
extern LedsOffBehavior ledsOff;
extern SolidBehavior ledsSolid;
extern BreathingBehavior ledsBreathing;
extern HeartBeatBehavior ledsHeartBeat;
extern CycleBehavior ledsCycle;
extern SpringBehavior ledsSpring;
extern IndividualLedBehavior ledsIndividual;

#endif // LED_BEHAVIORS_H 