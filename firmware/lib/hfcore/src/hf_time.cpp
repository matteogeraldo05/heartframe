#include "hf_time.h"

#include <stdio.h>
#include <string.h>

namespace hf {

int64_t daysFromCivil(int y, unsigned m, unsigned d) {
  // Howard Hinnant's algorithm.
  y -= m <= 2;
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int64_t)doe - 719468;
}

time_t parseHttpDate(const char* s) {
  if (s == nullptr) return 0;
  char wday[4] = {0}, mon[4] = {0}, zone[4] = {0};
  int day, year, hh, mm, ss;
  if (sscanf(s, "%3s, %d %3s %d %d:%d:%d %3s", wday, &day, mon, &year, &hh, &mm, &ss, zone) != 8) return 0;
  if (strcmp(zone, "GMT") != 0) return 0;
  static const char* months = "JanFebMarAprMayJunJulAugSepOctNovDec";
  const char* p = strstr(months, mon);
  if (p == nullptr || strlen(mon) != 3) return 0;
  unsigned month = (unsigned)((p - months) / 3 + 1);
  if (day < 1 || day > 31 || year < 2020 || hh > 23 || mm > 59 || ss > 60) return 0;
  int64_t days = daysFromCivil(year, month, (unsigned)day);
  return (time_t)(days * 86400 + hh * 3600 + mm * 60 + ss);
}

}  // namespace hf
