## 12. Enclosure

### 12.1 The design

```
          ◄─────────────────── 118.9 mm ───────────────────►
        ╭──────────────────────────────────────[button]──────╮  ▲
        │                                                    │  │
        │    ┌──────────────────────────────────────────┐    │  │
        │    │                                          │    │  │
        │    │   window 86.4 × 65.2 mm                  │    ╞══ USB-C (right side)
        │    │   (active area 84.8 × 63.6 + 0.8 mm)     │    │  │
        │    │   45° bevel on the front edge            │    │ 148.6 mm
        │    │                                          │    │  │
        │    └──────────────────────────────────────────┘    │  │
        │                                                    │  │
        │                     ♥  36 mm                       │  │
        │              (diffuser, glows pink)                │  │
        │                                                    │  │
        ╰────────────────────────────────────────────────────╯  ▼
           Depth 35 mm (26.3 mm with the pouch cell). On the back: on/off slide
           switch, 3 vents by the battery, 4 countersunk M3 screws, 2 stand fins.
```

Three printed parts:

| Part | What it does |
|---|---|
| **Front shell** (`front.stl`) | Front plate with the bevelled window and heart opening, side walls, a 3 mm rim that locates the display module, the heart light chamber, 4 corner bosses with M3 brass inserts, USB-C opening (right side), button hole (top). |
| **Back cover** (`back.stl`) | Plate with an alignment lip, 4 posts that press the module forward (with foam pads), battery cradle with strap slots and end stops, Feather standoffs, a platform for the heart board, the switch pocket and slot, vents, 2 stand fins. |
| **Diffuser** (`diffuser_<t>.stl`) | A heart-shaped plug that sits flush with the front face. A flange behind the front plate stops it from being pushed out. The light-emitting face is `t` mm thick; four candidates are exported and you pick one after a glow test. |

Renders are in `enclosure/renders/` (`front.png`, `section.png`, `inside.png`) and `stl/assembly.png`.

### 12.2 Dimension logic (where every millimetre comes from)

Nothing in the model is a free-floating number: the outside is derived from your measured parts. Change a measurement and the box follows.

