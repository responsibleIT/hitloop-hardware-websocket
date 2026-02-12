#ifndef PUBLISH_PROCESS_H
#define PUBLISH_PROCESS_H

#include "Process.h"
#include "ProcessManager.h"
#include "Timer.h"
#include "Configuration.h"
#include "processes/BLEProcess.h"
#include "processes/IMUProcess.h"
#include "WebSocketManager.h"
#include <WiFi.h>

class PublishProcess : public Process {

private:
	BLEProcess* bleProcess;
	IMUProcess* imuProcess;
	Timer publishTimer; // send interval
	String state;

	static int clampInt(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
	static String toHexByte(int v) { char buf[3]; snprintf(buf, sizeof(buf), "%02x", clampInt(v, 0, 255)); return String(buf); }
	static String toHexWord(uint16_t v) { char buf[5]; snprintf(buf, sizeof(buf), "%04x", v); return String(buf); }
	static int mapFloatToByte(float v, float inMin, float inMax) {
		if (v < inMin) v = inMin; if (v > inMax) v = inMax;
		float t = (v - inMin) / (inMax - inMin);
		int b = (int)lroundf(t * 255.0f);
		return clampInt(b, 0, 255);
	}
	static int mapRssiToByte(int rssiDbm) {
		// Simple linear map: -100 dBm -> 0, -40 dBm -> 255
		if (rssiDbm < -100) rssiDbm = -100; if (rssiDbm > -40) rssiDbm = -40;
		float t = (float)(rssiDbm + 100) / 60.0f; // 0..1
		int b = (int)lroundf(t * 255.0f);
		return clampInt(b, 0, 255);
	}

	String buildFrame() const {
		// IMU
		IMUData imu = imuProcess ? imuProcess->getIMUData() : IMUData{0,0,0};
		int ax = mapFloatToByte(imu.x_g, -2.0f, 2.0f);
		int ay = mapFloatToByte(imu.y_g, -2.0f, 2.0f);
		int az = mapFloatToByte(imu.z_g, -2.0f, 2.0f);
		// BLE beacons
		int dNE = 0, dNW = 0, dSE = 0, dSW = 0;
		if (bleProcess) {
			// Map RSSI dBm to 0..255 distances as per simulator expectations
			dNW = mapRssiToByte(bleProcess->getBeaconRSSI("NW"));
			dNE = mapRssiToByte(bleProcess->getBeaconRSSI("NE"));
			dSE = mapRssiToByte(bleProcess->getBeaconRSSI("SE"));
			dSW = mapRssiToByte(bleProcess->getBeaconRSSI("SW"));
		}
		// Tap detection
		int tap = imuProcess ? (imuProcess->isTapped() ? 255 : 0) : 0;
		
		String frame;
		frame.reserve(4 + 2*8 + 1); // Updated to account for tap byte
		frame += webSocketManager.getDeviceId();
		frame += toHexByte(ax);
		frame += toHexByte(ay);
		frame += toHexByte(az);
		frame += toHexByte(dNW); // simulator expects TL->dNW first
		frame += toHexByte(dNE);
		frame += toHexByte(dSE);
		frame += toHexByte(dSW);
		frame += toHexByte(tap); // Tap detection: 0 if not tapped, 255 if tapped
		frame += "\n";
		return frame;
	}

public:
	PublishProcess()
		: Process()
		, bleProcess(nullptr)
		, imuProcess(nullptr)
		, publishTimer(50) // 20 Hz
		, state("DISCONNECTED")
	{}

	void setup() override {
		// Find dependencies through ProcessManager
		findDependencies();
		
		// Initialize the shared WebSocket connection
		webSocketManager.initialize(configuration.getSocketServerURL());
	}

	void update() override {
		// Update the shared WebSocket connection
		webSocketManager.update();
		state = webSocketManager.getState();
		
		if (webSocketManager.isConnected() && publishTimer.checkAndReset()) {
			String frame = buildFrame();
			webSocketManager.sendMessage(frame);
		}
	}

	void findDependencies() {
		if (!processManager) return;
		
		// Find BLE process
		Process* ble = processManager->getProcess("ble");
		if (ble) {
			bleProcess = static_cast<BLEProcess*>(ble);
		}
		
		// Find IMU process
		Process* imu = processManager->getProcess("imu");
		if (imu) {
			imuProcess = static_cast<IMUProcess*>(imu);
		}
	}

	String getDeviceId() const { return webSocketManager.getDeviceId(); }
	String getState() const { return state; }

};

#endif // PUBLISH_PROCESS_H 
