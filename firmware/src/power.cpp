#include "power.h"

#include <WiFi.h>
#include <Wire.h>
#include <driver/gpio.h>
#include <driver/rtc_io.h>
#include <esp_sleep.h>

#include "config.h"
#include "log.h"

// MAX17048 fuel gauge (on the Feather, powered straight from the battery).
// We talk to its registers directly instead of using a library because the
// common library's begin() sends a reset command, which would throw away the
// gauge's learned state on every wake (and the first reading after a reset
// can be garbage).
static const uint8_t GAUGE_ADDR = 0x36;
static const uint8_t REG_VCELL = 0x02;  // 78.125 uV per LSB
static const uint8_t REG_SOC = 0x04;    // 1/256 % per LSB
static const uint8_t REG_VERSION = 0x08;
static const uint8_t REG_HIBRT = 0x0A;  // 0xFFFF = always hibernate (~3 uA)
static const uint8_t REG_CRATE = 0x16;  // signed, 0.208 %/h per LSB

static bool gaugeRead(uint8_t reg, uint16_t& out) {
  Wire.beginTransmission(GAUGE_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(GAUGE_ADDR, (uint8_t)2) != 2) return false;
  uint8_t msb = Wire.read(), lsb = Wire.read();
  out = (uint16_t)((msb << 8) | lsb);
  return true;
}

static bool gaugeWrite(uint8_t reg, uint16_t value) {
  Wire.beginTransmission(GAUGE_ADDR);
  Wire.write(reg);
  Wire.write((uint8_t)(value >> 8));
  Wire.write((uint8_t)(value & 0xff));
  return Wire.endTransmission() == 0;
}

namespace Power {

void earlyInit() {
  // Release pins we latched before the last sleep, then force everything off.
  gpio_hold_dis((gpio_num_t)PIN_EPD_RST);
  gpio_hold_dis((gpio_num_t)PIN_LED_PWR);
  gpio_hold_dis((gpio_num_t)NEOPIXEL_POWER);

  pinMode(PIN_LED_PWR, OUTPUT);
  digitalWrite(PIN_LED_PWR, LOW);        // heart LEDs unpowered
  pinMode(PIN_LED_DATA, OUTPUT);
  digitalWrite(PIN_LED_DATA, LOW);       // never drive DIN high while LEDs are unpowered
  pinMode(NEOPIXEL_POWER, OUTPUT);
  digitalWrite(NEOPIXEL_POWER, LOW);     // on-board NeoPixel off
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);        // red LED off
  pinMode(PIN_BUTTON, INPUT);            // external 100k pull-down
  pinMode(PIN_VBUS_SENSE, INPUT);        // external divider
}

WakeCause wakeCause() {
  switch (esp_sleep_get_wakeup_cause()) {
    case ESP_SLEEP_WAKEUP_TIMER: return WakeCause::Timer;
    case ESP_SLEEP_WAKEUP_EXT1: {
      uint64_t mask = esp_sleep_get_ext1_wakeup_status();
      if (mask & (1ULL << PIN_BUTTON)) return WakeCause::Button;
      if (mask & (1ULL << PIN_VBUS_SENSE)) return WakeCause::UsbPlugged;
      return WakeCause::Other;
    }
    case ESP_SLEEP_WAKEUP_UNDEFINED: return WakeCause::PowerOn;  // reset, power-on, first flash
    default: return WakeCause::Other;
  }
}

bool usbPresent() { return digitalRead(PIN_VBUS_SENSE) == HIGH; }
bool buttonPressed() { return digitalRead(PIN_BUTTON) == HIGH; }

uint32_t buttonHeldMs(uint32_t maxMs) {
  uint32_t start = millis();
  while (buttonPressed() && millis() - start < maxMs) delay(20);
  return millis() - start;
}

