// watchdog.h - safety net for a wake that never finishes.
// The frame has no on/off switch and its reset button is inside the case, so if a
// wake ever hangs (a stalled TLS read, a driver bug...) nobody could restart it and it
// would sit awake until the battery is flat. This timer restarts the chip if a wake
// runs longer than AWAKE_LIMIT_S, and the next boot goes straight back to sleep until
// the next normal check (so a hang that repeats costs one check, not the battery).
#pragma once
#include <Arduino.h>

namespace Watchdog {
// Call first thing in setup(). Returns true if the previous wake was cut short by the
// watchdog; the caller should then go back to sleep without doing anything else.
bool begin(uint32_t limitSec);
void extend(uint32_t limitSec);  // restart the countdown with a new limit (Wi-Fi setup)
void pause();                    // USB console open: a person is at the keyboard
uint32_t trips();                // restarts since power-on (shown by `status`)
}  // namespace Watchdog
