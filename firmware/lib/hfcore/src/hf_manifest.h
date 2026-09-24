// hf_manifest.h - the manifest the web app publishes (encrypted) to the messages repo.
//
// Plaintext JSON (inside an HFE1 kind=1 envelope), all times are Unix seconds UTC:
// {
//   "v": 1,                      format version
//   "seq": 1766500000123,        publish counter (ms since epoch); the frame rejects older seq (anti-rollback)
//   "gen": 1766500000,           server time when published
//   "cfg": { "tz": "EST5EDT,M3.2.0,M11.1.0", "chk": 60, "chkUsb": 15,
//            "qs": 1380, "qe": 420,           quiet hours start/end, minutes after local midnight
//            "led": [255, 8, 72], "ledMax": 160, "ledMs": 10000,
//            "hb": "https://hc-ping.com/<uuid>", "hbH": 6 },
//   "items": [ { "id": "k3v9x2", "at": 1766664000, "sha": "<64 hex of the .hfe file>",
//                "len": 15048, "s": 0 } ],          s = 1 for a "surprise" (different LED pattern)
//   "fw":  { "ver": 2, "name": "1.0.1", "path": "fw/2.bin", "len": 1234567,
//            "sha": "<64 hex of the .bin>", "sig": "<base64 DER ECDSA P-256>" },   optional
//   "tok": { "gen": 2, "val": "github_pat_..." }                                  optional
// }
// The bitmap for an item lives at "b/<sha>.hfe" in the repo.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace hf {

constexpr int kMaxItems = 40;

struct Item {
  char id[25];
  uint32_t at;
  char sha[65];
  uint32_t len;
  bool surprise;
};

struct Config {
  char tz[48];
  uint16_t checkMin;      // minutes between checks on battery
  uint16_t checkUsbMin;   // minutes between checks on USB power
  int16_t quietStart;     // minutes after local midnight; quietStart == quietEnd -> no quiet hours
  int16_t quietEnd;
  uint8_t led[3];         // RGB
  uint8_t ledMax;         // brightness cap 0..255
  uint16_t ledMs;         // pulse length
  char hb[112];           // heartbeat URL ("" = off)
  uint16_t hbHours;       // heartbeat every N hours
};

struct FwInfo {
  bool present;
  uint32_t ver;
  char name[16];
  char path[64];
  uint32_t len;
  char sha[65];
  char sig[160];
};

struct TokInfo {
  bool present;
  uint32_t gen;
  char val[128];
};

struct Manifest {
  uint32_t v;
  uint64_t seq;
  uint32_t gen;
  Config cfg;
  int count;
  Item items[kMaxItems];  // sorted by `at`, ascending
  FwInfo fw;
  TokInfo tok;
};

enum class ParseResult { Ok, BadJson, BadVersion, BadField, TooManyItems };
const char* parseResultName(ParseResult r);

void defaultConfig(Config& c);
ParseResult parseManifest(const char* json, size_t len, Manifest& out);

// Index of the item that should be on screen at `now` (latest item with at <= now), or -1.
int currentIndex(const Manifest& m, uint32_t now);
// Index of the first item with at > now, or -1.
int nextIndex(const Manifest& m, uint32_t now);

bool validId(const char* s);
bool validSha(const char* s);

}  // namespace hf
