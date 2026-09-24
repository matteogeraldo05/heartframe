## 13. Testing, failure modes and timeline

### 13.1 Acceptance checklist (run it in the week of Nov 30)

Every box is something that has broken a real project like this. Tick them on the **final** assembly, not the breadboard.

**Power and safety**

- [ ] Sleep current ≤ 150 µA, measured in the final assembly before the back cover goes on (M3 method).
- [ ] Plug in USB: ⚡ appears within seconds, the USB meter shows charging current, % rises over the next hours.
- [ ] After 1 h of charging inside the closed case, the case is < 35 °C near the battery.
- [ ] Switch OFF: the frame stops waking (heartbeats stop), but USB still charges it.
- [ ] Burn-in (M7): battery drops about 1 %/day or less on the defaults.
- [ ] No rattle when tilted, no sharp edges, vents not blocked, all four screws snug, stands steadily.

**Display**

- [ ] Whole active area visible in the window (run `epd`: the outer rectangle shows with an even border).
- [ ] Right way up (`EPD_ROTATION`).
- [ ] After 7 days: no ghosting (the daily full refresh is doing its job).
- [ ] Battery corner readable over a dark photo.
- [ ] Low-battery UI: in `config.h` temporarily set `BATT_LOW_PCT = 100` → flash → unplug USB → the "please charge me" pill appears → set it back to 15 and re-flash.
- [ ] Critical screen: temporarily set `BATT_CRITICAL_V = 4.5f` → flash → unplug USB → "Please charge me" full screen → plug USB back in → it wakes and recovers → set it back to `3.45f` and re-flash.

**Heart**

- [ ] New message → two slow breaths. Surprise ("Send now ♥") → heartbeat. Button tap → one short glow.
- [ ] A message published during quiet hours glows at the **end** of quiet hours, not at night.
- [ ] Between pulses the LEDs are completely dark: 0.0 V on LED+.

**Wi-Fi and sync**

- [ ] Portal: switch on with no saved Wi-Fi (`wifi-forget` first) → QR joins the hotspot on **both** an iPhone and an Android phone → setup page opens → saves → message appears within ~30 s.
- [ ] Portal left alone: it closes after 10 minutes and the frame goes back to sleep.
- [ ] Hold the button 5 s → portal opens again (her "new Wi-Fi" path).
- [ ] Router off for an hour: the frame keeps its message and recovers by itself (retries at 5/15/30 min).
- [ ] Internet off for more than 48 h (or a revoked token): the small cloud icon appears, and disappears after the next good sync.
- [ ] Revoked token: a `/fail` heartbeat email arrives; re-provisioning fixes it.
- [ ] Token rotation from the web app: the heartbeat shows `tokgen=2`; revoke the old token and the frame keeps working.

**Messages and scheduling**

