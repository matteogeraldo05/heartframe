// console.h - USB serial console for provisioning and bench tests.
// Only reachable with a cable and a terminal open (e.g. `tio /dev/ttyACM0`).
#pragma once
#include <Arduino.h>

#include "hf_manifest.h"
#include "state.h"

namespace Console {
// If a terminal is attached, offer the console for a few seconds. Returns when
// the user types `exit`, after 2 minutes of silence, or right away if nobody is there.
void maybeRun(Persisted& st);
}  // namespace Console
