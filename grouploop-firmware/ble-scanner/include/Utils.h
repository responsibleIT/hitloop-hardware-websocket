#ifndef UTILS_H
#define UTILS_H

#include <Arduino.h>

static uint32_t hexToColor(String hex) {
    if (hex.startsWith("#")) {
        hex = hex.substring(1);
    }
    return (uint32_t)strtol(("0x" + hex).c_str(), NULL, 16);
}

#endif // UTILS_H 