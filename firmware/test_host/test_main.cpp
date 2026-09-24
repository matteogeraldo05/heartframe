// Host (Linux/macOS) tests for lib/hfcore - the logic that must match the web app.
// Vectors in ./vectors are produced by the web app's own encryptor (webapp/test/crypto.test.ts),
// so these tests prove the C++ decryptor and the TypeScript encryptor agree.
//   make -C test_host MBEDTLS=/path/to/mbedtls-3.6   (see Makefile)
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "hf_crypto.h"
#include "hf_format.h"
#include "hf_manifest.h"
#include "hf_schedule.h"
#include "hf_time.h"

static int failures = 0;
#define CHECK(cond)                                                             \
  do {                                                                          \
    if (!(cond)) { std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); failures++; } \
  } while (0)

static std::vector<uint8_t> readFile(const std::string& name) {
  std::ifstream f("vectors/" + name, std::ios::binary);
  if (!f) { std::printf("missing vector %s - run `npm test` in webapp/ first\n", name.c_str()); std::exit(2); }
  return std::vector<uint8_t>(std::istreambuf_iterator<char>(f), {});
}

static void testEnvelopes() {
  auto key = readFile("key.bin");
  auto menv = readFile("manifest.hfe");
  auto mplain = readFile("manifest_plain.json");
  std::vector<uint8_t> out(menv.size());
  int n = hf::envelopeOpen(key.data(), menv.data(), menv.size(), hf::kKindManifest, out.data(), out.size());
  CHECK(n == (int)mplain.size());
  CHECK(n > 0 && std::memcmp(out.data(), mplain.data(), n) == 0);
  // Same file presented as a bitmap must fail (kind is authenticated).
  CHECK(hf::envelopeOpen(key.data(), menv.data(), menv.size(), hf::kKindBitmap, out.data(), out.size()) == -1);

  auto benv = readFile("bitmap.hfe");
  auto bplain = readFile("bitmap_plain.bin");
  std::vector<uint8_t> bout(benv.size());
  n = hf::envelopeOpen(key.data(), benv.data(), benv.size(), hf::kKindBitmap, bout.data(), bout.size());
  CHECK(n == (int)hf::kBitmapFileLen);
  CHECK(std::memcmp(bout.data(), bplain.data(), hf::kBitmapFileLen) == 0);
  CHECK(hf::bitmapHeaderOk(bout.data(), n));

  // One flipped bit anywhere -> rejected, and the output buffer is wiped.
  auto bad = benv;
  bad[500] ^= 0x01;
  CHECK(hf::envelopeOpen(key.data(), bad.data(), bad.size(), hf::kKindBitmap, bout.data(), bout.size()) == -1);
  CHECK(bout[100] == 0);
  auto wrongKey = key;
  wrongKey[0] ^= 1;
  CHECK(hf::envelopeOpen(wrongKey.data(), benv.data(), benv.size(), hf::kKindBitmap, bout.data(), bout.size()) == -1);
  // Too-small output buffer is refused, not overflowed.
  CHECK(hf::envelopeOpen(key.data(), benv.data(), benv.size(), hf::kKindBitmap, bout.data(), 100) == -1);
}

static void testManifest() {
  auto mplain = readFile("manifest_plain.json");
  static hf::Manifest m;
  CHECK(hf::parseManifest((const char*)mplain.data(), mplain.size(), m) == hf::ParseResult::Ok);
  CHECK(m.seq == 1766500000123ULL);
  CHECK(m.gen == 1766500000u);
  CHECK(m.count == 1 && std::strcmp(m.items[0].id, "abc123") == 0 && m.items[0].surprise);
  CHECK(m.cfg.checkMin == 60 && m.cfg.quietStart == 1380 && m.cfg.quietEnd == 420);
  CHECK(m.cfg.led[0] == 255 && m.cfg.led[1] == 8 && m.cfg.led[2] == 72);
  CHECK(!m.fw.present && !m.tok.present);

  // Out-of-range config is clamped (a server typo can't drain the battery).
  const char* j1 = R"({"v":1,"seq":5,"gen":1800000000,"cfg":{"chk":1,"chkUsb":99999,"ledMs":5},"items":[]})";
  CHECK(hf::parseManifest(j1, std::strlen(j1), m) == hf::ParseResult::Ok);
  CHECK(m.cfg.checkMin == 15 && m.cfg.checkUsbMin == 720 && m.cfg.ledMs == 1000);

  // Bad inputs.
  const char* j2 = R"({"v":2,"seq":5,"gen":1800000000,"items":[]})";
  CHECK(hf::parseManifest(j2, std::strlen(j2), m) == hf::ParseResult::BadVersion);
  const char* j3 = R"({"v":1,"seq":5,"gen":1800000000,"items":[{"id":"../x","at":1800000000,"sha":"00","len":15048}]})";
  CHECK(hf::parseManifest(j3, std::strlen(j3), m) == hf::ParseResult::BadField);
  CHECK(hf::parseManifest("{not json", 9, m) == hf::ParseResult::BadJson);

  // Items are sorted and selected by time.
  std::string sha(64, 'a');
  std::string j4 = std::string(R"({"v":1,"seq":5,"gen":1800000000,"items":[)") +
                   R"({"id":"c","at":1800000300,"sha":")" + sha + R"(","len":15048},)" +
                   R"({"id":"a","at":1800000100,"sha":")" + sha + R"(","len":15048},)" +
                   R"({"id":"b","at":1800000200,"sha":")" + sha + R"(","len":15048,"s":1}]})";
  CHECK(hf::parseManifest(j4.c_str(), j4.size(), m) == hf::ParseResult::Ok);
  CHECK(std::strcmp(m.items[0].id, "a") == 0 && std::strcmp(m.items[2].id, "c") == 0);
  CHECK(hf::currentIndex(m, 1800000000) == -1);
  CHECK(hf::currentIndex(m, 1800000150) == 0);
  CHECK(hf::currentIndex(m, 1800000200) == 1);
  CHECK(hf::nextIndex(m, 1800000200) == 2);
  CHECK(hf::nextIndex(m, 1800000300) == -1);
}

