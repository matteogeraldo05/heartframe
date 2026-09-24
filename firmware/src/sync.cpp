#include "sync.h"

#include <HTTPClient.h>
#include <sys/time.h>

#include "config.h"
#include "github.h"
#include "hf_crypto.h"
#include "hf_format.h"
#include "hf_schedule.h"
#include "log.h"
#include "net.h"
#include "ota.h"
#include "store.h"

const char* syncErrName(SyncErr e) {
  switch (e) {
    case SyncErr::None: return "none";
    case SyncErr::NoWifi: return "no-wifi";
    case SyncErr::Network: return "network";
    case SyncErr::Auth: return "auth";
    case SyncErr::NotFound: return "not-found";
    case SyncErr::Http: return "http";
    case SyncErr::Decrypt: return "decrypt";
    case SyncErr::BadManifest: return "bad-manifest";
    case SyncErr::Rollback: return "rollback";
    case SyncErr::Storage: return "storage";
  }
  return "?";
}

// Shared buffers (static so a long wake never fragments the heap).
static uint8_t g_env[hf::kBitmapEnvLen > hf::kMaxManifestEnv ? hf::kBitmapEnvLen : hf::kMaxManifestEnv];
static uint8_t g_plain[hf::kBitmapFileLen > hf::kMaxManifestJson ? hf::kBitmapFileLen : hf::kMaxManifestJson + 1];

static SyncErr httpErr(int code) {
  if (code < 0) return SyncErr::Network;
  if (code == 401) return SyncErr::Auth;      // token revoked / expired / wrong
  if (code == 404) return SyncErr::NotFound;  // wrong repo, or token lacks access to it
  return SyncErr::Http;                       // 403 rate limit, 5xx, ...
}

static void setClockFrom(time_t serverTime) {
  if (!serverTime) return;
  time_t now = time(nullptr);
  if (labs((long)(now - serverTime)) > 2) {
    struct timeval tv = {serverTime, 0};
    settimeofday(&tv, nullptr);
    LOGF("clock set from GitHub Date header (was off by %ld s)", (long)(serverTime - now));
  }
}

static SyncErr fetchManifest(RepoClient& gh, Secrets& sec, Persisted& st, hf::Manifest& m,
                             bool& haveManifest, bool& changed) {
  size_t len = 0;
  String etag;
  int code = gh.fetch("manifest.hfe", g_env, sizeof(g_env), len, haveManifest ? st.etag : nullptr, &etag);
  setClockFrom(gh.serverTime());
  if (code == 304) return SyncErr::None;  // unchanged since last time
  if (code != 200) return httpErr(code);

  int n = hf::envelopeOpen(sec.key, g_env, len, hf::kKindManifest, g_plain, sizeof(g_plain) - 1);
  if (n < 0) {
    LOGF("manifest: authentication failed (wrong key or tampered file)");
    return SyncErr::Decrypt;
  }
  g_plain[n] = '\0';
  hf::Manifest* fresh = new hf::Manifest;  // parse into a temp so a bad file can't clobber the cached one
  hf::ParseResult pr = hf::parseManifest((const char*)g_plain, n, *fresh);
  if (pr != hf::ParseResult::Ok || fresh->seq < st.seq) {
    if (pr != hf::ParseResult::Ok) LOGF("manifest: %s", hf::parseResultName(pr));
    else LOGF("manifest: seq went backwards (%llu < %llu), ignoring", fresh->seq, st.seq);
    SyncErr e = pr != hf::ParseResult::Ok ? SyncErr::BadManifest : SyncErr::Rollback;
    delete fresh;
    return e;
  }
  if (!Store::saveManifest((const char*)g_plain, n)) { delete fresh; return SyncErr::Storage; }
  memcpy(&m, fresh, sizeof(m));
  changed = fresh->seq != st.seq;
  delete fresh;
  haveManifest = true;
  st.seq = m.seq;
  strlcpy(st.etag, etag.c_str(), sizeof(st.etag));
  LOGF("manifest: seq %llu, %d item(s)", st.seq, m.count);
  return SyncErr::None;
}

static void maybeRotateToken(RepoClient& gh, Secrets& sec, const hf::Manifest& m) {
  if (!m.tok.present || m.tok.gen <= sec.tokGen || strcmp(m.tok.val, sec.token) == 0) return;
  // Prove the new token works before trusting it.
  gh.setToken(m.tok.val);
  size_t len = 0;
  int code = gh.fetch("manifest.hfe", g_env, sizeof(g_env), len);
  if (code == 200 && SecretStore::updateToken(m.tok.val, m.tok.gen)) {
    strlcpy(sec.token, m.tok.val, sizeof(sec.token));
    sec.tokGen = m.tok.gen;
    LOGF("token rotated to generation %lu", (unsigned long)sec.tokGen);
  } else {
    gh.setToken(sec.token);
    LOGF("new token (gen %lu) failed with HTTP %d, keeping the old one", (unsigned long)m.tok.gen, code);
  }
}

