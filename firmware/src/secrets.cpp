#include "secrets.h"

#include <ArduinoJson.h>
#include <Preferences.h>

#include "hf_crypto.h"

static const char* NS = "hfsec";

static bool validName(const char* s, size_t maxLen) {
  size_t n = strlen(s);
  if (n == 0 || n > maxLen) return false;
  for (size_t i = 0; i < n; i++) {
    char c = s[i];
    if (!(isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.')) return false;
  }
  return true;
}

static bool validToken(const char* t) {
  size_t n = strlen(t);
  if (n < 40 || n > 127 || strncmp(t, "github_pat_", 11) != 0) return false;
  for (size_t i = 0; i < n; i++) {
    if (!(isalnum((unsigned char)t[i]) || t[i] == '_')) return false;
  }
  return true;
}

namespace SecretStore {

bool load(Secrets& s) {
  memset(&s, 0, sizeof(s));
  Preferences p;
  if (!p.begin(NS, true)) return false;  // read-only
  p.getString("owner", s.owner, sizeof(s.owner));
  p.getString("repo", s.repo, sizeof(s.repo));
  p.getString("branch", s.branch, sizeof(s.branch));
  p.getString("token", s.token, sizeof(s.token));
  p.getString("ppass", s.portalPass, sizeof(s.portalPass));
  s.tokGen = p.getUInt("tokgen", 1);
  size_t k = p.getBytes("key", s.key, sizeof(s.key));
  p.end();
  if (s.branch[0] == '\0') strcpy(s.branch, "main");
  s.valid = k == sizeof(s.key) && validName(s.owner, 39) && validName(s.repo, 100) &&
            validToken(s.token) && strlen(s.portalPass) >= 8;
  return s.valid;
}

bool save(const Secrets& s) {
  Preferences p;
  if (!p.begin(NS, false)) return false;
  bool ok = p.putString("owner", s.owner) && p.putString("repo", s.repo) &&
            p.putString("branch", s.branch) && p.putString("token", s.token) &&
            p.putString("ppass", s.portalPass) && p.putUInt("tokgen", s.tokGen) &&
            p.putBytes("key", s.key, sizeof(s.key)) == sizeof(s.key);
  p.end();
  return ok;
}

bool provisionFromJson(const char* json, String& err) {
  JsonDocument doc;
  if (deserializeJson(doc, json)) { err = "not valid JSON"; return false; }
  Secrets s;
  memset(&s, 0, sizeof(s));
  strlcpy(s.owner, doc["owner"] | "", sizeof(s.owner));
  strlcpy(s.repo, doc["repo"] | "", sizeof(s.repo));
  strlcpy(s.branch, doc["branch"] | "main", sizeof(s.branch));
  strlcpy(s.token, doc["token"] | "", sizeof(s.token));
  strlcpy(s.portalPass, doc["ppass"] | "", sizeof(s.portalPass));
  s.tokGen = doc["tokgen"] | 1;
  const char* keyB64 = doc["key"] | "";
  uint8_t key[48];
  size_t klen = hf::base64Decode(keyB64, key, sizeof(key));

  if (!validName(s.owner, 39)) { err = "bad owner"; return false; }
  if (!validName(s.repo, 100)) { err = "bad repo"; return false; }
  if (!validName(s.branch, 63)) { err = "bad branch"; return false; }
  if (!validToken(s.token)) { err = "token must be a fine-grained PAT (github_pat_...)"; return false; }
  if (klen != 32) { err = "key must be 32 bytes, base64"; return false; }
  size_t pl = strlen(s.portalPass);
  if (pl < 8 || pl > 63) { err = "ppass must be 8-63 chars"; return false; }
  memcpy(s.key, key, 32);
  memset(key, 0, sizeof(key));
  s.valid = true;
  if (!save(s)) { err = "NVS write failed"; return false; }
  memset(&s, 0, sizeof(s));
  return true;
}

bool updateToken(const char* token, uint32_t gen) {
  if (!validToken(token)) return false;
  Preferences p;
  if (!p.begin(NS, false)) return false;
  bool ok = p.putString("token", token) && p.putUInt("tokgen", gen);
  p.end();
  return ok;
}

void wipe() {
  Preferences p;
  if (p.begin(NS, false)) { p.clear(); p.end(); }
}

String redact(const char* secret) {
  size_t n = strlen(secret);
  if (n <= 16) return String("(") + n + " chars)";
  return String(secret).substring(0, 11) + "…" + String(secret + n - 4);
}

}  // namespace SecretStore
