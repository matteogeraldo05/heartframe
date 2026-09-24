## 4. Tools and a soldering primer

### 4.1 Set up once

- **Iron temperature:** 320 °C for leaded solder, 350 °C for lead-free. Hotter isn't better: it burns flux away and lifts pads.
- **Tinning:** when the iron is hot, melt a little solder onto the tip. A shiny tip moves heat; a grey tip doesn't. Wipe on brass wool and re-tin often. Tin the tip again before switching the iron off.
- **Ventilation:** a desk fan blowing the flux smoke *away* from you (not onto the joint).
- **Safety:** glasses on when trimming leads (they fly). The iron stays in its stand. Wash your hands after handling leaded solder.
- **Static:** touch something grounded before handling the Feather or the display.

### 4.2 How a good joint is made

1. **Heat the joint, not the solder.** Touch the tip so it contacts *both* the pad and the pin or wire.
2. After about 1 s, feed solder into the joint on the side opposite the tip, not onto the tip.
3. When it flows around (about 1–2 s more), remove the solder, then the iron.
4. Don't move anything for 2 s while it solidifies.

A good through-hole joint is a **shiny concave "volcano"** that wets both pad and pin. A ball sitting on top (cold joint), a dull grainy surface, or a bridge to a neighbour are bad joints. Fix them by adding flux and reheating. Remove excess with braid.

### 4.3 The specific joints in this build

| Joint | Where | How |
|---|---|---|
| **Header pins** (practice, dev Feather only) | Milestone 1 | Push the headers into a breadboard, lay the Feather on top (this keeps them straight). Solder one pin at each end first, check alignment, then the rest. 28 joints of practice. |
| **Wire into a through-hole pad** (final Feather) | Milestone 6 | Strip 3 mm, twist, **tin the wire**. Insert from the component side, bend slightly to hold, solder from the underside. Trim flush. Pull gently to test. Leave slack and route along the board. |
| **SOT-23 MOSFET onto a breakout** | Milestone 2 | Flux the pads. Put a tiny blob on **one** pad. Hold the MOSFET with tweezers and reflow that pad to tack it, then check alignment (pin 1 dot). Solder the other two pads with a little solder each. Inspect with your phone's camera zoom; clear bridges with flux + braid. Buy 5, because one may die while you learn. |
| **Perfboard parts** (resistors, 2N7000, caps, PTC) | Milestone 2 | Bend leads, insert, splay the leads on the back to hold them, solder, trim. Make connections by bending trimmed leads along the pads or with short wire links. Follow the layout in §6. |
| **Wires onto WS2812 strip pads** | Milestone 2 | Cut the strip only on the copper cut lines. Flux, pre-tin the pads (a thin dome), pre-tin the wire, lay the wire on the pad and press with the iron until both melt together (about 1 s). Add strain relief with a dab of hot glue or UV resin over the joints. Check the **arrow direction** (DIN → DOUT). |
| **Button and switch lugs** | Milestone 6 | Slide heat-shrink onto the wire *first*. Tin the lug and the wire, join, then shrink the tubing over the lug. |
| **Display cable** | Milestone 6 | Cut the Dupont ends off the Waveshare cable, strip and tin, and solder directly into the final Feather's holes. Dupont connectors come loose in a gift. |

### 4.4 Rules that prevent the classic beginner disasters

- **Never let battery leads touch each other or anything metal.** When the battery is unplugged, keep its JST plug in its bag.
- **Measure polarity before plugging any battery into the Feather** (red lead = +, and on the Feather the JST's + is marked). Wrong polarity destroys the charger.
- Solder with **the battery unplugged and USB unplugged**.
- After soldering a board, **check with the multimeter for shorts** between power and GND before powering it (continuity mode must not beep; resistance should be kilohms or more).
- When something doesn't work, re-flow suspicious joints with flux before rewriting code.
