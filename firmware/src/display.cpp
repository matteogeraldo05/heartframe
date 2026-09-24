#include "display.h"

#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <GxEPD2_BW.h>
#include <qrcode.h>  // ESP-IDF "espressif/qrcode" component, already inside the Arduino core

#include "config.h"
#include "log.h"

#if EPD_IS_GDEY042T81
using Panel = GxEPD2_420_GDEY042T81;
#else
using Panel = GxEPD2_420;
#endif

// Full-screen buffer: 400*300/8 = 15 kB of RAM, fine on the ESP32-S3.
static GxEPD2_BW<Panel, Panel::HEIGHT> epd(Panel(PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST, PIN_EPD_BUSY));
static bool g_begun = false;

namespace {

void centered(const char* text, int y, const GFXfont* font) {
  int16_t x1, y1;
  uint16_t w, h;
  epd.setFont(font);
  epd.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
  epd.setCursor((epd.width() - (int)w) / 2 - x1, y);
  epd.print(text);
}

void heart(int cx, int cy, int size, uint16_t color) {
  // Two circles + a triangle: a classic heart, `size` is the total width.
  int r = size / 4;
  epd.fillCircle(cx - r, cy, r, color);
  epd.fillCircle(cx + r, cy, r, color);
  epd.fillTriangle(cx - 2 * r, cy + r / 3, cx + 2 * r, cy + r / 3, cx, cy + 2 * r + r / 2, color);
}

void batteryIcon(int x, int y, int pct, bool charging) {
  // 24x12 body + 2x6 nub, fill proportional to charge.
  epd.drawRect(x, y, 24, 12, GxEPD_BLACK);
  epd.fillRect(x + 24, y + 3, 2, 6, GxEPD_BLACK);
  int fill = pct < 0 ? 0 : (pct * 20 + 50) / 100;
  if (fill > 0) epd.fillRect(x + 2, y + 2, fill, 8, GxEPD_BLACK);
  if (charging) {
    // Lightning bolt drawn in white over the fill, outlined in black.
    epd.fillTriangle(x + 13, y + 1, x + 8, y + 7, x + 12, y + 7, GxEPD_WHITE);
    epd.fillTriangle(x + 11, y + 5, x + 16, y + 5, x + 11, y + 11, GxEPD_WHITE);
    epd.drawLine(x + 13, y + 1, x + 8, y + 7, GxEPD_BLACK);
    epd.drawLine(x + 16, y + 5, x + 11, y + 11, GxEPD_BLACK);
  }
}

void cloudOff(int x, int y) {
  // Small cloud with a slash: "haven't reached the internet for a while".
  epd.fillCircle(x + 6, y + 8, 4, GxEPD_BLACK);
  epd.fillCircle(x + 11, y + 6, 5, GxEPD_BLACK);
  epd.fillCircle(x + 16, y + 8, 4, GxEPD_BLACK);
  epd.fillRect(x + 6, y + 8, 10, 5, GxEPD_BLACK);
  epd.drawLine(x + 2, y + 1, x + 20, y + 13, GxEPD_WHITE);
  epd.drawLine(x + 2, y + 2, x + 20, y + 14, GxEPD_BLACK);
}

void drawOverlay(const Overlay& ov) {
  char txt[12];
  if (ov.pct >= 0) snprintf(txt, sizeof(txt), "%d%%", ov.pct);
  else strcpy(txt, "?");
  epd.setFont(&FreeSansBold9pt7b);
  int16_t x1, y1;
  uint16_t tw, th;
  epd.getTextBounds(txt, 0, 0, &x1, &y1, &tw, &th);

  const bool offline = ov.icons & Icons::OFFLINE;
  const bool low = ov.icons & Icons::LOW_BATT;
  int boxW = 6 + 26 + 4 + (int)tw + 6 + (offline ? 26 : 0);
  int boxX = OVERLAY_X + OVERLAY_W - boxW;
  const int boxY = OVERLAY_Y, boxH = OVERLAY_H;
  epd.fillRoundRect(boxX, boxY, boxW, boxH, 6, GxEPD_WHITE);  // readable over any picture
  epd.drawRoundRect(boxX, boxY, boxW, boxH, 6, GxEPD_BLACK);
  int x = boxX + 6;
  if (offline) { cloudOff(x, boxY + 4); x += 26; }
  batteryIcon(x, boxY + 5, ov.pct, ov.icons & Icons::CHARGING);
  x += 30;
  epd.setTextColor(GxEPD_BLACK);
  epd.setCursor(x - x1, boxY + 16);
  epd.print(txt);

  if (low && !(ov.icons & Icons::CHARGING)) {
    // Black pill with white text under the battery: hard to miss, easy to read.
    const char* msg = "please charge me";
    epd.setFont(&FreeSans9pt7b);
    epd.getTextBounds(msg, 0, 0, &x1, &y1, &tw, &th);
    int pw = (int)tw + 28, ph = 22;
    int px = OVERLAY_X + OVERLAY_W - pw, py = boxY + boxH + 4;
    epd.fillRoundRect(px, py, pw, ph, 11, GxEPD_BLACK);
    epd.setTextColor(GxEPD_WHITE);
    epd.setCursor(px + 8 - x1, py + 16);
    epd.print(msg);
    heart(px + pw - 12, py + 8, 10, GxEPD_WHITE);
    epd.setTextColor(GxEPD_BLACK);
  }
}

void refresh() {
  uint32_t t = millis();
  epd.display(false);  // false = full refresh
  LOGF("e-paper refresh %lu ms", (unsigned long)(millis() - t));
  epd.hibernate();
}

// esp_qrcode calls back into a plain function, so pass placement through statics.
int g_qrX, g_qrY, g_qrScale;
void qrDraw(esp_qrcode_handle_t qr) {
  int n = esp_qrcode_get_size(qr);
  epd.fillRect(g_qrX - 2 * g_qrScale, g_qrY - 2 * g_qrScale, (n + 4) * g_qrScale, (n + 4) * g_qrScale, GxEPD_WHITE);
  for (int y = 0; y < n; y++)
    for (int x = 0; x < n; x++)
      if (esp_qrcode_get_module(qr, x, y))
        epd.fillRect(g_qrX + x * g_qrScale, g_qrY + y * g_qrScale, g_qrScale, g_qrScale, GxEPD_BLACK);
}

}  // namespace

