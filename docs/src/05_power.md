## 5. Power budget and battery life

### 5.1 Why the board choice matters most

The frame spends more than 99.9 % of its life asleep, so **sleep current dominates**. Measured deep-sleep currents of common boards:

| Board | Deep sleep | Days of sleep alone on 1870 mAh usable |
|---|---|---|
| NodeMCU ESP-32S (AMS1117 + CP2102) | **4.7 mA** | ~17 days |
| LilyGO ESP32 OLED | **9.4 mA** | ~8 days |
| WEMOS LOLIN32 on a 3.7 V battery | 0.13 mA | ~1.6 years |
| **Adafruit ESP32-S3 Feather** (NeoPixel + I²C power off) | **~0.1 mA** (Adafruit's figure) | ~2 years |
| Adafruit ESP32-C6 Feather | 0.072 mA (Adafruit measurement) | ~3 years |
| 4 × WS2812B left powered (no MOSFET) | +2.4–4 mA | ~3 weeks |

So the two things that matter are a board designed for batteries and a MOSFET that actually cuts the LEDs off.

### 5.2 Current in each state

| State | Current | Time | Charge |
|---|---|---|---|
| Deep sleep: Feather ~100 µA + e-paper module ~10 µA + cell protection ~3 µA + LED switch <1 µA | **~115 µA** | ~24 h/day | **2.8 mAh/day** |
| Check with no news: boot, Wi-Fi (fast reconnect), TLS, one conditional GET (304) | ~100–130 mA avg | 3–6 s | **0.15–0.2 mAh** |
| New message: + 1–2 bitmap downloads + 4 s e-paper refresh + 10 s heart pulse | ~40–120 mA | +15 s | **+0.3 mAh** |
| Daily full refresh (no Wi-Fi) | ~45 mA | ~4 s | 0.05 mAh |
| Heartbeat (one extra HTTPS POST, every 6 h) | ~100 mA | ~1 s | 0.03 mAh |
| Heart pulse alone (4 LEDs, pink, 160/255 cap, sine-shaped) | ~25 mA avg, 45 mA peak | 10 s | 0.07 mAh |

### 5.3 Battery life (2200 mAh cell, 85 % usable = 1870 mAh)

| Schedule | Checks/day | mAh/day | Battery life (before self-discharge) |
|---|---|---|---|
| Your draft: 2 checks/day | 2 | ≈ 3.7 | ~16 months, so in practice **self-discharge sets the limit (about a year)** |
| **Default: hourly 07:00–23:00, 15 min on USB** | 16 | ≈ 6.5 | **~9 months** |
| Pessimistic router (slow DHCP, 8 s per check) | 16 | ≈ 9 | ~7 months |
| Every 15 min, 07:00–23:00 | 64 | ≈ 16 | ~4 months |
| Default, but a board with 4.7 mA sleep | 16 | ≈ 118 | **~16 days** |

Li-ion cells lose roughly 2–3 % a month on their own. **Expect 6–9 months per charge with the defaults.** The heartbeat reports battery % so you'll know long before she does.

**Charging:** the Feather's charger is a linear CC/CV Li-ion charger. It charges gently, so a full charge of 2200 mAh takes several hours: plug it in overnight. Measure the actual charging current with the USB power meter in Milestone 3. The frame works normally while charging and checks every 15 minutes.

**Low-battery behaviour:** at ≤ 15 % a "please charge me ♥" pill appears. Below **3.45 V** at rest, a full-screen "Please charge me" is drawn and Wi-Fi stops. E-paper keeps that picture with zero power. The protection circuit disconnects the cell at 2.75 V, but that point should never be reached. Plugging in USB wakes the frame immediately and shows the ⚡.
