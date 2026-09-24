#include "hf_schedule.h"

#include <stdlib.h>

namespace hf {

void applyTimezone(const char* posixTz) {
  setenv("TZ", posixTz, 1);
  tzset();
}

int localMinuteOfDay(time_t t) {
  struct tm tmv;
  localtime_r(&t, &tmv);
  return tmv.tm_hour * 60 + tmv.tm_min;
}

bool inQuiet(int m, int qs, int qe) {
  if (qs == qe) return false;
  if (qs < qe) return m >= qs && m < qe;  // e.g. 01:00-06:00
  return m >= qs || m < qe;               // wraps midnight, e.g. 23:00-07:00
}

time_t nextLocalTime(time_t after, int minuteOfDay) {
  struct tm tmv;
  localtime_r(&after, &tmv);
  for (int dayOffset = 0; dayOffset < 3; dayOffset++) {
    struct tm cand = tmv;
    cand.tm_mday += dayOffset;
    cand.tm_hour = minuteOfDay / 60;
    cand.tm_min = minuteOfDay % 60;
    cand.tm_sec = 0;
    cand.tm_isdst = -1;  // let mktime work out DST
    time_t t = mktime(&cand);
    if (t > after) return t;
  }
  return after + 24 * 3600;  // unreachable in practice
}

static const uint32_t kMinSleep = 60;
static const uint32_t kMaxSleep = 24 * 3600;

WakePlan planWake(const WakeInput& in) {
  const Config& c = *in.cfg;
  uint32_t interval = (uint32_t)(in.onUsb ? c.checkUsbMin : c.checkMin) * 60u;

  // After a failure retry sooner (5, 15, 30 min), then fall back to the normal
  // interval. After a full day of failures on battery, back off to 3 h so a dead
  // router cannot flatten the battery.
  if (in.failStreak > 0) {
    static const uint32_t retry[3] = {5 * 60, 15 * 60, 30 * 60};
    if (in.failStreak <= 3) {
      uint32_t r = retry[in.failStreak - 1];
      if (r < interval) interval = r;
    } else if (in.failStreak > 24 && !in.onUsb && interval < 3 * 3600u) {
      interval = 3 * 3600u;
    }
  }

  WakePlan plan{interval, true};
  if (!in.timeValid) {
    if (plan.sleepSec < kMinSleep) plan.sleepSec = kMinSleep;
    return plan;
  }

  time_t tCheck = in.now + interval;
  if (inQuiet(localMinuteOfDay(tCheck), c.quietStart, c.quietEnd)) {
    tCheck = nextLocalTime(tCheck, c.quietEnd);  // first moment the quiet window ends
  }
  time_t tWake = tCheck;
  if (in.nextShowAt > in.now && in.nextShowAt < tWake) {
    tWake = in.nextShowAt;  // wake exactly when a scheduled message is due
    plan.isCheck = false;
  }
  time_t delta = tWake - in.now;
  if (delta < (time_t)kMinSleep) delta = kMinSleep;
  if (delta > (time_t)kMaxSleep) delta = kMaxSleep;
  plan.sleepSec = (uint32_t)delta;
  return plan;
}

}  // namespace hf
