// state.h - what the frame remembers between wakes.
//   Persisted (NVS, survives power loss): anti-rollback counter, what is on screen, shown-message history.
//   RtcState (RTC RAM, survives deep sleep only): retry counters, Wi-Fi fast-connect hints.
#pragma once
#include <Arduino.h>

static constexpr int SHOWN_RING = 16;

struct Persisted {
  uint32_t magic;
  uint16_t version;
  uint64_t seq;             // highest manifest seq accepted (anti-rollback)
  char etag[72];            // ETag of the manifest we have (for If-None-Match)
  char screen[10];          // what is on the e-paper: "msg", "welcome", "portal", "charge", "setup"
  char shownId[25];         // last message drawn (kept while a status screen is up)
  char shownSha16[17];      // first 16 hex chars of its sha (cache file name)
  int8_t shownPct;          // battery % drawn on screen (-1 = none)
  uint8_t shownIcons;       // status icons drawn (bit flags, see Icons in display.h)
  uint32_t lastFull;        // unix time of last full refresh
  uint32_t fwTrying;        // OTA build we rebooted into and have not confirmed yet
  uint32_t fwBad;           // OTA build that failed; never retried
  uint8_t pendingPulse;     // new message arrived during quiet hours; pulse later
  uint8_t ringPos;
  char ring[SHOWN_RING][25];  // recently shown message ids (no repeat pulses)
};

struct RtcState {
  uint32_t magic;
  uint32_t boots;
  int32_t failStreak;       // consecutive failed syncs
  uint32_t lastSyncOk;      // unix time of last good sync
  uint32_t lastHeartbeat;
  uint8_t lastErr;          // SyncErr of the last attempt
  uint8_t bssid[6];
  int32_t channel;          // 0 = unknown
  uint8_t plannedCheck;     // this timer wake was planned as a network check
};

extern RtcState rtc;

namespace StateStore {
void load(Persisted& p);
void saveIfChanged(const Persisted& p);
void wipe();
bool wasShown(const Persisted& p, const char* id);
void markShown(Persisted& p, const char* id);
void rtcInitIfNeeded();
}  // namespace StateStore
