#include "leds.h"

#include <Adafruit_NeoPixel.h>
#include <math.h>

#include "config.h"
#include "log.h"

static Adafruit_NeoPixel g_strip(LED_COUNT, PIN_LED_DATA, LED_ORDER + NEO_KHZ800);
static TaskHandle_t g_task = nullptr;
static volatile bool g_running = false;

struct Job {
  Pattern pattern;
  uint8_t rgb[3];
  uint8_t maxB;
  uint32_t ms;
};
static Job g_job;

static void powerOn() {
  digitalWrite(PIN_LED_PWR, HIGH);  // 2N7000 pulls the P-MOSFET gate low -> LEDs get VBAT
  delay(10);                        // let the soft-start RC settle and the LEDs reset
  g_strip.begin();
  g_strip.clear();
  g_strip.show();
}

static void powerOff() {
  g_strip.clear();
  g_strip.show();
  delay(1);
  pinMode(PIN_LED_DATA, OUTPUT);
  digitalWrite(PIN_LED_DATA, LOW);   // data low BEFORE removing power (no back-powering via DIN)
  digitalWrite(PIN_LED_PWR, LOW);
}

// level 0..1 -> perceptually smooth brightness, capped.
static void setLevel(const Job& j, float level) {
  if (level < 0) level = 0;
  if (level > 1) level = 1;
  uint8_t cap = j.maxB > LED_ABS_MAX ? LED_ABS_MAX : j.maxB;
  uint8_t g = Adafruit_NeoPixel::gamma8((uint8_t)(level * 255.0f + 0.5f));
  uint32_t scale = (uint32_t)g * cap;  // 0..255*255
  uint8_t r = (uint8_t)(j.rgb[0] * scale / 65025);
  uint8_t gg = (uint8_t)(j.rgb[1] * scale / 65025);
  uint8_t b = (uint8_t)(j.rgb[2] * scale / 65025);
  for (int i = 0; i < LED_COUNT; i++) g_strip.setPixelColor(i, r, gg, b);
  g_strip.show();
}

static float heartbeatLevel(uint32_t t) {
  // "lub-dub" every 1.4 s: strong beat, short gap, softer beat, rest.
  const uint32_t cycle = 1400, ph = t % cycle;
  auto bump = [](float x) { return x <= 0 || x >= 1 ? 0.0f : sinf((float)M_PI * x); };
  return bump((float)ph / 260.0f) + 0.6f * bump(((int)ph - 330) / 260.0f);
}

static void task(void*) {
  const Job j = g_job;
  powerOn();
  const uint32_t start = millis();
  for (;;) {
    uint32_t t = millis() - start;
    if (t >= j.ms) break;
    float level;
    switch (j.pattern) {
      case Pattern::Heartbeat: level = heartbeatLevel(t); break;
      case Pattern::Ack: level = sinf((float)M_PI * t / j.ms); break;
      case Pattern::Breathe:
      default: {
        // Two slow breaths across the whole duration (5 s each for 10 s).
        float x = (float)t / (j.ms / 2.0f);
        level = 0.5f - 0.5f * cosf(2.0f * (float)M_PI * x);
      }
    }
    setLevel(j, level);
    vTaskDelay(pdMS_TO_TICKS(15));
  }
  powerOff();
  g_running = false;
  g_task = nullptr;
  vTaskDelete(nullptr);
}

namespace Leds {

void start(Pattern p, const uint8_t rgb[3], uint8_t maxBrightness, uint32_t durationMs) {
  if (g_running) return;
  g_job = Job{p, {rgb[0], rgb[1], rgb[2]}, maxBrightness, durationMs};
  g_running = true;
  // Core 0: the main code (e-paper refresh) keeps running on core 1 meanwhile.
  if (xTaskCreatePinnedToCore(task, "heart", 4096, nullptr, 1, &g_task, 0) != pdPASS) {
    g_running = false;
    LOGF("could not start LED task");
  }
}

void waitDone() {
  while (g_running) delay(10);
}

void solid(uint8_t r, uint8_t g, uint8_t b, uint8_t bright) {
  waitDone();
  powerOn();
  if (bright > LED_ABS_MAX) bright = LED_ABS_MAX;
  for (int i = 0; i < LED_COUNT; i++)
    g_strip.setPixelColor(i, (uint8_t)(r * bright / 255), (uint8_t)(g * bright / 255), (uint8_t)(b * bright / 255));
  g_strip.show();
}

void off() {
  waitDone();
  powerOff();
}

}  // namespace Leds
