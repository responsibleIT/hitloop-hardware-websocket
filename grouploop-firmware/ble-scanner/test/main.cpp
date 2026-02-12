/*
 * WebSocketClient.ino
 *
 *  Created on: 24.05.2015
 *
 */

 #include <Arduino.h>

 #include <WiFi.h>
 #include <WiFiMulti.h>
 #include <WiFiClientSecure.h>
 
 #include <WebSocketsClient.h>
 
#include <Wire.h>
#include "SparkFun_LIS2DH12.h"

 
WiFiMulti wifiMulti;
WebSocketsClient webSocket;
SPARKFUN_LIS2DH12 accel;

volatile bool wsConnected = false;
static String deviceIdHex;
static volatile bool streamEnabled = false;
static uint32_t streamIntervalMs = 0;
static uint32_t lastStreamMs = 0;

static uint8_t encodeAccelToByte(float gValue) {
	int val = (int)roundf(gValue * 32.0f) + 128; // map approx -4g..+4g to 0..255 with center at 128
	if (val < 0) val = 0;
	if (val > 255) val = 255;
	return (uint8_t)val;
}

static void sendAccelOnce() {
	if (!wsConnected) return;
	// If data available per sensor FIFO, or just read immediately
	if (accel.available() || true) {
		float ax = accel.getX() / 980.0f;
		float ay = accel.getY() / 980.0f;
		float az = accel.getZ() / 980.0f;

		uint8_t axB = encodeAccelToByte(ax);
		uint8_t ayB = encodeAccelToByte(ay);
		uint8_t azB = encodeAccelToByte(az);

		char line[19]; // 18 hex chars + null
		// Format: id(4) + ax(2) + ay(2) + az(2) + 0xFF 0xFF 0xFF 0xFF
		snprintf(line, sizeof(line), "%s%02X%02X%02XFFFFFFFF", deviceIdHex.c_str(), axB, ayB, azB);
		webSocket.sendTXT(String(line) + "\n");
	}
}
 
 #define USE_SERIAL Serial
 
 void hexdump(const void *mem, uint32_t len, uint8_t cols = 16) {
     const uint8_t* src = (const uint8_t*) mem;
     USE_SERIAL.printf("\n[HEXDUMP] Address: 0x%08X len: 0x%X (%d)", (ptrdiff_t)src, len, len);
     for(uint32_t i = 0; i < len; i++) {
         if(i % cols == 0) {
             USE_SERIAL.printf("\n[0x%08X] 0x%08X: ", (ptrdiff_t)src, i);
         }
         USE_SERIAL.printf("%02X ", *src);
         src++;
     }
     USE_SERIAL.printf("\n");
 }
 
 void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
 
    switch(type) {
         case WStype_DISCONNECTED:
             USE_SERIAL.printf("[WSc] Disconnected!\n");
            wsConnected = false;
             break;
         case WStype_CONNECTED:
             USE_SERIAL.printf("[WSc] Connected to url: %s\n", payload);
 
             // send message to server when Connected
            webSocket.sendTXT("Connected");
            wsConnected = true;
             break;
        case WStype_TEXT: {
            USE_SERIAL.printf("[WSc] get text: %s\n", payload);
            String all = String((const char*)payload);
            all.replace("\r", "");
            int start = 0;
            while (true) {
                int nl = all.indexOf('\n', start);
                String line = (nl >= 0) ? all.substring(start, nl) : all.substring(start);
                line.trim();
                if (line.length() > 0) {
                    // Handle commands: I, C<id><R><G><B>, M<id><strength><duration>, R<id>[<freq>]
                    if (line == "I") {
                        // Respond with our 2-byte ID (4 hex chars)
                        webSocket.sendTXT(deviceIdHex + "\n");
                    } else {
                        char c0 = line.charAt(0);
                        if (line.length() >= 5 && (c0 == 'C' || c0 == 'M' || c0 == 'R')) {
                            String id = line.substring(1, 5);
                            id.toUpperCase();
                            if (id == deviceIdHex) {
                                if (c0 == 'C') {
                                    // Expect RGB: 6 hex chars
                                    if (line.length() >= 11) {
                                        // If you have NeoPixel hardware, parse and set color here
                                        // String r = line.substring(5,7); String g = line.substring(7,9); String b = line.substring(9,11);
                                        // Placeholder: acknowledge by sending one sample
                                        sendAccelOnce();
                                    }
                                } else if (c0 == 'M') {
                                    // Expect strength(2 hex) + duration(2 hex)
                                    if (line.length() >= 9) {
                                        // Placeholder: no-op for motor; could drive GPIO here
                                        // Acknowledge by sending one sample
                                        sendAccelOnce();
                                    }
                                } else if (c0 == 'R') {
                                    if (line.length() == 5) {
                                        // One-shot
                                        sendAccelOnce();
                                    } else if (line.length() >= 7) {
                                        String freqHex = line.substring(5, 7);
                                        freqHex.toUpperCase();
                                        uint8_t freq = (uint8_t) strtol(freqHex.c_str(), nullptr, 16);
                                        if (freq == 0) {
                                            streamEnabled = false;
                                            streamIntervalMs = 0;
                                        } else {
                                            // Cap to avoid div-by-zero
                                            if (freq < 1) freq = 1;
                                            streamIntervalMs = (uint32_t)(1000UL / (uint32_t)freq);
                                            if (streamIntervalMs == 0) streamIntervalMs = 1;
                                            lastStreamMs = millis();
                                            streamEnabled = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if (nl < 0) break;
                start = nl + 1;
            }
            break;
        }
         case WStype_BIN:
             USE_SERIAL.printf("[WSc] get binary length: %u\n", length);
             hexdump(payload, length);
 
             // send data to server
             // webSocket.sendBIN(payload, length);
             break;
         case WStype_ERROR:			
         case WStype_FRAGMENT_TEXT_START:
         case WStype_FRAGMENT_BIN_START:
         case WStype_FRAGMENT:
         case WStype_FRAGMENT_FIN:
             break;
     }
 
 }
 
 void setup() {
     // USE_SERIAL.begin(921600);
     USE_SERIAL.begin(115200);
 
     //Serial.setDebugOutput(true);
     USE_SERIAL.setDebugOutput(true);
 
     USE_SERIAL.println();
     USE_SERIAL.println();
     USE_SERIAL.println();
 
     for(uint8_t t = 4; t > 0; t--) {
         USE_SERIAL.printf("[SETUP] BOOT WAIT %d...\n", t);
         USE_SERIAL.flush();
         delay(1000);
     }
 
    //wifiMulti.addAP("iotroam", "rpRhDnGd0Q");
    wifiMulti.addAP("IOT", "!HVAIOT!");
 
     //WiFi.disconnect();
    while(wifiMulti.run() != WL_CONNECTED) {
         delay(100);
     }
 
     // server address, port and URL
     webSocket.begin("feib.nl", 5003, "/");
 
     // event handler
     webSocket.onEvent(webSocketEvent);
 
     
     // try ever 5000 again if connection has failed
     webSocket.setReconnectInterval(5000);

	// Initialize I2C and accelerometer
	Wire.begin();
	Wire.setClock(1000000);
	if (accel.begin() == false) {
		USE_SERIAL.println("[LIS2DH12] Accelerometer not detected. Check wiring.");
	} else {
		accel.setMode(LIS2DH12_HR_12bit);
		accel.setDataRate(LIS2DH12_ODR_100Hz);
		USE_SERIAL.println("[LIS2DH12] Initialized.");
	}

	// Build device ID from last two bytes of MAC address
	uint8_t mac[6];
	WiFi.macAddress(mac);
	char idBuf[5];
	snprintf(idBuf, sizeof(idBuf), "%02X%02X", mac[4], mac[5]);
	deviceIdHex = String(idBuf);
 }
 
 void loop() {
	webSocket.loop();
	if (streamEnabled) {
		uint32_t nowMs = millis();
		if (nowMs - lastStreamMs >= streamIntervalMs) {
			lastStreamMs = nowMs;
			sendAccelOnce();
		}
	}
 }
 