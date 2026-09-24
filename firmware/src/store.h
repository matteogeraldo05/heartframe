// store.h - LittleFS cache: the last good manifest (decrypted JSON) and the
// message bitmaps, so the frame keeps working with no Wi-Fi at all.
#pragma once
#include <Arduino.h>

#include "hf_manifest.h"

namespace Store {
bool begin();
bool saveManifest(const char* json, size_t len);
bool loadManifest(hf::Manifest& m);
bool hasBitmap(const char* sha16);
bool saveBitmap(const char* sha16, const uint8_t* data, size_t len);
bool loadBitmap(const char* sha16, uint8_t* buf, size_t cap, size_t& len);
// Delete cached bitmaps the manifest no longer mentions (keeps what is on screen).
void prune(const hf::Manifest& m, const char* keepSha16);
void wipe();
void list(Print& out);
}  // namespace Store

// First 16 hex chars of a sha256 - the cache file name.
inline void sha16(const char* sha, char out[17]) {
  memcpy(out, sha, 16);
  out[16] = '\0';
}