static SyncErr fetchBitmap(RepoClient& gh, const Secrets& sec, const hf::Item& it) {
  char s16[17];
  sha16(it.sha, s16);
  if (Store::hasBitmap(s16)) return SyncErr::None;
  String path = String("b/") + it.sha + ".hfe";
  size_t len = 0;
  int code = gh.fetch(path.c_str(), g_env, sizeof(g_env), len);
  if (code != 200) return httpErr(code);
  uint8_t digest[32];
  char hex[65];
  hf::sha256(g_env, len, digest);
  hf::toHex(digest, 32, hex);
  if (len != it.len || strcmp(hex, it.sha) != 0) {
    LOGF("bitmap %s: size/hash mismatch", it.id);
    return SyncErr::Decrypt;
  }
  int n = hf::envelopeOpen(sec.key, g_env, len, hf::kKindBitmap, g_plain, sizeof(g_plain));
  if (n < 0 || !hf::bitmapHeaderOk(g_plain, (size_t)n)) {
    LOGF("bitmap %s: authentication/format failed", it.id);
    return SyncErr::Decrypt;
  }
  if (!Store::saveBitmap(s16, g_plain, n)) return SyncErr::Storage;
  LOGF("bitmap %s cached", it.id);
  return SyncErr::None;
}

static void heartbeat(const hf::Manifest& m, const Persisted& st, const Secrets& sec, const Battery& b,
                      SyncErr err, const String& tokExp) {
  if (m.cfg.hb[0] == '\0') return;
  time_t now = time(nullptr);
  bool due = !hf::timeLooksValid(now) || now - (time_t)rtc.lastHeartbeat >= (time_t)m.cfg.hbHours * 3600;
  bool problem = err == SyncErr::Auth || err == SyncErr::NotFound || err == SyncErr::Decrypt;
  if (!due && !problem) return;

  NetworkClientSecure tls;
  useSystemRootCAs(tls);
  HTTPClient http;
  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  String url = String(m.cfg.hb) + (problem ? "/fail" : "");
  if (!http.begin(tls, url)) return;
  http.addHeader("Content-Type", "text/plain");
  char body[400];
  snprintf(body, sizeof(body),
           "fw=%s build=%d battery=%.0f%% %.2fV usb=%d rssi=%d shown=%s seq=%llu items=%d err=%s "
           "fails=%ld tokgen=%lu tokexp=%s boots=%lu fwbad=%lu",
           FW_NAME, FW_BUILD, b.pct, b.volts, b.usb, Net::rssi(), st.shownId, st.seq, m.count,
           syncErrName(err), (long)rtc.failStreak, (unsigned long)sec.tokGen,
           tokExp.length() ? tokExp.c_str() : "none", (unsigned long)rtc.boots, (unsigned long)st.fwBad);
  int code = http.POST((uint8_t*)body, strlen(body));
  http.end();
  if (code == 200) rtc.lastHeartbeat = (uint32_t)now;
  LOGF("heartbeat -> %d", code);
}

namespace Sync {

SyncResult run(Secrets& sec, Persisted& st, hf::Manifest& m, bool& haveManifest,
               const Battery& batt, bool allowOta) {
  SyncResult r;
  r.attempted = true;
  if (!Net::connect(WIFI_TIMEOUT_MS)) {
    r.err = SyncErr::NoWifi;
    Net::off();
    return r;
  }
  r.wifiUp = true;
  String tokExp;
  {
    RepoClient gh(sec);
    r.err = fetchManifest(gh, sec, st, m, haveManifest, r.manifestChanged);
    tokExp = gh.tokenExpiry();

    if (r.err == SyncErr::None && haveManifest) {
      hf::applyTimezone(m.cfg.tz);
      maybeRotateToken(gh, sec, m);

      // Bitmaps: the one due now plus the next three, so scheduled messages
      // appear on time even if the Wi-Fi is down at that moment.
      time_t now = time(nullptr);
      uint32_t eff = hf::timeLooksValid(now) ? (uint32_t)now : m.gen;
      int cur = hf::currentIndex(m, eff);
      int first = cur >= 0 ? cur : hf::nextIndex(m, eff);
      if (first >= 0) {
        for (int i = first; i < m.count && i < first + 4; i++) {
          SyncErr e = fetchBitmap(gh, sec, m.items[i]);
          if (e != SyncErr::None && r.err == SyncErr::None) r.err = e;
        }
      }
      Store::prune(m, st.shownSha16);

      if (allowOta && r.err == SyncErr::None) r.otaInstalled = Ota::maybeUpdate(gh, m.fw, batt, st);
    }
  }  // RepoClient closes its TLS connection here
  if (haveManifest && !r.otaInstalled) heartbeat(m, st, sec, batt, r.err, tokExp);
  Net::off();
  return r;
}

}  // namespace Sync