| Dimension | Stack-up | Value |
|---|---|---|
| **Width** | The window must be centred on the frame, but the active area is off-centre on the module PCB: its centre is 46.25 mm from the PCB's left edge and 56.75 mm from its right edge. So the **longer** side sets the width: 2 × (56.75 + 0.3 fit + 2.4 wall) | **118.9 mm** |
| **Height** | wall 2.4 + bottom margin 7 + heart chamber 39.7 + gap 5 + module 78.5 + 2 × 0.3 fit + top margin 13 (room for the insert corner blocks) + wall 2.4 | **148.6 mm** |
| **Depth** | front plate 2.4 + glass 1.2 + PCB 1.6 + module back parts 6 + battery 18.6 + 1.5 clearance + 1.5 + back plate 2.2 | **35.0 mm** (26.3 with the pouch) |
| Window | active area + 0.8 mm per side, so ±0.3 mm of print and assembly error never hides pixels. The 1.2 mm 45° bevel stops the front plate casting a shadow line on the image. | 86.4 × 65.2 mm |
| Heart | 36 mm wide. The LEDs sit **12 mm** behind the diffuser inside a closed white chamber, so the four points of light blur into one glow. | chamber 1.6 mm walls |
| Corner blocks | Insert hole Ø4.0 × 7.0 mm, centre 7.5 mm from both outer edges, ≥ 3 mm wall, **14 × 14 mm flat area** (JLC3DP's insert rules) | 12.1 × 12.1 mm blocks |
| USB-C opening | 12.6 × 7.2 mm; the Feather's receptacle sits 0.5 mm behind the inside of the wall | needs a **slim plug** (≤ 12 × 6.5 mm overmold, BOM M9) |

`openscad` prints `Outer size W x H x D = ...` every time it runs, so you see the effect of each change immediately.

### 12.3 Rules the model follows (and why)

| Rule | In the model | Source / reason |
|---|---|---|
| Wall ≥ 2.0 mm for a part this size (SLA) | walls and front 2.4 mm, back 2.2 mm | JLC3DP design guideline: 2.0 mm for 200 × 200 mm parts |
| Clearance ≥ 0.2 mm between assembled parts | `fit = 0.3` per side (use 0.45 for FDM/PLA) | JLC3DP guideline; SLA tolerance is ±0.2 mm up to 100 mm, ±0.3 % above |
| Embossed/engraved detail ≥ 0.8 mm | none on the outside (kept plain on purpose) | JLC3DP guideline |
| No closed hollow volumes | none; every cavity opens to the inside of the box | trapped resin can crack an SLA part; escape holes would otherwise be needed |
| Inserts: fixed types only, 3 mm wall, 14 × 14 mm flat area, 2D drawing with the order | square corner blocks + `insert_drawing.pdf` | JLC3DP threaded-insert service |
| LED to diffuser 10–15 mm | 12 mm | shorter shows dots, longer gets dim and needs a taller box |
| Battery: no screws or sharp edges within 5 mm, can't be squeezed | cradle saddles, foam underneath, strap; the closest screw (a Feather standoff) is ~20 mm away | §11.4 |
| Heat out, and gas out in the worst case | 3 vent slots right behind the battery | §11.4 |
| Almost nothing depends on glue (only the diffuser, and a dab of hot glue on the switch) | display clamped by the rim + foam pressers, boards screwed or taped | you can open it and fix things later |
| Resin: heat-deflection 59 °C (9600), not for sunlight/UV | – | tell her: not on a radiator, not in a sunny window (the e-paper doesn't like direct sun either) |

Weak spot: the two **stand fins** are 4 mm resin plates. They're fine on a desk but can snap if the frame falls. The back cover is the cheapest part to reprint; order a spare if the quote allows.

### 12.4 Process and material

| Option | Look | Fit/accuracy | Strength | Verdict |
|---|---|---|---|---|
| **SLA, 9600 resin** (JLC3DP) | **matte white**, smooth | ±0.2 mm | tensile 55 MPa, somewhat brittle (5.5 % elongation) | **Use this** for all parts. A true white that looks like a product. |
| SLA, LEDO 6060 (JLC3DP) | off-white: its datasheet says "a little yellow" from new | ±0.2 mm | tougher (10 % elongation) | Skip. It resists *further* yellowing well, but it doesn't start white, and next to a pink room that shows. |
| SLA, 8001 translucent | clear/frosted | ±0.2 mm | – | Not for the diffuser: clear-ish resin shows the 4 LEDs as dots. White resin at 0.8–2.2 mm diffuses better. |
| MJF PA12 / SLS nylon (JLC3DP) | grey or dyed black, grainy | ±0.2–0.3 mm | strongest | Wrong colour for this gift unless painted. |
| FDM PLA (public or university library, $0.10–0.25/g) | layer lines | ±0.3–0.5 mm | fine | **Perfect for the dry run** (§12.7), not for the final look. |
| Local SLA/MJF (e.g. Forge Labs, Toronto) | depends | good | – | 2–5 business days and next-day shipping in Ontario, no customs. Usually pricier. Your plan B if JLC is slow. |

**Diffuser:** the same 9600 white resin. The face thickness decides brightness vs evenness; that's what the four `diffuser_<t>.stl` files are for.

### 12.5 The parametric model (OpenSCAD)

OpenSCAD is a "CAD as code" tool: the enclosure is `enclosure/heartframe.scad` and every size is a named value at the top. It's the right tool here because the box is entirely driven by measurements.

**Install and run (Fedora):**

```bash
sudo dnf install -y openscad python3-matplotlib
cd heartframe/enclosure
openscad heartframe.scad &          # the GUI
```

In the GUI:

1. **Window → Customizer.** The measurement blocks ("MEASURED - e-paper module", "MEASURED - electronics", "Design") appear as editable fields. Change values there, or in the text.
2. **F5** = quick preview (the default `part` is a cut-away assembly: white shell, pink diffuser, black glass, green boards, blue battery).
3. To look at one part, set `part` in the Customizer (`front`, `back`, `diffuser`, `section`, `front_view`, …) and press F5.
4. **F6** = full render. **File → Export → STL** exports that single part.

**Export everything at once** (what you'll normally do):

```bash
./export.sh                                    # all STLs + template + insert drawing (~1 min)
./export.sh -D 'fit=0.45' -D 'fastener="selftap"'   # e.g. the PLA dry run
```

`export.sh` writes, into `enclosure/stl/`:

| File | Use |
|---|---|
| `front.stl`, `back.stl` | the enclosure |
| `diffuser_0.8.stl` … `diffuser_2.2.stl` | the four diffuser candidates |
| `test_display.stl`, `test_boss.stl` | the SLA test kit (path B in §12.7 only) |
| `front_template.svg` / `.dxf` | 1:1 paper template of the front with the module's PCB outline; the DXF is for Onshape |
| `insert_drawing.png/.pdf` | the drawing JLC3DP needs for the inserts |
| `assembly.png` | preview |

Fedora 44 packages OpenSCAD 2021.01, the current stable release. It renders this model in under a minute, which is fine. Development snapshots with the much faster Manifold engine exist (`--backend=manifold`), but you don't need one.

**Parameters you'll actually touch:**

| Parameter | When |
|---|---|
| everything under MEASURED | after §12.6 |
| `fit` | 0.3 for SLA; 0.45 for FDM; +0.1 if the test fit is tight |
| `diffuser_face` | after the glow test (only matters for `part="diffuser"`; `export.sh` exports all four anyway) |
| `battery` | `"pouch"` if you switch to the 2000 mAh pouch (box gets 8.7 mm thinner) |
| `fastener` | `"insert"` (JLC inserts), `"nut"` (M3 nut slid into a side slot, M3 × 12 screws), `"selftap"` (FDM/MJF only) |
| `led_gap`, `heart_w`, `corner_r` | taste |
| `top_margin` | only if an `assert` tells you the insert blocks would touch the module |

### 12.6 Measure your real parts first (calipers checklist)

Datasheet numbers are close, but "close" is how you get a window 1 mm off. Measure **your** parts, with digital calipers, to 0.1 mm, and write the numbers straight into the MEASURED block. Do it after M1, with the test pattern on the screen.

**Orientation for everything below:** screen side facing you, flex cable at the **bottom** (that's how it sits in the frame; check `EPD_ROTATION`, §7 M1). "Left" and "bottom" mean as you look at the screen.

| ✓ | Parameter | How to measure | Typical |
|---|---|---|---|
| ☐ | `pcb_w`, `pcb_h`, `pcb_t` | module PCB outline and thickness | 103.0, 78.5, 1.6 |
| ☐ | `panel_w`, `panel_h` | glass outline | 90.1, 77.0 |
| ☐ | `panel_t` | total thickness at the glass minus `pcb_t` | 1.2 |
| ☐ | `panel_x`, `panel_y` | glass left edge → PCB left edge; glass bottom edge → PCB bottom edge | 1.2, 0.75 |
| ☐ | `aa_x`, `aa_y` | run `epd`: the **outermost rectangle** is the edge of the active area. Glass left edge → rectangle; glass bottom edge → rectangle (the wide border is on the flex side) | 2.65, 10.4 |
| ☐ | `aa_w`, `aa_h` | outer rectangle size (sanity check) | 84.8, 63.6 |
| ☐ | `module_back` | tallest thing on the back of the module **with the cable plugged in** (connector + plug) | 6.0 |
| ☐ | `fpc_edge`, `fpc_len` | edge where the flex cable wraps around, and the width of the bulge | bottom, 40 |
| ☐ | `presser_xy` | 4 spots on the module's back with no components, as (x, y) from the PCB corner that is **lower-left when you look at the screen** (lower-right when you look at the back) | corners |
| ☐ | `feather_l`, `feather_pcb_l`, `feather_w` | length including the USB-C overhang; PCB alone; width | 52.3, 50.8, 22.9 |
| ☐ | `feather_top` | tallest part on the component side **including your soldered wires** | 5.8 |
| ☐ | `feather_holes` | the 4 mounting-hole centres, from the PCB corner **away** from USB-C | 2.54 / 20.32 / 48.26 |
| ☐ | `usbc_z_on_pcb` | centre of the USB-C opening above the PCB top surface | 1.6 |
| ☐ | `batt_d`, `batt_l` | 18650 **with its heat-shrink and the protection board at the end**, plus the wire exit | 18.6, 70 |
| ☐ | `pouch` | if used: L, W, T (the model adds room for swelling) | 60, 36, 7.5 |
| ☐ | `led_board_w/h`, `led_h` | your cut heart board; pixel height | 44, 40, 1.6 |
| ☐ | `button_hole` | button thread diameter; also check the body below the panel is < 13 mm long | 7.2 |
| ☐ | `switch_body`, `switch_slot` | slide-switch body L × W × H; knob width + travel | 8.7 × 3.7 × 3.8; 5.0 × 2.2 |
| ☐ | USB-C cable plug | overmold width × thickness ≤ 12 × 6.5 mm (the opening is 12.6 × 7.2 mm with rounded corners), or widen the opening | – |
| ☐ | M3 countersunk head | head diameter ≤ 6.6 mm (the countersink) | 5.5–6.0 |

Then: `./export.sh`, check the echoed outer size, and look at `part="section"` (side cut) in the GUI for collisions.

### 12.7 Don't pay for a bad print: three cheap gates

| Gate | Cost | Time | Catches |
|---|---|---|---|
| **1. Paper template** | free | 15 min | Window position vs the real active area, overall proportions |
| **2. PLA dry run** (library 3D printer) | ≈ $15–40 | 1–2 weekends | Everything inside: module seating, Feather + USB-C alignment, battery, button, switch, wire lengths, stand |
| **3. Final SLA order** with all four diffusers | ≈ $60–110 landed | 1–2 weeks | Diffuser choice, final look |

**Gate 1, paper.** Open `stl/front_template.svg` in Firefox or Inkscape and print at **100 % / "actual size"** (not "fit to page"). Measure the printed outer width with calipers: it must be 118.9 mm; if not, fix the print scaling. Cut out the window and the heart with a craft knife. Run `epd` on the display, lay the module face-up on the table, and lay the template on top with the thin **PCB outline** on the template matching the module's edges. **Pass:** the outermost test-pattern rectangle is fully visible inside the window, with a thin even border all round.

**Gate 2, PLA dry run.** Both parts together are about 150 g of PLA including supports. Three libraries near you can print them:

| Where | Cost | How it works | Fit for you |
|---|---|---|---|
| **King Township Public Library, Make-It Lab** (King City) | $0.25/g ≈ $38 | Get certified once, book printer time, stay for the first 20 minutes, pick up later. Cubicon Single Plus: 240 × 190 × 200 mm (the front fits). | Closest to home. **First choice.** |
| Ontario Tech library (Oshawa) | $0.10/g ≈ $15 | Submit a request form; they print it for you ("course-related work, research and personal learning"; they can decline). Reply within 3 business days, printed within ~7 more; colour is whatever is loaded. | Cheapest, if you're on campus anyway during your co-op term. |
| Toronto Public Library (e.g. Toronto Reference Library) | $0.15/g ≈ $23 | TPL card needed. You prepare the job with staff and watch it. Most jobs are limited to 2 hours; each branch has one printer for longer jobs, so book that one. | Near your office, but you have to babysit a 5–8 h print. |

```bash
./export.sh -D 'fit=0.45' -D 'fastener="selftap"'     # FDM clearances, M3 screws self-tap into PLA
cp stl/front.stl ~/front_pla.stl; cp stl/back.stl ~/back_pla.stl
./export.sh                                          # back to the SLA settings afterwards!
```

Slice (or ask for) 0.2 mm layers, 3 perimeters, 15 % infill, supports on. When the parts are ready, do M5 (§7) with the working electronics. Keep the PLA case: it's your burn-in housing and your emergency fallback.

**Gate 3, order the final set** (§12.8), with all four diffusers. When it arrives, do the glow test: in a dim room, hold each diffuser in the heart opening with `led 255 8 72 160` running. Pick the **thinnest one that shows no separate dots**. Set `diffuser_face` to it so the repo matches reality.

**Path B (no PLA access).** Order an SLA test kit first: `test_display.stl` (front plate + rim: window alignment and module fit), `test_boss.stl` (one real corner with its insert) and the four diffusers. It's cheap to print, but a second shipment adds roughly $35–45 of shipping and brokerage. Then order the final parts.

### 12.8 Ordering from JLC3DP (step by step)

1. `./export.sh` with your final measurements. Check `stl/insert_drawing.pdf` shows 4 holes in the corners.
2. jlc3dp.com → **3D Printing** → **Instant quote**. Upload `front.stl`, `back.stl` and the four `diffuser_*.stl` files. Check the units show **mm** and the sizes match (front 118.9 × 148.6 × 32.8 mm).
3. For each part: process **SLA**, material **9600 Resin**. Quantity 1. Default finish.
4. On `front.stl`, add **threaded inserts**: 4 × **Type 1 "TTH-M3\*6.25-HD4.7"** (matches the Ø4.0 × 7.0 mm holes), and upload `insert_drawing.pdf`. If you'd rather use Type 5 (M3\*4\*5), set `insert_hole = 3.6` first and re-export.
5. In the remarks (if there's a field): *"Please keep supports off the flat front face (the face with the window and heart opening) of front.stl; it is the visible face."*
6. Shipping: **DHL Express** (or FedEx). If a **duties prepaid (DDP)** option is offered, compare its extra cost with paying on delivery. Canadian hobbyists report about $20 of brokerage/clearance charges on DHL deliveries that weren't prepaid.
7. JLC reviews the files (you may get an email about thin areas: the stand fins and the diffuser flange are intentional). Pay. Production is typically 2–4 working days, then shipping. Budget **1–2 weeks** door to door.
8. On arrival: check the insert threads with a screw, look for cracks around the bosses, test the USB-C plug through the opening, and do the glow test.

**Fasteners.** Brass inserts + 4 × M3 × 8 countersunk screws are the most robust option: you can open and close the frame many times. If inserts aren't available or you want to save the insert fee: `fastener = "nut"` gives round bosses with a side slot. Slide an M3 nut in with tweezers before closing, and use M3 × 12 screws. Resin is brittle, so **don't use self-tapping screws** in SLA parts.

### 12.9 Plan B: no 3D print at all

If the prints go wrong late in November, a picture-frame build looks deliberate, not like a fallback:

- **IKEA SANNAHED** (white, 27 × 27 cm, 6 cm deep, about $10 at IKEA Vaughan), or a **5 × 7 in shadow box with ≥ 1.5 in (38 mm) inside depth** from Michaels.
- Cut a new mat from white mat board: a window of 86.4 × 65.2 mm placed like the template (print `front_template.svg` and use it as a stencil), and the heart below.
- Behind the heart: 2–3 layers of white printer paper or vellum, then a light chamber made from a short tube of white card (12 mm deep) with the heart board at its back.
- Stick the display module to the back of the mat with foam tape. Mount the Feather, battery (in an 18650 holder), interface board and switch on a piece of foam board that replaces the frame's backing, with a notch for USB-C.
- Tools: steel ruler, sharp craft knife or a mat cutter, cutting mat.

A third option is the **PLA dry-run case**: sand it (240 → 400 grit), filler primer, then two thin coats of satin white spray paint. It won't look injection-moulded, but it's tidy.

### 12.10 Enclosure timeline

| When | Step |
|---|---|
| Weekend Oct 3–4 (after M1) | Measure (§12.6), update the model, gate 1 (paper). Book the library's 3D printer certification. |
| Thanksgiving weekend Oct 10–12 | Certification session (or submit the Ontario Tech request) |
| Weekends Oct 17–25 | Print and collect the PLA parts → M5 test fit with the working electronics; fix the model |
| **by Sun Nov 1** (latest Nov 8) | Order the final SLA set from JLC3DP |
| ~Nov 12–20 | Parts arrive → glow test; M6 final assembly on the weekend of Nov 21–22 |
| by Nov 29 | Last safe date to reorder a bad part (arrives by mid-December) |
| any evening | Plan B (§12.9) takes one evening and a trip to IKEA Vaughan or Michaels |

### 12.11 No-code alternative: Onshape

You don't have to write OpenSCAD to change sizes: the **Customizer** panel (§12.5) is a form, with no code involved. Use Onshape if you want to **redesign the shape** (softer curves, a different heart position) with a mouse. Fusion 360 isn't an option on Fedora: it runs on Windows, macOS, and a limited browser version.

**Account:** the Free plan works, but it makes every document public (harmless for an enclosure, though you may prefer she doesn't stumble on it). As a university student you qualify for the free **Student** plan, which keeps documents private.

**Rebuild the front shell** (about 2 hours the first time):

1. Take the exact 2D outline from `stl/front_template.dxf` (written by `export.sh`).
2. Onshape → **Create → Document** → **+ → Import** the DXF.
3. **Part Studio** → **Sketch** on the Front plane → **Insert DXF/DWG** (units: millimetre). You get the outline, window, heart and PCB outline.
4. **Extrude** the outer outline 32.8 mm → **Shell**, remove the back face, thickness 2.4 mm.
5. **Extrude → Remove** the window and the heart through the front plate. **Chamfer** the window's front edge 1.2 mm.
6. Module rim: sketch on the inside of the front plate, offsets 0.3 mm outside and 1.5 mm outside the PCB outline, **Extrude** 4.2 mm.
7. Heart light chamber: sketch the heart **Offset** by 1.7 mm and 3.3 mm, **Extrude** the ring 14.1 mm.
8. Corner blocks: 12.1 × 12.1 mm squares in each inside corner, **Extrude** from the back rim to the front plate. **Hole**: Ø4.0 × 7.0 mm, 7.5 mm from both outer edges.
9. Side openings: USB-C slot 12.6 × 7.2 mm with 3 mm corner radius on the right wall at the Feather's height; Ø7.2 mm hole in the top wall.
10. Right-click the part → **Export** → STL, millimetre, fine resolution.

For the back cover, import `back.stl` from OpenSCAD and keep it: its features all come from your measurements, and it only has to match the front's outline and corner positions, which don't change.

### 12.12 Source

@@include enclosure/heartframe.scad openscad@@

@@include enclosure/export.sh bash@@

@@include enclosure/insert_drawing.py python@@
