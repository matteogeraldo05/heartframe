## 6. Wiring, pinout and the LED power switch

### 6.1 Identify your leftover LEDs (2 minutes)

1. **Look at the strip's printing.** "5V" plus "WS2812B" or "SK6812" is good. "12V" means WS2811/WS2815, which won't work on one Li-ion cell: buy 4 WS2812B pixels instead.
2. **Count the pads:** 3 pads (5V, DIN/DO, GND) = RGB, good. 4 pads with "BI" or "DI/BI" = WS2813 (works; ignore BI and tie it to GND). An "RGBW" label means SK6812 RGBW: change `LED_ORDER` to `NEO_GRBW` and it will need small code changes. Avoid it.
3. **Arrows** show data direction: DIN is where the arrow starts.
4. You'll power them from the battery (3.5–4.2 V). WS2812B are specified from 3.5 V. At 3.7 V the blue and green channels can be slightly dimmer, which hot pink tolerates well because it's mostly red.

### 6.2 Pin map (Adafruit ESP32-S3 Feather)

| Feather pin | GPIO | Connects to | Notes |
|---|---|---|---|
| **3V** | 3.3 V | e-paper VCC; one side of the button | 3.3 V rail (stays on in deep sleep) |
| **GND** | – | e-paper GND, interface board GND | common ground |
| **SCK** | 36 | e-paper CLK | hardware SPI |
| **MO** | 35 | e-paper DIN | hardware SPI (MOSI) |
| **D10** | 10 | e-paper CS | |
| **D9** | 9 | e-paper DC | |
| **D6** | 6 | e-paper RST | held LOW in deep sleep (powers the module's level shifter down) |
| **D5** | 5 | e-paper BUSY | input |
| **D12** | 12 | 330 Ω → heart DIN | WS2812 data |
| **D11** | 11 | 1 kΩ → 2N7000 gate | HIGH = heart LEDs powered |
| **A1** | 17 | button (other side to 3V) + 100 kΩ to GND | HIGH = pressed. RTC pin: wakes from sleep |
| **A2** | 16 | USB-sense divider midpoint | HIGH = USB present. RTC pin: wakes on plug-in |
| **BAT** | VBAT | P-MOSFET source (heart power) | battery voltage (3.3–4.2 V) |
| **USB** | VBUS | 100 kΩ → A2 | 5 V only when USB is plugged in |
| **EN** | EN | slide switch → GND | switch closed = everything off (charging still works) |
| (built in) | 3, 4, 7, 21, 33 | SDA, SCL, I²C power, NeoPixel power, NeoPixel | MAX17048 is on I²C 0x36; the firmware turns these rails off for sleep |

### 6.3 Whole system

```
              ┌──────────────────────────────────────────────┐
  USB-C ─────►│         Adafruit ESP32-S3 Feather            │◄── JST-PH ── 18650, protected, 2200 mAh
 (right side) │   charger · MAX17048 gauge · 3.3 V regulator │
              └────┬───────────────────┬──────────────────┬──┘
                   │                   │                  │
        8-wire cable:          BAT, USB, GND, 3V,       EN ── on/off slide switch ── GND
        3V GND MO SCK          D11, D12, A1, A2          (back cover)
        D10 D9 D6 D5                   │
                   │                   ▼
                   ▼          ┌─────────────────────┐   LED+, DATA, GND   ┌──────────────────────┐
         ┌─────────────────┐  │  interface board    │────────────────────►│ heart board          │
         │ 4.2" e-paper    │  │  Q1 Q2 F1 R1–R8 C1  │                     │ 4 × WS2812B + 10 µF  │
         │ module (V2)     │  └──────────┬──────────┘                     └──────────────────────┘
         └─────────────────┘             │ 2 wires
                                   [push button] (top edge)
```

### 6.4 Interface board schematic (LED power switch, USB sense, button pull-down)

```
 VBAT (Feather BAT)
   │
   ├───────────────┬──────────────┐
   │               │              │ S
 C1 100nF       R1 100k      ┌────┴────┐
   │               │         │   Q1    │  AO3401A P-MOSFET (SOT-23 on breakout)
   └───────┬───────┘         │  G    D │
           │                 └──┬───┬──┘
      gate node ────────────────┘   │ D
           │                        └──[F1 0.5 A PTC]────────────► LED+  (to heart board)
          R2 1k
           │
           │ D
      ┌────┴────┐
      │   Q2    │  2N7000 N-MOSFET (TO-92)
      │  G   S  │
      └──┬───┬──┘
         │   └──────────────────────────────────────────────────► GND
 D11 ──R3 1k──┤
              R4 100k
              │
             GND

 D12 ──R5 330Ω──────────────────────────────────────────────────► DATA (heart DIN)

 USB (5V) ──R6 100k──┬──► A2 (GPIO16)          5 V × 150/250 = 3.0 V when plugged in
                     R7 150k
                     │
                    GND

 3V ──── [button] ───┬──► A1 (GPIO17)          HIGH while pressed
                     R8 100k
                     │
                    GND
```

How it works:

- **Off (default, and in deep sleep):** R4 holds Q2 off, so R1 pulls Q1's gate up to VBAT and Q1 is off. The LEDs get no power at all and draw zero current.
- **On:** D11 goes HIGH, Q2 conducts, and Q1's gate is pulled low through R2, so Q1 connects VBAT to the LEDs. R2 and C1 slow the switch-on to about 0.1 ms. That avoids a current spike which could reset the ESP32, or trip the cell's protection when the 10 µF capacitor charges.
- The firmware drives DATA low *before* removing power and leaves it floating while off, so the LEDs can't be powered backwards through their data pin.
- **F1** limits a short in the heart wiring to a fraction of an amp. It resets itself when cool.
- Pin-out reminder: **AO3401A** (SOT-23, marking up, two pins towards you): left = 1 = **G**, right = 2 = **S**, and the single pin on the far side = 3 = **D**. **2N7000** (TO-92, flat face towards you, legs down): **S, G, D** from left to right. Always check against your part's datasheet.
- **Can't solder SOT-23?** All-through-hole fallback: replace Q1 with a **BC327** PNP (emitter to VBAT, collector to LED+ via F1, base via 470 Ω to Q2's drain, 10 kΩ from base to emitter). It drops about 0.1 V more; still fine.

