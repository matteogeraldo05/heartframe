// net.h - Wi-Fi: fast reconnect using the credentials saved by the setup portal.
#pragma once
#include <Arduino.h>

namespace Net {
bool connect(uint32_t timeoutMs);     // uses saved credentials; false if none or failed
void off();
bool hasSavedCredentials();
bool runPortal(const char* apName, const char* apPass);  // blocking captive portal
void forgetCredentials();
String apName();                      // "HeartFrame-1A2B"
int rssi();
}  // namespace Net
