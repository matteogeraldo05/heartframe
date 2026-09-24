## 7. Build order with test milestones

Never add a new subsystem until the previous milestone passes. Every milestone has a **pass test**: if it fails, stop and fix it there, where the cause is obvious. It gets much harder to find once the parts are glued into a box.

### M0: Accounts, software, repos (evening 1)

1. **GitHub:** turn on 2FA (passkey or authenticator app). Create:
   - `heartframe` (the code monorepo, public or private, your choice). Push the `heartframe/` bundle.
   - `heartframe-messages`: **Private**, empty.
2. Create the two fine-grained tokens exactly as in §10.4. Store them in your password manager.
3. **Fedora laptop tooling:**
   ```bash
   sudo dnf install -y git python3 pipx nodejs tio openscad
   pipx install platformio && pipx ensurepath        # or VS Code + the "pioarduino IDE" extension
   sudo usermod -aG dialout "$USER"                  # serial port access; log out and back in
   curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core/develop/platformio/assets/system/99-platformio-udev.rules \
     | sudo tee /etc/udev/rules.d/99-platformio-udev.rules && sudo udevadm control --reload-rules && sudo udevadm trigger
   ```
   Fedora's `nodejs` package may be older than 22. If `node -v` says < 22, use `sudo dnf module`/`nvm` or just do web app work in Docker.
4. **First firmware build** (downloads about 1 GB of toolchain once): `cd heartframe/firmware && pio run`. It must end with `SUCCESS`.

### M1: E-paper bench test (dev Feather, breadboard)

1. Solder the headers onto the **dev** Feather (§4.3). Put it in the breadboard.
2. Wire the Waveshare cable to the Feather using the pin map in §6.2 (VCC→3V, GND, DIN→MO, CLK→SCK, CS→D10, DC→D9, RST→D6, BUSY→D5).
   Also put three resistors on the breadboard now (they move to the interface board in M2): **100 kΩ from USB to A2** and **150 kΩ from A2 to GND** (the USB-sense divider), and **100 kΩ from A1 to GND** (the button pull-down). The firmware only opens its console when A2 sees USB power, and a floating A1 can look like a held button.
3. Flash. The ESP32-S3 spends most of its life asleep, so its USB port disappears. **To flash, put it in download mode:** hold **BOOT**, tap **RESET**, release BOOT, then:
   ```bash
   pio run -t upload
   ```
   Press **RESET** afterwards.
4. Open a terminal that survives USB reconnects: `tio /dev/ttyACM0`. Press **RESET**, and when you see `Press Enter within 3 s`, press Enter. Type `epd`.

**Pass:** within about 5 s the screen shows nested rectangles, a checkerboard, a heart, "e-paper OK" and a battery box in the top-right. It does one clean black↔white flash cycle, with no stripes or noise.

**Orientation:** hold the module with the flex cable at the **bottom** (where it goes in the frame). "e-paper OK" must read the right way up. If it's upside down, set `EPD_ROTATION 2` in `config.h` and re-flash. (If you'd rather mount it the other way round, keep rotation 0 and set `fpc_edge = "top"` in the enclosure model instead.)

**Measure now (for the enclosure):** the outermost rectangle marks the **exact edge of the active area**. With calipers, record its distance from the left and bottom edges of the glass and of the PCB (§12.6).

Troubleshooting: all white or no refresh → BUSY/RST/CS wiring. Stripes → wrong panel class: you might have a V1 (set `EPD_IS_GDEY042T81 0`). `BUSY timeout` in the log → the module isn't powered, or RST is wrong.

### M2: Interface board + heart LEDs

1. Build the interface board (§6.4) on perfboard. Before connecting anything: continuity check that VBAT, LED+, 3V and GND are not shorted to each other.
2. Build the heart board: 4 pixels, 10 µF, 3 wires (LED+, DATA, GND).
3. Connect to the dev Feather: BAT, GND, D11, D12 (plus USB/A2 and 3V/A1 for the divider and the button). Power from USB only; no battery yet.
4. In the console:
   ```
   led 255 8 72 160     -> hot pink
   led 255 0 40 200     -> try variations; hold a sheet of paper 12 mm in front to preview diffusion
   led off
   pulse                -> 10 s breathing
   beat                 -> surprise heartbeat
   ```

