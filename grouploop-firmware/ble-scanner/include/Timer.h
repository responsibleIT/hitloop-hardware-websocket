#ifndef TIMER_H
#define TIMER_H

#include "Arduino.h"

struct Timer {
    unsigned long last_update;
    unsigned long interval;
    unsigned long elapsed_millis;
    unsigned long started_at;

    Timer(unsigned long an_interval) : interval(an_interval), last_update(0), elapsed_millis(0) {
        started_at = millis();
    }
    Timer() : interval(0), last_update(0) {
        started_at = millis();
    }

    bool hasElapsed() {
        return millis() - last_update > interval;
    }

    unsigned long elapsed() {
        return millis() - started_at;
    }

    bool checkAndReset() {
        if (interval == 0) return false;

        if (hasElapsed()) {
            reset();
            return true;
        }
        return false;
    }

    void reset() {
        last_update = millis();
    }

    void resetMillis() {
        elapsed_millis = 0;
        started_at = millis();
    }
};

#endif // TIMER_H 