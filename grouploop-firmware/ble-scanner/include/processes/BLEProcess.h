#ifndef BLE_PROCESS_H
#define BLE_PROCESS_H

#include <BLEDevice.h>
#include <BLEScan.h>
#include "Process.h"
#include "Timer.h"
#include "config.h"

// Forward declaration for the global pointer
class BLEProcess;
extern BLEProcess* g_BLEProcess;

// The callback function that is executed when the scan is complete.
void scanCompleteCallback(BLEScanResults results);

class BLEProcess : public Process {
public:
    BLEProcess()
        : Process(),
          scanOnTimer((unsigned long)(SCAN_DURATION * 1000)),
          scanOffTimer(SCAN_INTERVAL_MS),
          pBLEScan(nullptr),
          scanning(false)
    {
        g_BLEProcess = this;
        // Initialize RSSI buffer
        for (int i = 0; i < 4; ++i) beaconRssi[i] = -128;
    }

    void setup() override {
        Process::setup();        
        BLEDevice::init("");
        pBLEScan = BLEDevice::getScan();
        pBLEScan->setActiveScan(false);
        pBLEScan->setInterval(BLE_SCAN_INTERVAL);
        pBLEScan->setWindow(BLE_SCAN_WINDOW);
        // Start in OFF period; will begin scanning after the first off interval elapses
        scanOffTimer.reset();
        Serial.println("BLE Initialized");
    }

    void update() override {
        if (!scanning) {
            if (scanOffTimer.checkAndReset()) {
                startScan();
            }
        } else {
            if (scanOnTimer.checkAndReset()) {
                stopScan();
            }
        }
    }

    void onScanComplete(BLEScanResults results) {
        Serial.printf("Scan complete! Found %d devices.\n", results.getCount());
        BLEUUID targetUUID(BEACON_SERVICE_UUID);
        int matched = 0;
        // reset buffer for this scan cycle
        for (int k = 0; k < 4; ++k) beaconRssi[k] = -128;
        for (int i = 0; i < results.getCount(); ++i) {
            BLEAdvertisedDevice dev = results.getDevice(i);
            if (dev.isAdvertisingService(targetUUID)) {
                matched++;
                // Handle beacon device here (e.g., store, publish, etc.)
                // Example: print address and RSSI for matches
                Serial.printf("Beacon %s RSSI %d\n", dev.getAddress().toString().c_str(), dev.getRSSI());
                // Store RSSI in first four slots
                if (matched <= 4) {
                    beaconRssi[matched - 1] = dev.getRSSI();
                }
            }
        }
        Serial.printf("Matched %d beacon devices with UUID %s\n", matched, BEACON_SERVICE_UUID);
    }

private:
    void startScan() {
        Serial.println("Starting BLE scan...");
        if (scanning) return;
        // duration=0 -> indefinite scan; we'll stop manually with timers
        pBLEScan->start(0, nullptr, false);
        scanning = true;
        scanOnTimer.reset();
    }

    void stopScan() {
        if (!scanning) return;
        Serial.println("Stopping BLE scan...");
        pBLEScan->stop();
        scanning = false;
        // Optionally emit completion behavior similar to callback
        onScanComplete(pBLEScan->getResults());
        scanOffTimer.reset();
    }

    Timer scanOnTimer;   // how long to scan (ms)
    Timer scanOffTimer;  // gap between scans (ms)
    BLEScan* pBLEScan;
    bool scanning;

public:
    int getBeaconRSSIByIndex(int index) const {
        if (index < 0 || index >= 4) return -128;
        return beaconRssi[index];
    }

    int getBeaconRSSI(const char* key) const {
        if (!key) return -128;
        if (strcmp(key, "NW") == 0) return beaconRssi[0];
        if (strcmp(key, "NE") == 0) return beaconRssi[1];
        if (strcmp(key, "SE") == 0) return beaconRssi[2];
        if (strcmp(key, "SW") == 0) return beaconRssi[3];
        return -128;
    }

private:
    int beaconRssi[4];
};

// Define the callback function to pass to the BLE scanner
inline void scanCompleteCallback(BLEScanResults results) {
    if (g_BLEProcess) {
        g_BLEProcess->onScanComplete(results);
    }
}

#endif // BLE_PROCESS_H 