static void testSignature() {
  auto pub = readFile("fw_pub.der");
  auto sig = readFile("fw_sig.der");
  auto fw = readFile("fw.bin");
  uint8_t hash[32];
  hf::sha256(fw.data(), fw.size(), hash);
  char hex[65];
  hf::toHex(hash, 32, hex);
  auto expectHex = readFile("fw_sha.hex");
  CHECK(std::string(hex) == std::string(expectHex.begin(), expectHex.end()));
  CHECK(hf::ecdsaP256Verify(pub.data(), pub.size(), hash, sig.data(), sig.size()));
  hash[0] ^= 1;
  CHECK(!hf::ecdsaP256Verify(pub.data(), pub.size(), hash, sig.data(), sig.size()));
  // Streaming hash == one-shot hash.
  hf::Sha256 s;
  s.update(fw.data(), 10);
  s.update(fw.data() + 10, fw.size() - 10);
  uint8_t h2[32];
  s.finish(h2);
  hash[0] ^= 1;
  CHECK(std::memcmp(hash, h2, 32) == 0);
}

static void testTime() {
  CHECK(hf::parseHttpDate("Wed, 23 Sep 2026 23:07:34 GMT") == 1790204854);
  CHECK(hf::parseHttpDate("Thu, 01 Jan 1970 00:00:00 GMT") == 0);  // rejected (year < 2020) -> 0
  CHECK(hf::parseHttpDate("garbage") == 0);
  CHECK(hf::parseHttpDate("Fri, 25 Dec 2026 12:00:00 GMT") == 1798200000);
}

static void testSchedule() {
  hf::applyTimezone("EST5EDT,M3.2.0,M11.1.0");
  CHECK(hf::inQuiet(23 * 60, 1380, 420) && hf::inQuiet(3 * 60, 1380, 420) && !hf::inQuiet(7 * 60, 1380, 420));
  CHECK(!hf::inQuiet(12 * 60, 600, 600));
  // 2026-11-01 01:30 EDT happens twice; asking for "next 07:00" from Oct 31 22:00 EDT
  // must give Nov 1 07:00 EST = 12:00 UTC.
  const time_t oct31_22h = 1793498400;  // 2026-11-01 02:00 UTC = Oct 31 22:00 EDT
  CHECK(hf::nextLocalTime(oct31_22h, 7 * 60) == 1793534400);  // 2026-11-01 12:00 UTC

  hf::Config c;
  hf::defaultConfig(c);
  // Mid-afternoon on battery: next check in 60 min.
  const time_t afternoon = 1798218000;  // 2026-12-25 12:00 EST = 17:00 UTC
  hf::WakePlan p = hf::planWake({afternoon, true, false, &c, 0, 0});
  CHECK(p.sleepSec == 3600 && p.isCheck);
  // On USB: every 15 min.
  p = hf::planWake({afternoon, true, true, &c, 0, 0});
  CHECK(p.sleepSec == 900);
  // After one failure: retry in 5 min.
  p = hf::planWake({afternoon, true, false, &c, 1, 0});
  CHECK(p.sleepSec == 300);
  // A scheduled message in 20 minutes wins, as a display-only wake.
  p = hf::planWake({afternoon, true, false, &c, 0, afternoon + 1200});
  CHECK(p.sleepSec == 1200 && !p.isCheck);
  // 22:30: next check would be 23:30 (quiet) -> sleep until 07:00 = 8.5 h.
  const time_t late = 1798255800;  // 2026-12-25 22:30 EST
  p = hf::planWake({late, true, false, &c, 0, 0});
  CHECK(p.sleepSec == 8 * 3600 + 1800);
  // No valid clock: plain interval.
  p = hf::planWake({0, false, false, &c, 0, 0});
  CHECK(p.sleepSec == 3600);
  // A day of failures on battery: back off to 3 h.
  p = hf::planWake({afternoon, true, false, &c, 30, 0});
  CHECK(p.sleepSec == 3 * 3600);
}

int main() {
  testEnvelopes();
  testManifest();
  testSignature();
  testTime();
  testSchedule();
  if (failures) { std::printf("%d check(s) failed\n", failures); return 1; }
  std::printf("all hfcore host tests passed\n");
  return 0;
}
