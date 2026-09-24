#include "net.h"

#include <WiFi.h>
#include <WiFiManager.h>
#include <esp_mac.h>
#include <esp_wifi.h>

#include "config.h"
#include "log.h"
#include "state.h"

namespace {

bool waitConnected(uint32_t ms) {
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < ms) delay(50);
  return WiFi.status() == WL_CONNECTED;
}

bool loadSaved(char ssid[33], char pass[65]) {
  wifi_config_t conf;
  memset(&conf, 0, sizeof(conf));
  if (esp_wifi_get_config(WIFI_IF_STA, &conf) != ESP_OK) return false;
  memcpy(ssid, conf.sta.ssid, 32);  // may be exactly 32 chars without a terminator
  ssid[32] = '\0';
  memcpy(pass, conf.sta.password, 64);
  pass[64] = '\0';
  memset(&conf, 0, sizeof(conf));
  return ssid[0] != '\0';
}

void staInit() {
  // RAM storage for anything we set here (no flash writes on every wake); the
  // credentials saved by the portal are still loaded from NVS at init.
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("heart-frame");
}

}  // namespace

namespace Net {

bool hasSavedCredentials() {
  staInit();
  char ssid[33], pass[65];
  bool ok = loadSaved(ssid, pass);
  memset(pass, 0, sizeof(pass));
  return ok;
}

bool connect(uint32_t timeoutMs) {
  if (WiFi.status() == WL_CONNECTED) return true;  // e.g. right after the portal
  staInit();
  char ssid[33], pass[65];
  if (!loadSaved(ssid, pass)) {
    LOGF("wifi: no saved network");
    return false;
  }
  const uint32_t start = millis();
  bool ok = false;
  if (rtc.channel > 0) {
    // Fast path: skip the scan by going straight to the last access point.
    WiFi.begin(ssid, pass, rtc.channel, rtc.bssid, true);
    ok = waitConnected(timeoutMs < 5000 ? timeoutMs : 5000);
    if (!ok) WiFi.disconnect();
  }
  if (!ok) {
    WiFi.begin(ssid, pass);  // full scan, any access point with this SSID
    uint32_t used = millis() - start;
    ok = waitConnected(used < timeoutMs ? timeoutMs - used : 1000);
  }
  memset(pass, 0, sizeof(pass));
  if (ok) {
    rtc.channel = WiFi.channel();
    memcpy(rtc.bssid, WiFi.BSSID(), 6);
    LOGF("wifi: connected in %lu ms, rssi %d, ch %ld", (unsigned long)(millis() - start), WiFi.RSSI(), (long)rtc.channel);
  } else {
    rtc.channel = 0;
    LOGF("wifi: failed (status %d)", (int)WiFi.status());
  }
  return ok;
}

void off() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool runPortal(const char* ap, const char* pass) {
  WiFi.mode(WIFI_OFF);  // re-initialise with flash storage so the new network is saved
  delay(50);
  WiFi.persistent(true);
  WiFiManager wm;
  wm.setDebugOutput(false);         // it would print the password you type
  wm.setTitle("Heart Frame");
  std::vector<const char*> menu = {"wifi", "exit"};
  wm.setMenu(menu);                 // no "update" page: nobody can upload firmware through the portal
  wm.setShowInfoUpdate(false);
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setConnectTimeout(20);
  wm.setMinimumSignalQuality(10);
  wm.setHostname("heart-frame");
  bool ok = wm.startConfigPortal(ap, pass);
  LOGF("portal: %s", ok ? "connected" : "timed out / cancelled");
  return ok;
}

void forgetCredentials() {
  WiFi.mode(WIFI_OFF);
  WiFi.persistent(true);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);  // erase saved config
  WiFi.mode(WIFI_OFF);
}

String apName() {
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char buf[20];
  snprintf(buf, sizeof(buf), "HeartFrame-%02X%02X", mac[4], mac[5]);
  return String(buf);
}

int rssi() { return WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0; }

}  // namespace Net
