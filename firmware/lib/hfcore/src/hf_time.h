// hf_time.h - parse the HTTP "Date" header (RFC 7231 IMF-fixdate) into Unix time.
// GitHub's API sends the exact time with every response, so the frame never needs NTP.
#pragma once
#include <stdint.h>
#include <time.h>

namespace hf {
// "Wed, 23 Sep 2026 23:07:34 GMT" -> 1790204854. Returns 0 if it can't parse.
time_t parseHttpDate(const char* s);
// Days since 1970-01-01 for a civil date (proleptic Gregorian), no timezone involved.
int64_t daysFromCivil(int y, unsigned m, unsigned d);
}  // namespace hf
