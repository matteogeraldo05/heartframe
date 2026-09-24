## 3. Bill of materials

Prices are approximate CAD as of late September 2026. Check stock and landed cost (HST, brokerage) when you order. Order from Canadian stores or DigiKey.ca/Mouser.ca, which ship by courier in 1–3 days. For anything on the critical path, **avoid AliExpress** (2–4 weeks, variable quality) and **avoid Canada Post** in November (strikes in recent years).

"Solder?" = whether you'll solder this part.

### 3.1 Core electronics

| # | Part | Qty | Solder? | ≈ CAD | Where | Notes / cheaper alternatives |
|---|---|---|---|---|---|---|
| E1 | **Adafruit ESP32-S3 Feather, 8 MB flash, no PSRAM** (#5323) | **2** | yes (wires/headers) | 27.45 each | PiShop.ca, DigiKey.ca | One for the breadboard prototype (with headers), one for the final build (wires soldered straight on). The spare is insurance against ESD, a lifted pad or a late bug, and later it's your dev board. **Alt:** #5477 (4 MB + 2 MB PSRAM) works: use `pio run -e feather_s3_4mb`. **Cheaper alt (not covered here):** Seeed XIAO ESP32-S3 (~$11, ~14 µA sleep) + MAX17048 breakout (#5580). Needs pin changes and soldering battery pads. |
| E2 | **Waveshare 4.2inch e-Paper Module, V2** (400×300 B/W, SSD1683) | 1 | no | 35–45 | Amazon.ca (sold by Waveshare), DigiKey.ca, RobotShop | Check for a **"V2"/Rev 2.x** sticker on the back. V1 (UC8176) also works: set `EPD_IS_GDEY042T81 0`. Comes with an 8-wire cable. **Alt:** bare Good Display GDEY042T81 + DESPI-C02 adapter (cheaper, lower sleep current, fragile ribbon). |
| E3 | **Li-ion 18650 3.7 V 2200 mAh, protected, JST-PH** (Adafruit #1781) | 1 | no | ~14 | PiShop.ca, DigiKey.ca | Correct polarity for Feathers, 4.2 V/2.75 V/over-current protection built in. **Slim alt:** Adafruit 2000 mAh pouch (#2011), with `battery = "pouch"` in the enclosure (about 9 mm thinner). |
| E4 | WS2812B pixels | 4 | yes | (your leftovers) | – | Run the §6 check first. If they're 12 V or you'd rather not cut a strip: Adafruit NeoPixel Mini PCB 5-pack (#1612) or a 60 LED/m WS2812B strip. |
| E5 | **JST-PH battery extension cable, 500 mm** (Adafruit #1131) | 2 | cut + splice | ~4 each | PiShop.ca, Abra, DigiKey.ca | One gets cut open for the sleep-current measurement in M3 (meter in series). The other is a spare, or a longer battery lead if your layout needs it. |

### 3.2 LED switch / interface board

| # | Part | Qty | Solder? | ≈ CAD | Notes |
|---|---|---|---|---|---|
| S1 | **AO3401A** P-MOSFET, SOT-23 | 5 (spares) | yes (small SMD) | 3 | Or IRLML6402 (same pinout). Needs S2. |
| S2 | SOT-23 to DIP breakout board (e.g. SparkFun BOB-00717 or a generic 6-pack) | 2 | yes | 3–8 | Makes the tiny MOSFET breadboard-friendly. |
| S3 | **2N7000** N-MOSFET, TO-92 | 3 | yes | 2 | Level shifter for the P-MOSFET gate. |
| S4 | Resistors, 1/4 W: **100 kΩ ×5, 150 kΩ ×1, 1 kΩ ×3, 330 Ω ×2** | – | yes | 10 (kit) | A 1/4 W assortment kit is handy. |
| S5 | Capacitors: **100 nF ceramic ×3, 10 µF ceramic** (or 47 µF 10 V electrolytic) **×2** | – | yes | 5 | 100 nF = soft-start + decoupling. 10 µF sits at the LEDs. |
| S6 | **PTC resettable fuse, 0.5 A hold** (e.g. Bourns MF-R050) | 2 | yes | 2 | In the LED supply line, so a pinched wire in the heart can't short the battery. |
| S7 | Double-sided prototype board, 5 × 7 cm | 2 | yes | 6 (pack) | One cut down for the interface board (~25 × 30 mm), one for the heart board (44 × 40 mm). |
| S8 | **7 mm panel-mount momentary push button**, normally open (PBS-110 / R13-507 style) | 2 | yes (2 lugs) | 5 (pack) | Goes in the top edge. |
| S9 | Mini slide switch SPDT (SS12D00G4) | 2 | yes | 5 (pack) | On/off switch (Feather EN → GND). |
| S10 | Silicone stranded wire, 26 AWG, 4–6 colours | – | yes | 15 | Silicone insulation doesn't melt back under the iron. |
| S11 | Heat-shrink tubing assortment (1.5–6 mm) | – | – | 8 | Every joint that isn't on a board gets heat-shrink. |

### 3.3 Mechanical

| # | Part | Qty | ≈ CAD | Notes |
|---|---|---|---|---|
| M1 | Enclosure prints: front, back, 4 diffuser candidates, **SLA 9600 matte white resin** (JLC3DP), 4 × M3 threaded inserts fitted by the printer | 1 set | ≈ 60–110 landed (DHL, HST, brokerage). Get the instant quote. | §12.8 has the ordering guide. Before ordering: paper template (free) + a PLA dry run on a library 3D printer (≈ $15–40), §12.7. |
| M2 | M3 × 8 countersunk screws (ISO 10642), stainless | 4 (+spares) | 5 | Back cover into the inserts. (M3 × 12 + M3 nuts if you choose `fastener = "nut"`.) |
| M3 | M2.5 × 10 pan-head screws + M2.5 nuts (nylon or steel) | 4 + 4 | 5 | Feather standoffs. |
| M4 | EVA foam tape, 1.5–2 mm | small roll | 6 | Pads on the display pressers, under the battery. |
| M5 | Double-sided foam mounting tape (3M) | small roll | 6 | Heart board and interface board. |
| M6 | Hook-and-loop strap 10 mm, or a zip tie | 1 | 3 | Holds the battery in its cradle. |
| M7 | Clear UV-curing resin or clear epoxy | small | 8 | Fixes the diffuser (a dab at the flange). |
| M8 | Small silicone bumper feet | 4 | 4 | Bottom edge and stand fins. |
| M9 | **USB-C cable with a slim plug** (overmold ≤ 12 × 6.5 mm), white, 1–2 m | 1 | 10–15 | Include it with the gift. Chunky plugs won't reach the socket through the wall. |

### 3.4 Tools (see §4)

| Tool | ≈ CAD | Notes |
|---|---|---|
| Temperature-controlled soldering iron: **Pinecil V2** (USB-C powered) + a fine conical and a small chisel tip | 45–60 | PiShop.ca. A Hakko FX-888D is the classic bench alternative. |
| Solder: 0.6–0.8 mm, **63/37 leaded rosin-core** (easiest to learn) or SAC305 lead-free | 15 | With leaded solder: wash your hands, no food at the bench. |
| Flux pen (no-clean) + desoldering braid | 15 | Flux is what makes SMD and wire joints easy. |
| Brass-wool tip cleaner, helping hands / PCB holder, silicone mat | 25 | |
| Flush cutters, wire strippers (26 AWG), fine tweezers | 30 | |
| **Multimeter with a µA range** (e.g. UNI-T UT139C, Kaiweets HT118A) | 40–70 | Needed for polarity checks and the **sleep-current milestone**. |
| **Digital calipers** (150 mm) | 20–30 | For the measurement checklist (§12.6). |
| USB-C power meter ("USB tester") | 15 | Shows charging current and confirms the charger works. |
| Small desk fan or fume extractor, safety glasses | – | |
| Breadboard (830 points) + jumper wires (M-M, M-F) | 15 | For milestones 1–4. |

### 3.5 Services (free)

GitHub (personal account with 2FA), Tailscale (Personal plan), healthchecks.io (free tier, optional).

### 3.6 What to buy first (this week)

1. **Today:** 2 × Feather (E1), 18650 (E3), display (E2), Pinecil + solder + flux + braid, multimeter, calipers, breadboard + jumpers. These gate Milestones 1–3.
2. **Same order or next day:** everything in 3.2 (small parts, all cheap), USB-C cable, foam tapes, heat-shrink, silicone wire.
3. **Mid-October:** PLA dry run on a library 3D printer (after you've measured your parts, §12.6).
4. **By Nov 1:** final enclosure print from JLC3DP (§12.8). Screws now.
5. Optional practice: a "learn to solder" kit (≈ $10) if you've never soldered. Do it on the first evening.

**Rough totals:** parts about $180–260 including prints and shipping, tools about $150–200 (reusable).
