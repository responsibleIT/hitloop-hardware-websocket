#ifndef VIBRATION_BEHAVIORS_H
#define VIBRATION_BEHAVIORS_H

#include "Arduino.h"
#include "Timer.h"
#include "config.h"
#include "Configuration.h"



// --- Vibration Behavior Base Class ---
class VibrationBehavior {
public:
    const char* type;
    virtual ~VibrationBehavior() {}
    virtual void setup() {
        pinMode(configuration.getMotorPin(), OUTPUT);
    }
    virtual void update() = 0;    

protected:
    VibrationBehavior(const char* type) : type(type) {}
};

// --- Concrete Vibration Behaviors ---

// 1. MotorOffBehavior
class MotorOffBehavior : public VibrationBehavior {
public:
    MotorOffBehavior() : VibrationBehavior("Off") {}
    void setup() override {
        VibrationBehavior::setup();
        analogWrite(configuration.getMotorPin(), 0);
    }
    void update() override {
        // Do nothing, motor is off
    }
};

// 2. ConstantVibrationBehavior
class ConstantVibrationBehavior : public VibrationBehavior {
public:
    uint8_t intensity;
    ConstantVibrationBehavior(uint8_t intensity) : VibrationBehavior("Constant"), intensity(intensity) {}
    
    void setup() override {
        VibrationBehavior::setup();
        analogWrite(configuration.getMotorPin(), intensity);
    }
    
    void update() override {
        // Do nothing, motor is at constant vibration
    }
};

// 3. BurstVibrationBehavior
class BurstVibrationBehavior : public VibrationBehavior {
public:
    uint8_t intensity;
    unsigned long frequency;
    BurstVibrationBehavior(uint8_t intensity, unsigned long frequency) 
        : VibrationBehavior("Burst"), intensity(intensity), frequency(frequency), burstTimer(frequency > 0 ? 1000 / frequency : 0), motorOn(false) {}

    void setup() override {
        VibrationBehavior::setup();
        burstTimer.reset();
        analogWrite(configuration.getMotorPin(), 0); // Start in off state
    }
    
    void update() override {
        if (burstTimer.interval > 0 && burstTimer.checkAndReset()) {
            motorOn = !motorOn;
            analogWrite(configuration.getMotorPin(), motorOn ? intensity : 0);
        }
    }
private:
    Timer burstTimer;
    bool motorOn;
};

// 4. PulseVibrationBehavior
class PulseVibrationBehavior : public VibrationBehavior {
public:
    uint8_t intensity;
    unsigned long frequency;
    PulseVibrationBehavior(uint8_t intensity = 0, unsigned long frequency = 0) 
        : VibrationBehavior("Pulse"), intensity(intensity), frequency(frequency), pulseTimer(frequency > 0 ? 1000 / frequency : 0), motorOn(false) {}

    void setup() override {
        VibrationBehavior::setup();
        pulseTimer.reset();
        analogWrite(configuration.getMotorPin(), 0);
    }
    
    void update() override {
        if (pulseTimer.interval > 0 && pulseTimer.checkAndReset()) {
            motorOn = !motorOn;
            analogWrite(configuration.getMotorPin(), motorOn ? intensity : 0);
        }
    }
private:
    Timer pulseTimer;
    bool motorOn;
};

#endif // VIBRATION_BEHAVIORS_H 