// Heart Frame firmware - one wake cycle per boot:
//   wake -> battery -> (maybe) Wi-Fi + GitHub -> choose message -> e-paper + heart -> deep sleep
// Everything happens in setup(); loop() is never reached.
#include <Arduino.h>

#include "config.h"
#include "console.h"
#include "display.h"
#include "hf_format.h"
#include "hf_manifest.h"
#include "hf_schedule.h"
#include "leds.h"
#include "log.h"
#include "net.h"
#include "ota.h"
#include "power.h"
#include "secrets.h"
#include "state.h"
#include "store.h"
#include "sync.h"

static Persisted st;
static Secrets sec;
static hf::Manifest manifest;                 // ~5 kB, static on purpose
static uint8_t bitmap[hf::kBitmapFileLen];

static int stepPct(float pct) { return (int)((pct + BATT_STEP_PCT / 2.0f) / BATT_STEP_PCT) * BATT_STEP_PCT; }
static bool screenIs(const char* s) { return strcmp(st.screen, s) == 0; }
static void setScreen(const char* s) { strlcpy(st.screen, s, sizeof(st.screen)); }

[[noreturn]] static void sleepFor(uint32_t seconds) {
  Leds::waitDone();
  Display::sleep();
  StateStore::saveIfChanged(st);
  memset(&sec, 0, sizeof(sec));
  Power::deepSleep(seconds, true, true);
  for (;;) {}
}

