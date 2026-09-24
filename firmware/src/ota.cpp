#include "ota.h"

#include <Update.h>
#include <esp_ota_ops.h>

#include "config.h"
#include "hf_crypto.h"
#include "log.h"
#include "ota_pubkey.h"

// Tells the Arduino core not to auto-confirm a fresh update at boot; we confirm
// it ourselves only after the new build has proven it can display and sync.
extern "C" bool verifyRollbackLater() { return true; }

// Marker the signing tool reads so the published version always matches the build.
#define HF_STR2(x) #x
#define HF_STR(x) HF_STR2(x)
extern "C" __attribute__((used)) const char HF_BUILD_MARKER[] = "HFBUILD:" HF_STR(FW_BUILD) ";HFNAME:" FW_NAME ";";

namespace {
class OtaSink : public Stream {
 public:
  size_t write(uint8_t c) override { return write(&c, 1); }
  size_t write(const uint8_t* d, size_t n) override {
    if (failed) return 0;
    sha.update(d, n);
    if (Update.write(const_cast<uint8_t*>(d), n) != n) { failed = true; return 0; }
    total += n;
    return n;
  }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
  hf::Sha256 sha;
  size_t total = 0;
  bool failed = false;
};
}  // namespace

namespace Ota {

bool enabled() { return OTA_PUBKEY_DER_LEN > 0; }

void onBoot(Persisted& st) {
  if (st.fwTrying == 0) return;
  if ((uint32_t)FW_BUILD < st.fwTrying) {
    // We are the old firmware again: the update crashed, failed its self-test,
    // or was labelled with the wrong build number. Never try it again.
    LOGF("ota: build %lu did not stick, blacklisting it", (unsigned long)st.fwTrying);
    st.fwBad = st.fwTrying;
    st.fwTrying = 0;
  } else if ((uint32_t)FW_BUILD > st.fwTrying) {
    st.fwTrying = 0;
  }
  // FW_BUILD == fwTrying: we are the new build; main() confirms after a good wake.
}

bool pendingVerify() {
  esp_ota_img_states_t s;
  return esp_ota_get_state_partition(esp_ota_get_running_partition(), &s) == ESP_OK &&
         s == ESP_OTA_IMG_PENDING_VERIFY;
}

void confirm(bool ok) {
  if (ok) {
    esp_ota_mark_app_valid_cancel_rollback();
    LOGF("ota: new firmware confirmed");
  } else {
    LOGF("ota: self-test failed, rolling back");
    esp_ota_mark_app_invalid_rollback_and_reboot();  // does not return
  }
}

bool maybeUpdate(RepoClient& gh, const hf::FwInfo& fw, const Battery& b, Persisted& st) {
  if (!enabled() || !fw.present) return false;
  if (fw.ver <= (uint32_t)FW_BUILD || fw.ver == st.fwBad) return false;
  if (!b.usb && b.pct < BATT_OTA_MIN_PCT) {
    LOGF("ota: build %lu waiting for more battery", (unsigned long)fw.ver);
    return false;
  }
  const esp_partition_t* next = esp_ota_get_next_update_partition(nullptr);
  if (next == nullptr || fw.len > next->size) {
    st.fwBad = fw.ver;
    return false;
  }
  LOGF("ota: downloading build %lu (%lu bytes)", (unsigned long)fw.ver, (unsigned long)fw.len);
  if (!Update.begin(fw.len, U_FLASH)) return false;

  OtaSink sink;
  int code = gh.stream(fw.path, sink);
  uint8_t hash[32];
  sink.sha.finish(hash);
  char hex[65];
  hf::toHex(hash, 32, hex);

  if (code != 200 || sink.failed || sink.total != fw.len) {
    LOGF("ota: download failed (HTTP %d, %u/%lu bytes) - will retry later", code, (unsigned)sink.total, (unsigned long)fw.len);
    Update.abort();
    return false;  // network trouble: retry at a later wake
  }
  bool ok = strcmp(hex, fw.sha) == 0;
  if (ok) {
    uint8_t sig[96];
    size_t sigLen = hf::base64Decode(fw.sig, sig, sizeof(sig));
    ok = sigLen > 0 && hf::ecdsaP256Verify(OTA_PUBKEY_DER, OTA_PUBKEY_DER_LEN, hash, sig, sigLen);
  }
  if (!ok) {
    LOGF("ota: hash or signature mismatch - rejected");
    Update.abort();
    st.fwBad = fw.ver;
    return false;
  }
  if (!Update.end(false)) {  // also validates the ESP32 image checksum
    LOGF("ota: image rejected by the bootloader checks: %s", Update.errorString());
    st.fwBad = fw.ver;
    return false;
  }
  st.fwTrying = fw.ver;
  StateStore::saveIfChanged(st);
  LOGF("ota: installed build %lu, rebooting", (unsigned long)fw.ver);
  return true;
}

}  // namespace Ota