### 6.5 Heart board

A 44 × 40 mm piece of perfboard. The four WS2812Bs sit roughly under the heart's two lobes and centre, facing forward. From a strip, cut 4 single pixels (on the cut lines) and chain them with short wires: DOUT of one → DIN of the next, all VDD together, all GND together. Put the 10 µF (and a 100 nF if your pixels don't have their own) across VDD/GND right at the first pixel.

```
        heart outline (36 mm) seen from the front
          ____     ____
        /  [1]  \ /  [2]  \          [1] (x=-8, y=+5)   [2] (x=+8, y=+5)
       |          ▼        |         [3] (x=-6, y=-4)   [4] (x=+6, y=-4)
        \   [3]      [4]  /          positions in mm from the heart centre
          \             /            DIN -> 1 -> 2 -> 4 -> 3
            \         /
              \     /
                \ /
```

The firmware treats all four pixels identically, so their order doesn't matter as long as the chain is continuous.

### 6.6 Colour: hot pink, not pale

LEDs don't render colour like screens do. The screen colour "hot pink" (255, 105, 180) looks pale on WS2812 because green mixes in white. The default is **R 255, G 8, B 72**, with green near zero. Tune it through the actual diffuser (Milestone 2):

```
led 255 8 72 160      (r g b brightness)  - try G 0..20, B 50..110
led off
```

Copy your favourite into the web app's Settings → Heart colour (hex, e.g. `#ff0848`) and Brightness.