void setup() {
  Power::earlyInit();
  Serial.begin(115200);
  StateStore::rtcInitIfNeeded();
  const WakeCause wake = Power::wakeCause();
  // Holding the button 5 s opens Wi-Fi setup; the heart glows once to say "got it".
  bool longPress = false;
  if (Power::buttonPressed() && Power::buttonHeldMs(BUTTON_LONG_MS) >= BUTTON_LONG_MS) {
    longPress = true;
    hf::Config d;
    hf::defaultConfig(d);
    Leds::start(Pattern::Ack, d.led, d.ledMax, 1500);
  }
  StateStore::load(st);
  Ota::onBoot(st);
  Store::begin();
  Console::maybeRun(st);  // no-op unless a terminal is attached over USB

  const bool provisioned = SecretStore::load(sec);
  Battery batt = Power::readBattery();
  bool haveManifest = Store::loadManifest(manifest);
  hf::Config cfg;
  if (haveManifest) cfg = manifest.cfg; else hf::defaultConfig(cfg);
  hf::applyTimezone(cfg.tz);
  LOGF("wake=%d battery %.2f V %.0f%% usb=%d manifest=%d", (int)wake, batt.volts, batt.pct, batt.usb, haveManifest);

  // 1) Never provisioned: say so on screen and wait for USB / the button.
  if (!provisioned) {
    if (!screenIs("setup")) { Display::showSetupNeeded(); setScreen("setup"); }
    sleepFor(0);
  }

  // 2) Battery nearly empty: leave a "charge me" picture (e-paper keeps it with zero
  //    power) and stop using Wi-Fi. Plugging in USB wakes us immediately.
  if (batt.ok && !batt.usb && batt.volts < BATT_CRITICAL_V) {
    if (!screenIs("charge")) { Display::showChargeMe(); setScreen("charge"); }
    sleepFor(SETUP_SLEEP_S);
  }

  // 3) Wi-Fi setup: hold the button 5 s, or first power-on with no saved network.
  bool portal = longPress;
  if (!portal && wake == WakeCause::PowerOn && !Net::hasSavedCredentials()) portal = true;
  if (portal) {
    String ap = Net::apName();
    Display::showPortal(ap.c_str(), sec.portalPass);
    setScreen("portal");
    if (!Net::runPortal(ap.c_str(), sec.portalPass)) Net::off();
  }

  // 4) Network check? (Timer wakes planned as "display a scheduled message" skip it
  //    when that message is already cached.)
  time_t now = time(nullptr);
  bool timeValid = hf::timeLooksValid(now);
  bool doSync = portal || wake != WakeCause::Timer || rtc.plannedCheck || !haveManifest || !timeValid;
  if (!doSync) {
    int i = hf::currentIndex(manifest, (uint32_t)now);
    char s16[17];
    if (i >= 0) { sha16(manifest.items[i].sha, s16); doSync = !Store::hasBitmap(s16); }
  }
  SyncResult sr;
  if (doSync) {
    sr = Sync::run(sec, st, manifest, haveManifest, batt, !Ota::pendingVerify());
    if (sr.otaInstalled) { StateStore::saveIfChanged(st); ESP.restart(); }
    if (sr.err == SyncErr::None) { rtc.failStreak = 0; rtc.lastSyncOk = (uint32_t)time(nullptr); }
    else rtc.failStreak++;
    rtc.lastErr = (uint8_t)sr.err;
    LOGF("sync: %s (fail streak %ld)", syncErrName(sr.err), (long)rtc.failStreak);
    if (haveManifest) { cfg = manifest.cfg; hf::applyTimezone(cfg.tz); }
    now = time(nullptr);
    timeValid = hf::timeLooksValid(now);
  }

  // A freshly installed update confirms itself only if it got this far and either
  // synced or simply had no Wi-Fi. TLS/decrypt/HTTP failures mean "roll back".
  if (Ota::pendingVerify()) {
    bool ok = sr.err == SyncErr::None || sr.err == SyncErr::NoWifi;
    Ota::confirm(ok);  // reboots into the previous firmware if !ok
    st.fwTrying = 0;
  }

  // 5) Which message belongs on screen right now?
  const uint32_t eff = timeValid ? (uint32_t)now : (haveManifest ? manifest.gen : 0);
  const int idx = haveManifest ? hf::currentIndex(manifest, eff) : -1;
  const hf::Item* target = nullptr;
  char targetS16[17] = "";
  if (idx >= 0) {
    size_t len = 0;
    sha16(manifest.items[idx].sha, targetS16);
    if (Store::loadBitmap(targetS16, bitmap, sizeof(bitmap), len)) target = &manifest.items[idx];
    else LOGF("message %s not downloaded yet, keeping the current screen", manifest.items[idx].id);
  }
  // Message: draw target.  Welcome: nothing due yet.  Keep: due message missing, keep the old one.
  enum class Want { Message, Welcome, Keep } want = target ? Want::Message : (idx < 0 ? Want::Welcome : Want::Keep);

  const bool quiet = timeValid && hf::inQuiet(hf::localMinuteOfDay(now), cfg.quietStart, cfg.quietEnd);
  uint8_t icons = 0;
  if (batt.usb) icons |= Icons::CHARGING;
  if (batt.ok && batt.pct <= BATT_LOW_PCT) icons |= Icons::LOW_BATT;
  const bool offline = (timeValid && rtc.lastSyncOk && (uint32_t)now - rtc.lastSyncOk > OFFLINE_ICON_AFTER_S) ||
                       rtc.failStreak >= 24 || sr.err == SyncErr::Auth || sr.err == SyncErr::NotFound;
  if (offline) icons |= Icons::OFFLINE;
  const int pct = batt.ok ? stepPct(batt.pct) : -1;
  // Hysteresis: redraw the number only when the charge really moved (not 44.9 <-> 45.1).
  const bool pctMoved = pct != st.shownPct && (st.shownPct < 0 || abs((int)batt.pct - st.shownPct) >= BATT_STEP_PCT || pct == 100);

  bool contentChanged = false;
  if (want == Want::Message) contentChanged = !screenIs("msg") || strcmp(st.shownId, target->id) != 0 || strcmp(st.shownSha16, targetS16) != 0;
  else if (want == Want::Welcome) contentChanged = !screenIs("welcome");
  else contentChanged = !screenIs("msg");  // a status screen is up: put the old message back
  const bool daily = timeValid && !quiet && (uint32_t)now - st.lastFull >= FULL_REFRESH_EVERY_S;
  const bool redraw = contentChanged || pctMoved || icons != st.shownIcons || daily || wake == WakeCause::PowerOn;

  // 6) Heart: pulse for a message she has never seen; if it arrived during quiet
  //    hours, save the pulse for the morning. A button press gets a short glow.
  const bool isNew = target && !StateStore::wasShown(st, target->id);
  const bool ledPowerOk = batt.usb || !batt.ok || batt.volts >= BATT_LED_MIN_V;
  bool pulse = false;
  Pattern pattern = Pattern::Breathe;
  if (isNew) {
    pattern = target->surprise ? Pattern::Heartbeat : Pattern::Breathe;
    if (quiet) st.pendingPulse = 1; else pulse = true;
  } else if (st.pendingPulse && !quiet) {
    pulse = true;
    st.pendingPulse = 0;
  } else if (wake == WakeCause::Button && !longPress) {
    pulse = true;
    pattern = Pattern::Ack;
  }
  if (pulse && ledPowerOk) Leds::start(pattern, cfg.led, cfg.ledMax, pattern == Pattern::Ack ? 2500 : cfg.ledMs);

  if (redraw) {
    const Overlay ov{pct, icons};
    size_t len = 0;
    if (want == Want::Message) {
      Display::showMessage(hf::bitmapPixels(bitmap), ov);
      strlcpy(st.shownId, target->id, sizeof(st.shownId));
      strlcpy(st.shownSha16, targetS16, sizeof(st.shownSha16));
      setScreen("msg");
    } else if (want == Want::Keep && st.shownSha16[0] && Store::loadBitmap(st.shownSha16, bitmap, sizeof(bitmap), len)) {
      Display::showMessage(hf::bitmapPixels(bitmap), ov);
      setScreen("msg");
    } else {
      Display::showWelcome(ov);
      setScreen("welcome");
    }
    st.shownPct = (int8_t)pct;
    st.shownIcons = icons;
    if (timeValid) st.lastFull = (uint32_t)now;
  }
  if (isNew) StateStore::markShown(st, target->id);  // quiet-hours pulse is remembered in pendingPulse
  Leds::waitDone();

  // 7) Plan the next wake and sleep.
  const int nidx = haveManifest ? hf::nextIndex(manifest, eff) : -1;
  hf::WakeInput wi{now, timeValid, batt.usb, &cfg, (int)rtc.failStreak, nidx >= 0 ? (time_t)manifest.items[nidx].at : 0};
  const hf::WakePlan plan = hf::planWake(wi);
  rtc.plannedCheck = plan.isCheck;
  LOGF("awake %lu ms, next wake in %lu s (%s)", (unsigned long)millis(), (unsigned long)plan.sleepSec,
       plan.isCheck ? "check" : "scheduled message");
  sleepFor(plan.sleepSec);
}

void loop() {}
