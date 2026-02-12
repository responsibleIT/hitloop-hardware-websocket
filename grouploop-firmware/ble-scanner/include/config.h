#ifndef CONFIG_H
#define CONFIG_H

#define SCANNER_NAME "Scanner"
#define BEACON_NAME_PREFIX "HitloopBeacon"
#define BLE_SCAN_INTERVAL 100
#define BLE_SCAN_WINDOW 50
#define WIFI_CONNECT_DELAY 500
#define WIFI_SEND_DELAY 3000
#define SERIAL_BAUD_RATE 115200
#define SETUP_DELAY 1000
#define SCAN_DURATION 1 // Scan for 2 seconds
#define SCAN_INTERVAL_MS (5000 - (SCAN_DURATION * 1000)) // Interval between scans

// The service UUID of the beacons to scan for
#define BEACON_SERVICE_UUID "19b10000-e8f2-537e-4f6c-d104768a1214"

#define BOOT_BUTTON_PIN 9

#define IMU_UPDATE_INTERVAL_MS 10

#define LED_COUNT 6

#define VIBRATION_MOTOR_PIN 0

#endif

