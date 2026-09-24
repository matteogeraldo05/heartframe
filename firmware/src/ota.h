// ota.h - (stretch goal) signed firmware updates pulled from the messages repo.
// The .bin must be signed with the ECDSA P-256 key whose public half is in
// include/ota_pubkey.h. The web server cannot sign, so a hacked server can
// push messages but never firmware. The bootloader rolls back automatically
// if the new build crashes before it confirms itself.
#pragma once
#include <Arduino.h>

#include "github.h"
#include "hf_manifest.h"
#include "power.h"
#include "state.h"

namespace Ota {
bool enabled();
void onBoot(Persisted& st);        // bookkeeping after an update or a rollback
bool pendingVerify();              // running a fresh update that has not been confirmed yet
void confirm(bool ok);             // mark valid, or roll back (reboots)
// Download + verify + install. Returns true when the new image is ready (caller reboots).
bool maybeUpdate(RepoClient& gh, const hf::FwInfo& fw, const Battery& b, Persisted& st);
}  // namespace Ota
