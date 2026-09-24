#include "state.h"

#include <Preferences.h>

RTC_DATA_ATTR RtcState rtc;

static const char* NS = "hfst";
static const uint32_t kMagic = 0x48465354;  // "HFST"
static const uint16_t kVersion = 1;
static Persisted g_loaded;                  // copy of what is in NVS, to skip redundant writes

namespace StateStore {

static void defaults(Persisted& p) {
  memset(&p, 0, sizeof(p));
  p.magic = kMagic;
  p.version = kVersion;
  p.shownPct = -1;
}

void load(Persisted& p) {
  defaults(p);
  Preferences prefs;
  if (prefs.begin(NS, true)) {
    Persisted tmp;
    size_t n = prefs.getBytes("s", &tmp, sizeof(tmp));
    prefs.end();
    if (n == sizeof(tmp) && tmp.magic == kMagic && tmp.version == kVersion) p = tmp;
  }
  g_loaded = p;
}

void saveIfChanged(const Persisted& p) {
  if (memcmp(&p, &g_loaded, sizeof(p)) == 0) return;  // NVS wear: only write real changes
  Preferences prefs;
  if (prefs.begin(NS, false)) {
    prefs.putBytes("s", &p, sizeof(p));
    prefs.end();
    g_loaded = p;
  }
}

void wipe() {
  Preferences prefs;
  if (prefs.begin(NS, false)) { prefs.clear(); prefs.end(); }
  defaults(g_loaded);
}

bool wasShown(const Persisted& p, const char* id) {
  for (int i = 0; i < SHOWN_RING; i++) {
    if (p.ring[i][0] && strcmp(p.ring[i], id) == 0) return true;
  }
  return false;
}

void markShown(Persisted& p, const char* id) {
  if (wasShown(p, id)) return;
  strlcpy(p.ring[p.ringPos % SHOWN_RING], id, sizeof(p.ring[0]));
  p.ringPos = (uint8_t)((p.ringPos + 1) % SHOWN_RING);
}

void rtcInitIfNeeded() {
  if (rtc.magic != kMagic) {  // first boot after power loss / reset
    memset(&rtc, 0, sizeof(rtc));
    rtc.magic = kMagic;
  }
  rtc.boots++;
}

}  // namespace StateStore