namespace Display {

void begin() {
  if (g_begun) return;
  // 2 ms reset pulse suits Waveshare modules with the "clever" reset circuit.
  epd.init(0, true, 2, false);
  static_assert(EPD_ROTATION == 0 || EPD_ROTATION == 2, "bitmaps are 400x300 landscape: use 0 or 2");
  epd.setRotation(EPD_ROTATION);
  epd.setTextWrap(false);
  epd.setFullWindow();
  g_begun = true;
}

void sleep() { if (g_begun) epd.hibernate(); }

void showMessage(const uint8_t* pixels, const Overlay& ov) {
  begin();
  epd.fillScreen(GxEPD_WHITE);
  epd.drawBitmap(0, 0, pixels, 400, 300, GxEPD_BLACK);
  drawOverlay(ov);
  refresh();
}

void showWelcome(const Overlay& ov) {
  begin();
  epd.fillScreen(GxEPD_WHITE);
  heart(200, 105, 90, GxEPD_BLACK);
  epd.setTextColor(GxEPD_BLACK);
  centered(WELCOME_LINE1, 215, &FreeSansBold12pt7b);
  centered(WELCOME_LINE2, 250, &FreeSans9pt7b);
  drawOverlay(ov);
  refresh();
}

void showSetupNeeded() {
  begin();
  epd.fillScreen(GxEPD_WHITE);
  epd.setTextColor(GxEPD_BLACK);
  centered("Heart Frame - setup needed", 60, &FreeSansBold12pt7b);
  centered("Connect USB and run tools/provision.py", 120, &FreeSans9pt7b);
  centered("(stores the repo, token and message key)", 150, &FreeSans9pt7b);
  heart(200, 205, 50, GxEPD_BLACK);
  refresh();
}

void showPortal(const char* apName, const char* apPass) {
  begin();
  epd.fillScreen(GxEPD_WHITE);
  epd.setTextColor(GxEPD_BLACK);
  epd.setFont(&FreeSansBold12pt7b);
  epd.setCursor(12, 32);
  epd.print("Wi-Fi setup");
  epd.setFont(&FreeSans9pt7b);
  const char* lines[] = {"1. Scan code, or join Wi-Fi:", "", "", "2. A page opens (or visit", "    192.168.4.1)", "3. Choose your home Wi-Fi", "    and type its password.", "Closes after 10 minutes."};
  int y = 70;
  for (int i = 0; i < 8; i++) {
    epd.setCursor(12, y);
    if (i == 1) { epd.setFont(&FreeSansBold9pt7b); epd.print(apName); epd.setFont(&FreeSans9pt7b); }
    else if (i == 2) { epd.print("password: "); epd.setFont(&FreeSansBold9pt7b); epd.print(apPass); epd.setFont(&FreeSans9pt7b); }
    else epd.print(lines[i]);
    y += 26;
  }
  // QR code that makes a phone join the setup hotspot ("WIFI:" URI format).
  char uri[128];
  snprintf(uri, sizeof(uri), "WIFI:T:WPA;S:%s;P:%s;;", apName, apPass);
  esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
  cfg.display_func = qrDraw;
  cfg.max_qrcode_version = 8;
  cfg.qrcode_ecc_level = ESP_QRCODE_ECC_MED;
  g_qrScale = 4;
  g_qrX = 262;
  g_qrY = 96;
  if (esp_qrcode_generate(&cfg, uri) != ESP_OK) LOGF("QR generation failed");
  refresh();
}

void showChargeMe() {
  begin();
  epd.fillScreen(GxEPD_WHITE);
  heart(200, 95, 110, GxEPD_BLACK);
  epd.setTextColor(GxEPD_BLACK);
  centered("Please charge me", 225, &FreeSansBold12pt7b);
  centered("Plug in USB-C. I'll wake up by myself.", 260, &FreeSans9pt7b);
  refresh();
}

void showTestPattern() {
  begin();
  epd.fillScreen(GxEPD_WHITE);
  for (int i = 0; i < 10; i++) epd.drawRect(i * 4, i * 4, 400 - i * 8, 300 - i * 8, GxEPD_BLACK);
  for (int x = 0; x < 16; x++)
    for (int y = 0; y < 4; y++)
      if ((x + y) % 2 == 0) epd.fillRect(80 + x * 15, 60 + y * 15, 15, 15, GxEPD_BLACK);
  heart(200, 170, 80, GxEPD_BLACK);
  epd.setTextColor(GxEPD_BLACK);
  centered("e-paper OK", 270, &FreeSansBold12pt7b);
  Overlay ov{100, 0};
  drawOverlay(ov);
  refresh();
}

}  // namespace Display
