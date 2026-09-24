// display.h - the 4.2" e-paper. Every visible change is a FULL refresh (about 4 s,
// flashes black/white once). No partial refreshes: they ghost, and on Waveshare
// modules the controller forgets the old image during deep sleep anyway.
#pragma once
#include <Arduino.h>

namespace Icons {
static constexpr uint8_t CHARGING = 1 << 0;
static constexpr uint8_t OFFLINE = 1 << 1;  // no successful sync for a while
static constexpr uint8_t LOW_BATT = 1 << 2;
}  // namespace Icons

struct Overlay {
  int pct;        // battery percent to print (-1 = gauge missing)
  uint8_t icons;  // Icons::*
};

namespace Display {
void begin();
void showMessage(const uint8_t* pixels /*15000 bytes, 1 = black*/, const Overlay& ov);
void showWelcome(const Overlay& ov);
void showSetupNeeded();
void showPortal(const char* apName, const char* apPass);
void showChargeMe();
void showTestPattern();
void sleep();  // hibernate the controller (call after every refresh)
}  // namespace Display