**Pass:**
- All 4 LEDs show the same colour.
- `led off` makes them **completely dark**. With the multimeter, measure **LED+ to GND: 0.0 V when off** and ~4–5 V when on (on USB, BAT sits at ~4.2 V).
- Switching the LEDs on **never resets the ESP32**: the console must not reboot.
- Pressing the button shows `button=1` in `status`.

Note the pink you like. It goes into the web app later.

### M3: Battery, fuel gauge, charging, sleep current

1. **Polarity check:** with the meter on the battery's JST plug, red must be **+** and must match the **+** marking next to the Feather's JST socket. Then plug it in.
2. `status` → `battery: gauge=ok 3.9xx V xx %`. Unplug USB and the frame keeps running.
3. **Charging:** put the USB power meter between the charger and the Feather. You should see 5 V and some hundreds of mA while charging, dropping near zero when full. Feel the Feather: warm is fine, hot is not.
4. **Sleep current** (the most important measurement in the project):
   - Cut one wire of a JST-PH extension (BOM: Adafruit #1131) and put the multimeter in series. Or insert it between the battery lead and the plug with clips. Start on the **mA/A range**.
   - Put a **jumper wire across the meter** while the ESP32 is awake. Wake peaks of about 500 mA through the µA range's shunt would brown it out.
   - In the console type `sleep 600`, then unplug USB (the `sleep` command doesn't wake on USB changes). Or just unplug USB and let it finish a normal wake.
   - Once it's asleep: switch the meter to **µA**, then remove the jumper. Read it.

**Pass:** **≤ 150 µA**. About 100–120 µA is expected.

Then try `EPD_HOLD_RST_LOW_IN_SLEEP 0` in `config.h`, re-flash and re-measure. Keep whichever setting reads lower.

If it's 1–5 mA, something is still powered:
- LEDs: is LED+ really 0 V?
- NeoPixel/I²C power: did you change `power.cpp`?
- A pin floating into the display's level shifter.
- The breadboard LED from a meter.

### M4: End-to-end messages (Wi-Fi, GitHub, web app)

1. Run the web app (Docker on the server, §9.5, or locally for now: `npm run dev:server` + `npm run dev:web`).
2. Web app → Settings: set your heart colour, keep other defaults. Write "hello from the server". **Send now ♥**. Settings → Publishing log must show `1 message(s) live … commit abc1234`. On GitHub the messages repo should contain only `README.md`, `manifest.hfe` and `b/<sha>.hfe`, and opening them shows gibberish (encrypted).
3. **Provision the frame** (repo, device token, message key, portal password):
   ```bash
   ~/.platformio/penv/bin/python tools/provision.py --port /dev/ttyACM0 \
     --owner <you> --repo heartframe-messages \
     --key-file <path to webapp/secrets/message_key> --portal-pass '<8+ chars>'
   ```
   Paste the device token at the prompt, and press RESET when asked.
4. Reset the frame: first boot with no Wi-Fi opens the **setup portal**. Scan the QR code with your phone, pick your home Wi-Fi, and enter the password.

**Pass:**
- Within about 20 s the e-paper shows your message and the heart glows pink in the heartbeat pattern (**Send now ♥** always counts as a surprise).
- In `tio`, the log shows `manifest: seq …`, `bitmap … cached`, and `sleeping 900 s` (15 minutes because USB is plugged in; 3600 s on battery).
- **Send another message** from the web app, then press the button: it appears within about 20 s with the heartbeat pattern.
- **Offline test:** turn off your Wi-Fi and press the button. The frame keeps the message, shows no error, and retries in 5 min.
- **Auth test:** revoke the device token on GitHub and press the button. The small cloud-off icon appears. Rotate to a new token via the web app (it can't reach the frame now, so re-provision over USB) and it recovers.
- **Quiet hours:** set quiet hours to cover "now" in Settings, publish, press the button. No glow. The glow happens at the end of quiet hours.

### M5: Enclosure dry run (paper template + PLA print)

1. Fill in the caliper measurements (§12.6) in `heartframe.scad` and run `./export.sh`. Look at `part="section"` in the GUI for collisions.
2. **Gate 1, paper template** (§12.7): the window shows the whole test pattern.
3. **Gate 2, PLA dry run** (§12.7): submit `front` and `back` exported with `-D 'fit=0.45' -D 'fastener="selftap"'` to a library 3D printer in mid-October. When they're printed, fit the **working** electronics (the dev Feather on its wires is fine).

**Pass:**
- **Display:** the module drops into the rim with a slight gap on all sides (not tight, not rattling). With `epd` running, the **window shows the outermost rectangle** with an even border: no hidden pixels.
- **USB-C:** the slim cable plugs in fully through the side opening.
- **Inside:** the battery sits in its cradle without pressure; wires reach with 20–30 mm of slack; the back closes without force; the button clicks; the switch slides.
- **Heart:** with `led 255 8 72 160`, light comes only through the heart (no leaks around the chamber). The PLA diffuser doesn't predict the resin glow; that's gate 3.
- **Stand:** it stands steadily on the fins.

Fix the model (offsets, `fit`, part positions), re-export with the **SLA settings**, and order the final set by **Nov 1** (§12.8). No PLA access? Use path B, the SLA test kit (§12.7).

### M6: Final assembly (final Feather, soldered wires)

1. Flash the **final** Feather (same firmware), provision it, and do the M1 `epd` test with the display cable soldered directly.
2. Solder the wires. Lengths: measure in the printed back cover and leave 20–30 mm of slack. Heat-shrink every exposed joint.
3. Mount parts on the back cover:
   - Feather on its standoffs with M2.5 screws and nuts.
   - Battery in its cradle on 1–2 mm EVA foam, held by the velcro strap.
   - Interface board and heart board on foam tape. LEDs face forward, and the board covers the light chamber.
   - Slide switch in its pocket with a dab of hot glue.
   - Button in the top wall (nut inside).
4. Put 1.5–2 mm EVA foam pads on the four display pressers.
5. **Glow test** (§12.7, gate 3): in a dim room, hold each of the four diffusers in the heart opening with `led 255 8 72 160` on. Pick the thinnest one that shows no separate dots and glue it in from the inside: a thin bead of clear UV resin or epoxy on the flange. Set `diffuser_face` in the model to match.
6. Seat the display in the front shell rim, **glass down on a clean microfibre cloth**, flex cable at the relief notch.
7. Close with 4 × M3 countersunk screws. Snug them, don't crank them: resin cracks.

**Pass:**
- Power on (switch ON): the frame syncs, shows the message, and glows.
- USB-C plugs in fully.
- The button clicks and works.
- Nothing rattles when you tilt it.
- The screen shows the whole active area.
- Switch OFF → the frame stops waking, but plugging in USB still charges it (USB meter shows current).

### M7: Burn-in (at least 7 days, starting by Nov 23)

- Leave it running on battery with the defaults. Check the healthchecks.io log daily: battery %, errors, RSSI.
- One full charge inside the closed enclosure. After 1 h of charging, the case near the battery should feel no more than warm (< 35 °C; an IR thermometer or a kitchen probe taped on works).
- Test scheduled delivery (schedule for tomorrow 07:00), a surprise, reordering the queue, a photo and a drawing.
- DST: the clocks go back at 2:00 on **Sunday Nov 1, 2026**, before this burn-in. Keep the bench (or PLA-cased) frame running that weekend. The host tests cover DST, but it's a nice real check that quiet hours still end at 07:00 that Sunday morning.

**Pass:** 7 days with no manual intervention, messages on time, the battery dropping about 1 % per day or less.

### M8 (stretch): signed OTA

1. `~/.platformio/penv/bin/python tools/ota_keys.py keygen`. Back up `~/.heartframe/ota_private.pem` in your password manager. This writes `include/ota_pubkey.h`.
2. Flash that firmware over USB **before gifting**. Only builds that carry the key can accept OTA.
3. For an update:
   - Bump `FW_BUILD` in `config.h`.
   - `pio run`.
   - `~/.platformio/penv/bin/python tools/ota_keys.py sign .pio/build/feather_s3/firmware.bin`.
   - Upload `firmware.bin` and `firmware.bin.json` in the web app → Settings → Firmware.
4. Optional: let the web app check signatures before it publishes. Save the public key that `keygen` printed as `webapp/secrets/ota_public_key` on the server (same owner and mode as the other secrets: `sudo chown 1000:1000` and `chmod 600`), uncomment the two `ota_public_key` lines in `docker-compose.yml`, and `docker compose up -d`. Without it the web app skips that check; the frame always verifies.

**Pass:** at the next check the frame downloads about 1.5 MB, reboots, and the heartbeat shows the new `build=`. A deliberately broken build (e.g. wrong key) is rejected, and the frame stays on the old one.