- [ ] Queue: three queued messages appear on three consecutive mornings at the queue time.
- [ ] A scheduled message appears at its exact time (the frame wakes for it, it doesn't wait for the next check).
- [ ] "Send now ♥" + button tap → appears in about 20 s. Without the tap → within the check interval (60 min on battery, 15 on USB).
- [ ] Server off for 3 days (`docker compose stop`): queued messages keep appearing on time.
- [ ] Settings → time zone is **hers**; quiet hours make sense for her.
- [ ] A photo, a drawing, and a long text with a script font all look right on the real screen, not just in the preview.

**Server and security**

- [ ] The web app opens over Tailscale; from a phone *off* Tailscale it doesn't; `http://<server-LAN-IP>:8080` is refused.
- [ ] `status` on the frame shows secrets **redacted**.
- [ ] The messages repo is private and every file except the README is gibberish.
- [ ] `git grep -nE 'github_pat_[A-Za-z0-9_]{30,}'` in the code repo finds nothing (the bare prefix appears in validation code; a real token is much longer). `webapp/secrets/` is not tracked.
- [ ] `message_key`, the web password and (if used) `ota_private.pem` are in your password manager.
- [ ] The server write token's expiry date is in your calendar, 30 days early.
- [ ] Healthchecks.io emails you when you stop the frame for a day (test it once).

### 13.2 Failure modes: symptom → likely cause → fix

| Symptom | Likely cause | Fix |
|---|---|---|
| Can't flash; no serial port | The ESP32 is asleep, so its USB port is gone | Download mode: hold BOOT, tap RESET, release BOOT |
| Screen blank or never refreshes; `BUSY timeout` in the log | Wiring (BUSY/RST/CS), or no power to the module | Recheck the §6.2 pin map with a meter |
| Stripes or noise | Wrong panel driver (V1 vs V2) | `EPD_IS_GDEY042T81 0` for a V1 panel |
| Picture upside down | Rotation | `EPD_ROTATION 2` |
| Faint ghost of the old picture | Too few full refreshes, or a cold room (< 5 °C) | The firmware refreshes fully once a day. Check the log for `e-paper refresh`; keep it indoors |
| Battery lasts weeks, not months | Sleep current in the mA range | Measure (M3). Usual culprits: LED+ not at 0 V, NeoPixel/I²C power left on, a floating pin |
| % jumps or is wrong after a battery swap | The MAX17048 is re-learning | Give it a full charge cycle. The heartbeat's voltage is the ground truth |
| Heart doesn't glow for a new message | Quiet hours (it waits for morning), battery < 3.6 V, or the message was already shown | Check `status` and the log. `pulse` in the console tests the LEDs |
| The ESP32 resets when the LEDs turn on | Inrush current | Check R1/C1 soft-start, the 10 µF at the LEDs, the PTC fuse |
| LEDs glow faintly when "off", or wrong colours | Back-powering through DATA, or colour order | DATA must be low/input when off (it is in the firmware). Try `NEO_RGB` if red/green are swapped |
| Cloud-off icon | No successful sync for 48 h, 24 failed tries, or an auth error | Heartbeat email says which. New Wi-Fi → hold the button 5 s. Auth → rotate or re-provision the token |
| Won't join her Wi-Fi | 5 GHz-only network, sign-in page, WPA2-Enterprise, MAC filter, weak signal | Use a 2.4 GHz (or dual-band) **guest** network with WPA2/WPA3-Personal; move the frame closer |
| QR code doesn't join the hotspot | Old phone camera app | Join `HeartFrame-XXXX` by hand with the password on the screen, then open `192.168.4.1` |
| Message "late" | Hourly checks by design | Tap the button, or use **Schedule** for timed moments |
| Message never appears | Not published (check the publish log), or it's queued for a later slot | Settings → Publishing log; Queue tab shows each message's time |
| Web app: "publish failed … 401" | Server token expired or revoked | New write token → `secrets/github_token` → `docker compose restart` |
| Web app unreachable | Phone not on Tailscale, or the server didn't power back on after an outage | The frame doesn't care: it holds up to 39 upcoming messages. Fix the server when you're home (UPS + NUT is the real fix) |
| OTA never happens | Battery < 40 % (and not on USB), build number not higher, unsigned build | Charge; bump `FW_BUILD`; sign with `ota_keys.py` |
| Reboot loop after an OTA | New build fails its self-test | The bootloader rolls back automatically, and that build is never retried. If both images are bad: USB re-flash |
| USB-C cable won't seat | Plug overmold too thick for the opening | Slim cable (BOM M9), or file the opening 0.5 mm |
| Back cover bulges, frame hot or smells odd | Battery fault | §11.4: unplug, switch off, non-flammable surface, recycle the cell |
| Cracked boss or loose insert | Over-tightened screw in brittle resin | Glue the insert with epoxy; next time "snug, not tight" |

### 13.3 Timeline (Sept 23 → Dec 25)

Your co-op runs to Dec 31, so this plan assumes **evenings for small jobs and weekends for building**. Every week ends with a milestone you can test.

| Week | Dates | Do | Done when |
|---|---|---|---|
| 0 | **Wed Sep 23 – Sun Sep 27** | Order everything in §3.6 by courier. M0: GitHub repos + tokens, Fedora tooling, first `pio run`. Deploy the web app on the server (§9.5) and Tailscale Serve (§9.6). | Parts ordered; `pio run` → SUCCESS; web app opens at `https://<server>.<tailnet>.ts.net` |
| 1 | Sep 28 – Oct 4 | Parts arrive. Soldering practice kit. **M1** e-paper. Measure the module (§12.6), paper template (gate 1). Book the library 3D printer certification. | Test pattern OK, window aligned on paper |
| 2 | Oct 5 – Oct 12 (Thanksgiving Mon) | **M2** interface board + heart. **M3** battery, charging, **sleep current**. 3D printer certification (or submit the Ontario Tech request). | ≤ 150 µA asleep |
| 3 | Oct 13 – Oct 18 | **M4** end-to-end: provision, publish, offline/auth/quiet-hours tests. PLA print (gate 2). | A message appears ~20 s after a button tap |
| 4 | Oct 19 – Oct 25 | **M5** dry run in the PLA case. Fix the model. Start writing messages. | All M5 pass items |
| 5 | Oct 26 – Nov 1 | **Order the final SLA set by Sun Nov 1.** DST weekend (clocks go back Nov 1): check quiet hours on the bench frame. | Order placed |
| 6 | Nov 2 – Nov 8 | Final Feather: flash, provision, solder the harness (M6 steps 1–2); run it in the PLA case. Optional: M8 OTA key. | Final electronics running |
| 7 | Nov 9 – Nov 15 | Buffer while the print ships. Hand-off card (§14.3). Queue up message ideas. | – |
| 8 | Nov 16 – Nov 22 | Prints arrive → glow test → **M6** final assembly (weekend of Nov 21–22). | M6 pass |
| 9 | Nov 23 – Nov 29 | **M7** burn-in, 7 days. **Nov 29: last safe date to reorder** a bad part. | No manual intervention for 7 days |
| 10 | **Nov 30 – Dec 6** | Acceptance checklist (§13.1). Fix list. **Done.** | Every box ticked |
| – | Dec 7 – Dec 20 | Buffer: reprint or plan B enclosure if needed. The frame keeps running on your desk (longer burn-in). | – |
| – | Dec 21 – Dec 23 | Pre-gift steps (§14.1): charge to 100 %, messages ready, Wi-Fi forgotten, switch OFF, wrap. | – |
| – | **Dec 25** | Gift + 5-minute setup at her place (§14.2). | The first message glows |

**If you fall behind, cut in this order:** OTA (M8) → the SLA print (use the PLA case or plan B, §12.9) → heartbeat → photo polish. **Never cut:** the polarity check, the sleep-current measurement, the temperature check, or the burn-in.