Battery readBattery() {
  Battery b{};
  b.usb = usbPresent();
  pinMode(PIN_I2C_POWER, OUTPUT);
  digitalWrite(PIN_I2C_POWER, HIGH);  // I2C pull-ups live on this switched rail
  delay(3);
  Wire.begin();
  uint16_t version = 0, vcell = 0, soc = 0, crate = 0, hibrt = 0;
  if (gaugeRead(REG_VERSION, version) && (version & 0xFFF0) == 0x0010 &&
      gaugeRead(REG_VCELL, vcell) && gaugeRead(REG_SOC, soc) && gaugeRead(REG_CRATE, crate)) {
    b.ok = true;
    b.volts = vcell * 78.125e-6f;
    float pct = soc / 256.0f;
    b.pct = pct < 0 ? 0 : (pct > 100 ? 100 : pct);  // can read 100-104 % when full
    b.rate = (int16_t)crate * 0.208f;
    // Hibernate: ~3 uA instead of ~23 uA; it still tracks charge (samples every 45 s).
    if (gaugeRead(REG_HIBRT, hibrt) && hibrt != 0xFFFF) gaugeWrite(REG_HIBRT, 0xFFFF);
  } else {
    LOGF("fuel gauge not answering at 0x36 (version=0x%04x)", version);
  }
  return b;
}

static void pinsSafeForSleep() {
  // Heart LEDs: gate pulled low by its own 100k, but latch it low as well.
  digitalWrite(PIN_LED_PWR, LOW);
  gpio_hold_en((gpio_num_t)PIN_LED_PWR);
  pinMode(PIN_LED_DATA, INPUT);            // hi-Z so nothing back-powers the LEDs

  // On-board NeoPixel power and I2C rail off (the I2C rail has a 10k pull-down;
  // leaving it high costs ~330 uA).
  digitalWrite(NEOPIXEL_POWER, LOW);
  gpio_hold_en((gpio_num_t)NEOPIXEL_POWER);
  Wire.end();
  digitalWrite(PIN_I2C_POWER, LOW);

  // E-paper: SPI lines floating, RST optionally held low (see config.h).
  pinMode(PIN_EPD_CS, INPUT);
  pinMode(PIN_EPD_DC, INPUT);
  pinMode(SCK, INPUT);
  pinMode(MOSI, INPUT);
#if EPD_HOLD_RST_LOW_IN_SLEEP
  pinMode(PIN_EPD_RST, OUTPUT);
  digitalWrite(PIN_EPD_RST, LOW);
  gpio_hold_en((gpio_num_t)PIN_EPD_RST);
#else
  pinMode(PIN_EPD_RST, INPUT);
#endif
}

void deepSleep(uint32_t seconds, bool wakeOnButton, bool wakeOnUsb) {
  LOGF("sleeping %lu s (button=%d usb=%d)", (unsigned long)seconds, wakeOnButton, wakeOnUsb);
  if (Serial) Serial.flush();
  WiFi.mode(WIFI_OFF);
  btStop();
  pinsSafeForSleep();

  if (seconds > 0) esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);

  // Both wake pins are active-HIGH with external pull-downs, so one EXT1 group
  // (ANY_HIGH) covers them and the RTC peripherals can stay powered down.
  uint64_t mask = 0;
  if (wakeOnButton) mask |= 1ULL << PIN_BUTTON;
  if (wakeOnUsb && !usbPresent()) mask |= 1ULL << PIN_VBUS_SENSE;  // only arm if not already high
  if (mask) {
    rtc_gpio_pullup_dis((gpio_num_t)PIN_BUTTON);
    rtc_gpio_pulldown_dis((gpio_num_t)PIN_BUTTON);
    rtc_gpio_pullup_dis((gpio_num_t)PIN_VBUS_SENSE);
    rtc_gpio_pulldown_dis((gpio_num_t)PIN_VBUS_SENSE);
    esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_HIGH);
  }
  esp_deep_sleep_start();
}

}  // namespace Power
