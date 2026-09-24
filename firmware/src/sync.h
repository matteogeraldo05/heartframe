// sync.h - one network session: manifest, missing bitmaps, token rotation,
// optional firmware update and heartbeat. Wi-Fi is on only inside run().
#pragma once
#include <Arduino.h>

#include "hf_manifest.h"
#include "power.h"
#include "secrets.h"
#include "state.h"

enum class SyncErr : uint8_t { None = 0, NoWifi, Network, Auth, NotFound, Http, Decrypt, BadManifest, Rollback, Storage };
const char* syncErrName(SyncErr e);

struct SyncResult {
  bool attempted = false;
  bool wifiUp = false;
  bool manifestChanged = false;
  bool otaInstalled = false;   // caller must reboot
  SyncErr err = SyncErr::None;
};

namespace Sync {
// `m` holds the cached manifest on entry (if `haveManifest`) and the newest one on exit.
SyncResult run(Secrets& sec, Persisted& st, hf::Manifest& m, bool& haveManifest,
               const Battery& batt, bool allowOta);
}  // namespace Sync
