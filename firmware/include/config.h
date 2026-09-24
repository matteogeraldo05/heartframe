// config.h - everything you might want to change lives here.
#pragma once
#include <Arduino.h>

// ----------------------------------------------------------------------------
// Firmware identity. Bump FW_BUILD by 1 for every build you publish over the air.
// tools/ota_keys.py reads the "HFBUILD:<n>;" marker from the .bin, so the two
// can never disagree.
// ----------------------------------------------------------------------------
#define FW_NAME "1.0.0"
#define FW_BUILD 1

// ----------------------------------------------------------------------------
// Pins - Adafruit ESP32-S3 Feather (#5323 8 MB / #5477 4 MB+PSRAM)
//   e-paper SCK  -> SCK  (GPIO36)      e-paper DIN -> MO (GPIO35)
// ----------------------------------------------------------------------------
static constexpr int PIN_EPD_CS = 10;      // D10
static constexpr int PIN_EPD_DC = 9;       // D9
static constexpr int PIN_EPD_RST = 6;      // D6
static constexpr int PIN_EPD_BUSY = 5;     // D5
static constexpr int PIN_LED_DATA = 12;    // D12 -> 330 ohm -> first WS2812 DIN
static constexpr int PIN_LED_PWR = 11;     // D11 -> 2N7000 gate; HIGH = heart LEDs powered
static constexpr int PIN_BUTTON = 17;      // A1: button to 3V3, 100k pull-down; HIGH = pressed (RTC GPIO, wakes from sleep)
static constexpr int PIN_VBUS_SENSE = 16;  // A2: USB 5V via 100k/150k divider; HIGH = USB power present (RTC GPIO)

// ----------------------------------------------------------------------------
// Heart LEDs (your leftover WS2812B). Colour/brightness come from the manifest,
// these are only defaults and limits.
// ----------------------------------------------------------------------------
static constexpr int LED_COUNT = 4;
#define LED_ORDER NEO_GRB           // WS2812B = GRB. SK6812 RGBW would be NEO_GRBW (and code changes).
static constexpr uint8_t LED_ABS_MAX = 200;  // hard ceiling regardless of manifest (current + heat)

// ----------------------------------------------------------------------------
// E-paper panel. Waveshare 4.2" V2 (sticker "V2" / Rev 2.x, SSD1683) = GDEY042T81.
// If you somehow get an old V1 (UC8176), change to 0 and it uses GxEPD2_420.
// ----------------------------------------------------------------------------
#define EPD_IS_GDEY042T81 1
// Hold the panel's RST low during deep sleep. On Waveshare "5V-compatible"
// modules this also powers down the level shifter (lower sleep current).
// Measure both ways in Milestone 3 and keep whichever reads lower.
#define EPD_HOLD_RST_LOW_IN_SLEEP 1
// 0 or 2 (upside down). Pick whichever shows the `epd` test pattern the right way up
// with the flex cable on the edge where it sits in the enclosure (fpc_edge in the .scad).
#define EPD_ROTATION 0

// Top-right corner reserved for the battery overlay (the web app greys it out).
static constexpr int OVERLAY_X = 318, OVERLAY_Y = 2, OVERLAY_W = 80, OVERLAY_H = 22;

// ----------------------------------------------------------------------------
// Battery policy (volts are measured at rest, before Wi-Fi is switched on).
// ----------------------------------------------------------------------------
static constexpr float BATT_CRITICAL_V = 3.45f;  // show "charge me" screen, stop using Wi-Fi
static constexpr float BATT_LED_MIN_V = 3.60f;   // below this, skip the heart pulse (WS2812 min is 3.5 V)
static constexpr int BATT_LOW_PCT = 15;          // show the small "charge me" pill
static constexpr int BATT_OTA_MIN_PCT = 40;      // firmware updates only above this (or on USB)
static constexpr int BATT_STEP_PCT = 5;          // redraw the % only when it moves this much

// ----------------------------------------------------------------------------
// Timing
// ----------------------------------------------------------------------------
static constexpr uint32_t WIFI_TIMEOUT_MS = 15000;
static constexpr uint32_t HTTP_TIMEOUT_MS = 15000;
static constexpr uint32_t BUTTON_LONG_MS = 5000;        // hold to open Wi-Fi setup
static constexpr uint32_t PORTAL_TIMEOUT_S = 600;       // Wi-Fi setup page closes after 10 min
static constexpr uint32_t FULL_REFRESH_EVERY_S = 20 * 3600;  // Waveshare: refresh at least every 24 h
static constexpr uint32_t OFFLINE_ICON_AFTER_S = 48 * 3600;  // small cloud icon if no sync for 2 days
static constexpr uint32_t SETUP_SLEEP_S = 6 * 3600;

// Shown when there is no message yet (keep it short, drawn with a built-in font).
#define WELCOME_LINE1 "Hi you"
#define WELCOME_LINE2 "Your first message is on its way"

#define HF_USER_AGENT "heart-frame/" FW_NAME
