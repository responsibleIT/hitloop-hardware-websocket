#include "processes/LedBehaviors.h"

// --- Global LED Behavior Instances ---
// These instances are defined here and available globally

// Basic behaviors
LedsOffBehavior ledsOff;
SolidBehavior ledsSolid;
BreathingBehavior ledsBreathing(0xFFFFFF, 2000);
HeartBeatBehavior ledsHeartBeat;
CycleBehavior ledsCycle(0x000000, 100);
SpringBehavior ledsSpring(0xFFFFFF); // Green spring with default parameters

