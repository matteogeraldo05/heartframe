// secrets.h - provisioning data kept in NVS (namespace "hfsec").
// Written once over USB with tools/provision.py; the token can later be rotated
// through the (encrypted, authenticated) manifest. Never compiled into firmware,
// so the .bin files you publish for OTA contain no secrets.
#pragma once
#include <Arduino.h>

struct Secrets {
  char owner[40];        // GitHub user that owns the messages repo
  char repo[101];        // messages repo name (private)
  char branch[64];       // usually "main"
  char token[128];       // fine-grained PAT: Contents = read-only, this one repo only
  uint32_t tokGen;       // token generation (rotation counter)
  uint8_t key[32];       // AES-256 message key (shared with the web app only)
  char portalPass[64];   // password of the Wi-Fi setup hotspot (8..63 chars)
  bool valid;
};

namespace SecretStore {
bool load(Secrets& s);
bool save(const Secrets& s);
// Parse {"owner","repo","branch","token","key"(base64),"ppass"} and save. `err` gets a reason.
bool provisionFromJson(const char* json, String& err);
bool updateToken(const char* token, uint32_t gen);
void wipe();
String redact(const char* secret);  // "github_pat_1…wxyz"
}  // namespace SecretStore
