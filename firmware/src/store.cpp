#include "store.h"

#include <LittleFS.h>

#include "hf_format.h"
#include "log.h"

static const char* MANIFEST = "/manifest.json";
static const char* DIR = "/c";

static String bmpPath(const char* sha16) { return String(DIR) + "/" + sha16 + ".bmp"; }

// Write to a temp file then rename, so a power cut never leaves a half file.
static bool atomicWrite(const String& path, const uint8_t* data, size_t len) {
  String tmp = path + ".tmp";
  File f = LittleFS.open(tmp, "w");
  if (!f) return false;
  size_t n = f.write(data, len);
  f.close();
  if (n != len) { LittleFS.remove(tmp); return false; }
  LittleFS.remove(path);
  return LittleFS.rename(tmp, path);
}

namespace Store {

bool begin() {
  // Partition labelled "spiffs" in partitions_8mb.csv; formatted on first boot.
  if (!LittleFS.begin(true)) {
    LOGF("LittleFS mount failed");
    return false;
  }
  if (!LittleFS.exists(DIR)) LittleFS.mkdir(DIR);
  return true;
}

bool saveManifest(const char* json, size_t len) {
  return atomicWrite(MANIFEST, (const uint8_t*)json, len);
}

bool loadManifest(hf::Manifest& m) {
  File f = LittleFS.open(MANIFEST, "r");
  if (!f) return false;
  size_t size = f.size();
  if (size == 0 || size > hf::kMaxManifestJson) { f.close(); return false; }
  char* buf = (char*)malloc(size + 1);
  if (!buf) { f.close(); return false; }
  size_t n = f.read((uint8_t*)buf, size);
  f.close();
  buf[n] = '\0';
  bool ok = n == size && hf::parseManifest(buf, n, m) == hf::ParseResult::Ok;
  free(buf);
  return ok;
}

bool hasBitmap(const char* sha16) { return LittleFS.exists(bmpPath(sha16)); }

bool saveBitmap(const char* sha16, const uint8_t* data, size_t len) {
  return atomicWrite(bmpPath(sha16), data, len);
}

bool loadBitmap(const char* sha16, uint8_t* buf, size_t cap, size_t& len) {
  len = 0;
  File f = LittleFS.open(bmpPath(sha16), "r");
  if (!f) return false;
  size_t size = f.size();
  if (size > cap) { f.close(); return false; }
  len = f.read(buf, size);
  f.close();
  return len == size && hf::bitmapHeaderOk(buf, len);
}

void prune(const hf::Manifest& m, const char* keepSha16) {
  File dir = LittleFS.open(DIR);
  if (!dir) return;
  String toDelete[24];
  int nDel = 0;
  for (File f = dir.openNextFile(); f && nDel < 24; f = dir.openNextFile()) {
    String name = f.name();  // "<sha16>.bmp"
    f.close();
    String s16 = name.substring(0, 16);
    bool keep = keepSha16 && s16 == keepSha16;
    for (int i = 0; i < m.count && !keep; i++) keep = strncmp(m.items[i].sha, s16.c_str(), 16) == 0;
    if (!keep) toDelete[nDel++] = String(DIR) + "/" + name;
  }
  dir.close();
  for (int i = 0; i < nDel; i++) LittleFS.remove(toDelete[i]);
  if (nDel) LOGF("cache: pruned %d old bitmap(s)", nDel);
}

void wipe() { LittleFS.format(); }

void list(Print& out) {
  out.printf("fs: %u / %u bytes used\n", (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());
  File dir = LittleFS.open(DIR);
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    out.printf("  %s  %u bytes\n", f.name(), (unsigned)f.size());
    f.close();
  }
}

}  // namespace Store
