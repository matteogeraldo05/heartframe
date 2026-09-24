// hf_schedule.h - quiet hours and "when do I wake up next?" logic (pure, host-testable).
// Local time uses the POSIX TZ string from the manifest; call applyTimezone() first.
#pragma once
#include <stdint.h>
#include <time.h>

#include "hf_manifest.h"

namespace hf {

void applyTimezone(const char* posixTz);

// True if `t` looks like a real date (the RTC loses time after a power cut).
inline bool timeLooksValid(time_t t) { return t > 1700000000; }

// Minutes after local midnight (0..1439).
int localMinuteOfDay(time_t t);

// Quiet window is [qs, qe) in local minutes, possibly wrapping past midnight.
// qs == qe means "no quiet hours".
bool inQuiet(int minuteOfDay, int qs, int qe);

// Next time strictly after `after` whose local wall-clock time is `minuteOfDay` (DST-safe).
time_t nextLocalTime(time_t after, int minuteOfDay);

struct WakeInput {
  time_t now;
  bool timeValid;
  bool onUsb;
  const Config* cfg;
  int failStreak;        // consecutive failed syncs (0 = last sync fine)
  time_t nextShowAt;     // `at` of the next scheduled message, or 0
};

struct WakePlan {
  uint32_t sleepSec;     // how long to deep sleep
  bool isCheck;          // true = network check at wake; false = display-only wake for a scheduled message
};

WakePlan planWake(const WakeInput& in);

}  // namespace hf
