// leds.h - the pink heart. LEDs are powered only while animating (P-MOSFET high-side
// switch), because idle WS2812s draw ~0.5-1 mA each even when "off".
#pragma once
#include <Arduino.h>

enum class Pattern { Breathe, Heartbeat, Ack };

namespace Leds {
// Start an animation on the other CPU core; returns immediately.
void start(Pattern p, const uint8_t rgb[3], uint8_t maxBrightness, uint32_t durationMs);
void waitDone();                                                // block until finished + power off
void solid(uint8_t r, uint8_t g, uint8_t b, uint8_t bright);    // console colour tuning
void off();
}  // namespace Leds
