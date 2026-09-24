// power.h - battery gauge, USB detection, button, and deep sleep.
#pragma once
#include <Arduino.h>

struct Battery {
  bool ok;        // fuel gauge answered
  float volts;    // cell voltage
  float pct;      // state of charge 0..100 (clamped)
  float rate;     // %/hour, positive while charging
  bool usb;       // USB power present
};

enum class WakeCause { PowerOn, Timer, Button, UsbPlugged, Other };

namespace Power {
void earlyInit();                    // first thing in setup(): make every output safe
WakeCause wakeCause();
bool usbPresent();
bool buttonPressed();
uint32_t buttonHeldMs(uint32_t maxMs);  // how long the button stays pressed (up to maxMs)
Battery readBattery();
// Configure wake sources and sleep. Never returns.
void deepSleep(uint32_t seconds, bool wakeOnButton, bool wakeOnUsb);
}  // namespace Power
