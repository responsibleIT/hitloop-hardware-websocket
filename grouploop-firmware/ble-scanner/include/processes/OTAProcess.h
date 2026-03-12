#ifndef OTA_PROCESS_H
#define OTA_PROCESS_H

#include "Process.h"
#include "ProcessManager.h"
#include "CommandRegistry.h"
#include <HTTPUpdate.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>

class OTAProcess : public Process {
public:
    OTAProcess() : Process() {}

    void setup() override {
        commandRegistry.registerCommand("ota", [this](const String& params) {
            if (params.length() == 0) {
                Serial.println("OTA: no URL provided");
                return;
            }
            performUpdate(params);
        });
        Serial.println("OTA process ready");
    }

    void update() override {
        // OTA is command-triggered; nothing to poll
    }

private:
    void performUpdate(const String& url) {
        Serial.print("OTA: starting update from ");
        Serial.println(url);

        // Halt non-essential processes to free resources
        if (processManager) {
            processManager->haltProcess("ble");
            processManager->haltProcess("publish");
        }

        httpUpdate.rebootOnUpdate(true);
#ifdef LED_BUILTIN
        httpUpdate.setLedPin(LED_BUILTIN, LOW);
#endif

        t_httpUpdate_return result;

        if (url.startsWith("https://")) {
            WiFiClientSecure client;
            client.setInsecure(); // accept self-signed certs
            result = httpUpdate.update(client, url);
        } else {
            WiFiClient client;
            result = httpUpdate.update(client, url);
        }

        switch (result) {
            case HTTP_UPDATE_OK:
                // rebootOnUpdate(true) means we never reach here
                Serial.println("OTA: update applied, rebooting");
                break;
            case HTTP_UPDATE_NO_UPDATES:
                Serial.println("OTA: server reported no update needed");
                resumeProcesses();
                break;
            case HTTP_UPDATE_FAILED:
                Serial.printf("OTA: failed (%d) %s\n",
                    httpUpdate.getLastError(),
                    httpUpdate.getLastErrorString().c_str());
                resumeProcesses();
                break;
        }
    }

    void resumeProcesses() {
        if (processManager) {
            processManager->startProcess("ble");
            processManager->startProcess("publish");
        }
    }
};

#endif // OTA_PROCESS_H
