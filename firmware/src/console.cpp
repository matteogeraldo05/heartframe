#include "console.h"

#include "config.h"
#include "display.h"
#include "hf_format.h"
#include "leds.h"
#include "log.h"
#include "net.h"
#include "ota.h"
#include "power.h"
#include "secrets.h"
#include "store.h"
#include "sync.h"

extern "C" const char HF_BUILD_MARKER[];

namespace {

void help() {
  Serial.println(
      "commands:\n"
      "  status                  battery, secrets (redacted), cache, state\n"
      "  prov {json}             store repo/token/key/portal password (see tools/provision.py)\n"
      "  led <r> <g> <b> [br]    light the heart in a colour (tune your pink), `led off`\n"
      "  pulse | beat            play the new-message / surprise animation\n"
      "  epd                     draw a test pattern on the e-paper\n"
      "  sync                    connect and fetch now (verbose)\n"
      "  portal                  open the Wi-Fi setup hotspot\n"
      "  sleep <seconds>         deep sleep now (measure sleep current)\n"
      "  wifi-forget             erase saved Wi-Fi\n"
      "  factory-reset           erase secrets, state, cache and Wi-Fi\n"
      "  reboot | exit");
}

void status(Persisted& st) {
  Battery b = Power::readBattery();
  Secrets s;
  bool prov = SecretStore::load(s);
  Serial.printf("firmware %s build %d (%s)%s\n", FW_NAME, FW_BUILD, HF_BUILD_MARKER,
                Ota::pendingVerify() ? " [unconfirmed update]" : "");
  Serial.printf("battery: gauge=%s %.3f V %.1f %% rate %.1f %%/h usb=%d\n", b.ok ? "ok" : "MISSING", b.volts, b.pct, b.rate, b.usb);
  Serial.printf("button=%d  saved wifi=%d  ap=%s\n", Power::buttonPressed(), Net::hasSavedCredentials(), Net::apName().c_str());
  Serial.printf("provisioned=%d owner=%s repo=%s branch=%s token=%s tokgen=%lu portal-pass=%s\n", prov, s.owner, s.repo,
                s.branch, SecretStore::redact(s.token).c_str(), (unsigned long)s.tokGen,
                SecretStore::redact(s.portalPass).c_str());
  Serial.printf("state: seq=%llu shown=%s pct=%d icons=0x%02x lastFull=%lu fwBad=%lu fwTrying=%lu\n", st.seq, st.shownId,
                st.shownPct, st.shownIcons, (unsigned long)st.lastFull, (unsigned long)st.fwBad, (unsigned long)st.fwTrying);
  Serial.printf("rtc: boots=%lu fails=%ld lastSyncOk=%lu lastErr=%s time=%ld\n", (unsigned long)rtc.boots,
                (long)rtc.failStreak, (unsigned long)rtc.lastSyncOk, syncErrName((SyncErr)rtc.lastErr), (long)time(nullptr));
  Store::list(Serial);
  memset(&s, 0, sizeof(s));
}

void doSync(Persisted& st) {
  Secrets s;
  if (!SecretStore::load(s)) { Serial.println("not provisioned"); return; }
  hf::Manifest* m = new hf::Manifest;
  bool have = Store::loadManifest(*m);
  Battery b = Power::readBattery();
  SyncResult r = Sync::run(s, st, *m, have, b, false);
  Serial.printf("sync: wifi=%d changed=%d err=%s items=%d\n", r.wifiUp, r.manifestChanged, syncErrName(r.err), have ? m->count : 0);
  delete m;
  StateStore::saveIfChanged(st);
  memset(&s, 0, sizeof(s));
}

void handle(String line, Persisted& st, bool& done) {
  line.trim();
  if (line.length() == 0) return;
  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String arg = sp < 0 ? "" : line.substring(sp + 1);

  if (cmd == "help") help();
  else if (cmd == "status") status(st);
  else if (cmd == "prov") {
    String err;
    bool ok = SecretStore::provisionFromJson(arg.c_str(), err);
    Serial.println(ok ? "PROV OK" : ("PROV ERROR: " + err));
    arg = "";  // drop our copy of the secrets
  } else if (cmd == "led") {
    if (arg == "off") { Leds::off(); return; }
    int r = 0, g = 0, b = 0, br = 160;
    sscanf(arg.c_str(), "%d %d %d %d", &r, &g, &b, &br);
    Leds::solid(r, g, b, br);
    Serial.printf("heart = (%d,%d,%d) brightness %d - `led off` when done\n", r, g, b, br);
  } else if (cmd == "pulse" || cmd == "beat") {
    hf::Config c;
    hf::defaultConfig(c);
    hf::Manifest* m = new hf::Manifest;
    if (Store::loadManifest(*m)) c = m->cfg;
    delete m;
    Leds::start(cmd == "beat" ? Pattern::Heartbeat : Pattern::Breathe, c.led, c.ledMax, c.ledMs);
    Leds::waitDone();
  } else if (cmd == "epd") Display::showTestPattern();
  else if (cmd == "sync") doSync(st);
  else if (cmd == "portal") {
    Secrets s;
    SecretStore::load(s);
    String ap = Net::apName();
    const char* pass = strlen(s.portalPass) >= 8 ? s.portalPass : "heartframe";
    Display::showPortal(ap.c_str(), pass);
    Net::runPortal(ap.c_str(), pass);
    Net::off();
  } else if (cmd == "sleep") {
    uint32_t secs = arg.length() ? arg.toInt() : 600;
    Serial.println("sleeping - measure now. Press the button or reset to wake.");
    Power::deepSleep(secs, true, false);
  } else if (cmd == "wifi-forget") { Net::forgetCredentials(); Serial.println("wifi erased"); }
  else if (cmd == "factory-reset") {
    SecretStore::wipe();
    StateStore::wipe();
    Store::wipe();
    Net::forgetCredentials();
    Serial.println("erased; rebooting");
    delay(200);
    ESP.restart();
  } else if (cmd == "reboot") ESP.restart();
  else if (cmd == "exit") done = true;
  else Serial.println("unknown command - type help");
}

}  // namespace

namespace Console {

void maybeRun(Persisted& st) {
  // USB CDC needs a moment to enumerate after a reset; only wait when USB power is present.
  if (!Power::usbPresent()) return;
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 2500) delay(20);
  if (!Serial) return;
  Serial.printf("\nHeart Frame %s (build %d). Press Enter within 3 s for the console.\n", FW_NAME, FW_BUILD);
  t0 = millis();
  while (millis() - t0 < 3000 && !Serial.available()) delay(20);
  if (!Serial.available()) return;
  while (Serial.available()) Serial.read();
  help();
  bool done = false;
  String line;
  uint32_t lastInput = millis();
  Serial.print("> ");
  while (!done && millis() - lastInput < 120000) {
    while (Serial.available()) {
      char c = (char)Serial.read();
      lastInput = millis();
      if (c == '\n' || c == '\r') {
        if (line.length()) {
          Serial.println();
          handle(line, st, done);
          line = "";
          if (!done) Serial.print("> ");
        }
      } else if (line.length() < 1024) {
        line += c;
        if (!line.startsWith("prov")) Serial.print(c);  // don't echo secrets back
      }
    }
    delay(5);
  }
  Serial.println("console closed, continuing normal wake");
}

}  // namespace Console
