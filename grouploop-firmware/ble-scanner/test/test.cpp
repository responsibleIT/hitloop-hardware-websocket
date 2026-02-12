/*
  Reading and controlling the very low power LIS2DH12
  Author: Nathan Seidle
  Created: Septempter 18th, 2019
  License: This code is Lemonadeware; do whatever you want with this code.
  If you see me (or any other SparkFun employee) at the
  local, and you've found our code helpful, please buy us a round!

  This example demonstrates how to read XYZ from the LIS2DH12.

  Feel like supporting open source hardware?
  Buy a board from SparkFun!
  Edge: https://www.sparkfun.com/products/15170
  Edge 2: https://www.sparkfun.com/products/15420
  Qwiic LIS2DH12 Breakout: https://www.sparkfun.com/products/15760

  Hardware Connections:
  Plug a Qwiic cable into the Qwiic Accelerometer RedBoard Qwiic or BlackBoard
  If you don't have a platform with a Qwiic connection use the SparkFun Qwiic Breadboard Jumper (https://www.sparkfun.com/products/14425)
  Open the serial monitor at 115200 baud to see the output
*/

#include <Wire.h>
#include <Adafruit_NeoPixel.h>

#include "SparkFun_LIS2DH12.h" //Click here to get the library: http://librarymanager/All#SparkFun_LIS2DH12
SPARKFUN_LIS2DH12 accel;       // Create instance

// Which pin on the Arduino is connected to the NeoPixels?
// On a Trinket or Gemma we suggest changing this to 1:
#define LED_PIN D1

// How many NeoPixels are attached to the Arduino?
#define LED_COUNT 6

// Declare our NeoPixel strip object:
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

void setup()
{
    Serial.begin(115200);
    Serial.println("SparkFun Accel Example");

    Wire.begin();
    Wire.setClock(1000000);

    if (accel.begin() == false)
    {
        Serial.println("Accelerometer not detected. Check address jumper and wiring. Freezing...");
        while (1)
            ;
    }

    accel.setMode(LIS2DH12_HR_12bit);
    accel.setDataRate(LIS2DH12_ODR_1kHz620_LP);

    strip.begin();            // INITIALIZE NeoPixel strip object (REQUIRED)
    strip.show();             // Turn OFF all pixels ASAP
    strip.setBrightness(255); // Set BRIGHTNESS to about 1/5 (max = 255)
}

float mapf(float value, float inLower, float inUpper, float outLower, float outUpper)
{
    return (value / (inUpper - inLower)) * (outUpper - outLower) + outLower;
}

void loop()
{
    // Print accel values only if new data is available
    if (accel.available())
    {
        float accelX = accel.getX() / 980.0f;
        float accelY = accel.getY() / 980.0f;
        float accelZ = accel.getZ() / 980.0f;

        // accelX = (uint8_t)constrain(mapf(accelX, -1.0, 1.0, 0.0, 255.0), 0, 255.0);
        // accelY = (uint8_t)constrain(mapf(accelY, -1.0, 1.0, 0.0, 255.0), 0, 255.0);
        // accelZ = (uint8_t)constrain(mapf(accelZ, -1.0, 1.0, 0.0, 255.0), 0, 255.0);

        float magnitude = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ) - 1.0f;

        uint8_t shade = constrain(mapf(magnitude, 0.0f, 1.0f, 0.0f, 255.0f), 0, 255);
        shade = shade > 150 ? shade : 0;

        Serial.print(String(shade) + "\n");

        strip.fill(strip.Color(shade, shade, shade));
        // strip.setPixelColor(0, strip.Color(accelX, accelY, accelZ));
        // strip.setPixelColor(1, strip.Color(accelY, accelZ, accelX));
        // strip.setPixelColor(2, strip.Color(accelZ, accelX, accelY));
        // strip.setPixelColor(3, strip.Color(accelX, accelX, accelY));
        // strip.setPixelColor(4, strip.Color(accelY, accelX, accelZ));
        // strip.setPixelColor(5, strip.Color(accelZ, accelY, accelX));

        strip.show();
    }
}
