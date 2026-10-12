#include "watchdog.h"

#include <esp_system.h>
#include <esp_timer.h>

// RTC_NOINIT survives esp_restart() and deep sleep, but not a power-on, so the magic
// value tells a real watchdog restart apart from garbage after power-up.
static constexpr uint32_t MAGIC = 0x48465744;  // "HFWD"
RTC_NOINIT_ATTR static uint32_t s_magic;
RTC_NOINIT_ATTR static uint32_t s_pending;     // MAGIC while a watchdog restart is in flight
RTC_NOINIT_ATTR static uint32_t s_trips;

static esp_timer_handle_t s_timer = nullptr;

static void onTimeout(void*) {
  // Runs in the esp_timer task. No logging here: the stuck code may hold the Serial lock.
  s_pending = MAGIC;
  s_trips++;
  esp_restart();  // runs the Wi-Fi shutdown handlers, then a clean software reset
}

static void start(uint32_t limitSec) {
  if (!s_timer) return;
  esp_timer_stop(s_timer);  // fine if it wasn't running
  esp_timer_start_once(s_timer, (uint64_t)limitSec * 1000000ULL);
}

namespace Watchdog {

bool begin(uint32_t limitSec) {
  if (s_magic != MAGIC) {  // first boot after power-on
    s_magic = MAGIC;
    s_trips = 0;
    s_pending = 0;
  }
  const bool tripped = s_pending == MAGIC && esp_reset_reason() == ESP_RST_SW;
  s_pending = 0;
  const esp_timer_create_args_t args = {.callback = onTimeout, .arg = nullptr, .dispatch_method = ESP_TIMER_TASK,
                                        .name = "hf-watchdog", .skip_unhandled_events = true};
  if (!s_timer && esp_timer_create(&args, &s_timer) != ESP_OK) s_timer = nullptr;
  start(limitSec);
  return tripped;
}

void extend(uint32_t limitSec) { start(limitSec); }

void pause() {
  if (s_timer) esp_timer_stop(s_timer);
}

uint32_t trips() { return s_magic == MAGIC ? s_trips : 0; }

}  // namespace Watchdog
