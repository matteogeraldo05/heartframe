#include "hf_manifest.h"

#include <ArduinoJson.h>
#include <string.h>

namespace hf {

const char* parseResultName(ParseResult r) {
  switch (r) {
    case ParseResult::Ok: return "ok";
    case ParseResult::BadJson: return "bad-json";
    case ParseResult::BadVersion: return "bad-version";
    case ParseResult::BadField: return "bad-field";
    case ParseResult::TooManyItems: return "too-many-items";
  }
  return "?";
}

void defaultConfig(Config& c) {
  memset(&c, 0, sizeof(c));
  strcpy(c.tz, "EST5EDT,M3.2.0,M11.1.0");  // Toronto
  c.checkMin = 60;
  c.checkUsbMin = 15;
  c.quietStart = 23 * 60;
  c.quietEnd = 7 * 60;
  c.led[0] = 255; c.led[1] = 8; c.led[2] = 72;  // hot pink on WS2812 (tune with the `led` console command)
  c.ledMax = 160;
  c.ledMs = 10000;
  c.hb[0] = '\0';
  c.hbHours = 6;
}

static bool copyStr(char* dst, size_t cap, const char* src) {
  if (src == nullptr) return false;
  size_t n = strlen(src);
  if (n >= cap) return false;
  memcpy(dst, src, n + 1);
  return true;
}

static bool printable(const char* s) {
  for (; *s; s++) if (*s < 0x20 || *s > 0x7e) return false;
  return true;
}

bool validId(const char* s) {
  size_t n = strlen(s);
  if (n == 0 || n > 24) return false;
  for (size_t i = 0; i < n; i++) {
    char c = s[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
    if (!ok) return false;
  }
  return true;
}

bool validSha(const char* s) {
  if (strlen(s) != 64) return false;
  for (int i = 0; i < 64; i++) {
    char c = s[i];
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  }
  return true;
}

template <typename T>
static T clampT(T v, T lo, T hi) { return v < lo ? lo : (v > hi ? hi : v); }

static void parseConfig(JsonObjectConst o, Config& c) {
  // Every field is optional; out-of-range values are clamped so a typo on the
  // server can never make the frame wake every few seconds and drain the battery.
  const char* tz = o["tz"] | (const char*)nullptr;
  if (tz && strlen(tz) > 2 && printable(tz)) copyStr(c.tz, sizeof(c.tz), tz);
  c.checkMin = clampT<int>(o["chk"] | (int)c.checkMin, 15, 720);
  c.checkUsbMin = clampT<int>(o["chkUsb"] | (int)c.checkUsbMin, 5, 720);
  c.quietStart = clampT<int>(o["qs"] | (int)c.quietStart, 0, 1439);
  c.quietEnd = clampT<int>(o["qe"] | (int)c.quietEnd, 0, 1439);
  JsonArrayConst led = o["led"];
  if (led.size() == 3) {
    for (int i = 0; i < 3; i++) c.led[i] = (uint8_t)clampT<int>(led[i] | 0, 0, 255);
  }
  c.ledMax = clampT<int>(o["ledMax"] | (int)c.ledMax, 0, 255);
  c.ledMs = clampT<int>(o["ledMs"] | (int)c.ledMs, 1000, 30000);
  const char* hb = o["hb"] | (const char*)nullptr;
  if (hb) {
    if (hb[0] == '\0') c.hb[0] = '\0';
    else if (strncmp(hb, "https://", 8) == 0 && printable(hb)) copyStr(c.hb, sizeof(c.hb), hb);
  }
  c.hbHours = clampT<int>(o["hbH"] | (int)c.hbHours, 1, 48);
}

ParseResult parseManifest(const char* json, size_t len, Manifest& m) {
  memset(&m, 0, sizeof(m));
  defaultConfig(m.cfg);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json, len);
  if (err) return ParseResult::BadJson;
  JsonObjectConst root = doc.as<JsonObjectConst>();
  if (root.isNull()) return ParseResult::BadJson;

  m.v = root["v"] | 0u;
  if (m.v != 1) return ParseResult::BadVersion;
  m.seq = root["seq"] | (uint64_t)0;
  m.gen = root["gen"] | 0u;
  if (m.seq == 0 || m.gen < 1700000000u) return ParseResult::BadField;

  if (root["cfg"].is<JsonObjectConst>()) parseConfig(root["cfg"].as<JsonObjectConst>(), m.cfg);

  JsonArrayConst items = root["items"];
  if (items.size() > (size_t)kMaxItems) return ParseResult::TooManyItems;
  for (JsonObjectConst it : items) {
    Item& d = m.items[m.count];
    const char* id = it["id"] | "";
    const char* sha = it["sha"] | "";
    if (!validId(id) || !validSha(sha)) return ParseResult::BadField;
    copyStr(d.id, sizeof(d.id), id);
    copyStr(d.sha, sizeof(d.sha), sha);
    d.at = it["at"] | 0u;
    d.len = it["len"] | 0u;
    d.surprise = (it["s"] | 0) != 0;
    if (d.at < 1700000000u || d.len < 36 || d.len > 16384) return ParseResult::BadField;
    m.count++;
  }
  // Keep sorted by time even if the server didn't (insertion sort, n <= 40).
  for (int i = 1; i < m.count; i++) {
    Item tmp = m.items[i];
    int j = i - 1;
    while (j >= 0 && m.items[j].at > tmp.at) { m.items[j + 1] = m.items[j]; j--; }
    m.items[j + 1] = tmp;
  }

  JsonObjectConst fw = root["fw"];
  if (!fw.isNull()) {
    FwInfo& f = m.fw;
    f.ver = fw["ver"] | 0u;
    f.len = fw["len"] | 0u;
    bool ok = f.ver > 0 && f.len > 1024 && f.len <= 0x300000 &&
              copyStr(f.name, sizeof(f.name), fw["name"] | "") &&
              copyStr(f.path, sizeof(f.path), fw["path"] | "") &&
              copyStr(f.sha, sizeof(f.sha), fw["sha"] | "") &&
              copyStr(f.sig, sizeof(f.sig), fw["sig"] | "") &&
              strncmp(f.path, "fw/", 3) == 0 && printable(f.path) && validSha(f.sha) && f.sig[0] != '\0';
    f.present = ok;  // a malformed fw entry is ignored, it does not invalidate the manifest
  }

  JsonObjectConst tok = root["tok"];
  if (!tok.isNull()) {
    TokInfo& t = m.tok;
    t.gen = tok["gen"] | 0u;
    bool ok = t.gen > 0 && copyStr(t.val, sizeof(t.val), tok["val"] | "") &&
              strncmp(t.val, "github_pat_", 11) == 0 && printable(t.val);
    t.present = ok;
  }
  return ParseResult::Ok;
}

int currentIndex(const Manifest& m, uint32_t now) {
  int best = -1;
  for (int i = 0; i < m.count; i++) {
    if (m.items[i].at <= now) best = i;  // sorted ascending: last match is the latest
  }
  return best;
}

int nextIndex(const Manifest& m, uint32_t now) {
  for (int i = 0; i < m.count; i++) {
    if (m.items[i].at > now) return i;
  }
  return -1;
}

}  // namespace hf
