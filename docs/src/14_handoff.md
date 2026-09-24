## 14. Hand-off: her Wi-Fi, daily use, adding messages

### 14.1 Before you wrap it (Dec 21–23)

1. **Settings → time zone:** hers. Check the quiet hours suit her (default 23:00–07:00).
2. **Messages:**
   - Schedule the Christmas message for the moment she'll open it (e.g. Dec 25, 08:00).
   - Keep the rest as **drafts** for now. Queued messages get daily slots starting tomorrow, and the frame only ever shows the *latest* one whose time has passed. Anything queued for Dec 21–24 would be skipped while the frame sits in wrapping paper. Queue them on Dec 25.
3. Charge to **100 %** (the corner shows 100 %). Run the §13.1 checklist one last time, and check that `status` shows the right repo and redacted secrets.
4. **The picture she unwraps:** e-paper keeps its image with the power off, so choose it. With USB **unplugged** (otherwise the ⚡ is drawn too), **Send now** something like "Merry Christmas ♥ Switch me on (back)", and tap the button so it shows.
5. **Forget your Wi-Fi without redrawing the screen:** slide the switch **OFF**, plug in USB, start `tio /dev/ttyACM0`, slide the switch **ON**, and press Enter at the 3-second prompt. Then:
   ```
   wifi-forget
   sleep 3600
   ```
   Unplug USB and slide the switch **OFF**. (`sleep` goes to sleep without drawing anything; `exit` would open the Wi-Fi setup screen right away.) If you miss the 3-second prompt, the frame redraws with a ⚡: repeat step 4, then this step. At her place, switching on opens Wi-Fi setup by itself, whether or not you're there.
6. Pack the slim USB-C cable and the hand-off card (§14.3). Add a 5 V USB charger if she doesn't have a spare.

### 14.2 Setup at her place (5 minutes)

1. Put it on a desk or shelf: **out of direct sun, away from radiators**, within reach of the Wi-Fi (2.4 GHz reaches further than 5 GHz).
2. Slide the switch on the back to **ON**. The screen changes to **"Wi-Fi setup"** with a QR code (after about 5 s).
3. Scan the QR code with her phone's camera. The phone joins `HeartFrame-XXXX` and a setup page opens. If not, open `192.168.4.1` in the browser.
4. **Configure WiFi** → pick the home network → type its password → **Save**.
5. Within about 30 s the screen redraws with the Christmas message and the heart glows.

If you're there: after step 5, press **Send now ♥** on your phone with a second message and tap the frame's button. It arrives in about 20 s with the heartbeat pattern. It's a nice way to show her how it works.

**Which network?** If her family's router has a **guest network** (most Bell and Rogers gateways do), use it. It keeps the family's main password off a device that sits in a bedroom, and nothing about the frame needs the home network. The network must be 2.4 GHz or dual-band, WPA2 or WPA3 **Personal**, with no sign-in page.

**If setup fails:** wrong password (try again: hold the button 5 s), a 5 GHz-only network (use the guest or a dual-band one), or weak signal (move the frame closer for setup; it can stay there).

### 14.3 Hand-off card (print it, put it in the box)

> **♥ Your Heart Frame**
>
> It shows messages from me. When a new one arrives, the heart glows. A heartbeat means a surprise.
>
> - **Charging:** when it says *"please charge me"* (every few months), plug in the USB-C cable. A ⚡ shows while it charges; overnight is plenty. It keeps working while plugged in.
> - **Button (top):** tap = check for new messages now. Hold 5 seconds (until the heart glows) = Wi-Fi setup.
> - **Switch (back):** ON/OFF. OFF keeps the picture on the screen; it just stops checking.
> - **New Wi-Fi or password:** hold the button 5 seconds, scan the QR code on the screen, choose your Wi-Fi, type its password. Setup hotspot password: `________________`
> - **Small cloud icon** in the corner: it hasn't reached the internet for 2 days. Usually the Wi-Fi changed: do Wi-Fi setup.
> - Keep it out of direct sun and off radiators. If it ever gets hot, bulges or smells odd: unplug it, switch it off, and tell me.

### 14.4 Adding messages after Christmas

Nothing changes on your side: open the web app over Tailscale and write.

| You want | Do | She sees |
|---|---|---|
| A message every day or two | **Add to queue** (Settings → queue time and cadence) | The next one each morning at the queue time, with a breathing glow |
| A message at an exact moment (birthday, anniversary, "good luck on your exam") | **Schedule** | Exactly then: the frame wakes for it |
| Something right now | **Send now ♥** | Within the hour (60-min checks on battery, 15 on USB), or immediately if she taps the button. Heartbeat glow |
| To fix a typo in a queued message | Library → edit → save | The corrected version; the web app republishes by itself |

Things to know:

- The frame holds **up to 39 upcoming messages** (40 including the one on screen). With the queue filled, it keeps delivering for weeks even if your server is off.
- A message only glows the **first** time it appears. Sending the same text again makes a new copy, so it glows again.
- Messages that arrive at night wait for the end of quiet hours to glow.
- **What you can see:** the heartbeat reports battery, Wi-Fi signal, errors and the (random) ID of the message on screen. It can't tell whether she looked at it, and there's no camera or microphone. If she asks what it knows about her, that's the honest answer.

### 14.5 Maintenance calendar (yours)

| When | What |
|---|---|
| Any healthchecks.io email | Read the last heartbeat body: `err=` and `battery=` tell you what's wrong |
| Monthly glance | Battery trend in healthchecks.io; publish log in Settings |
| Battery ≤ 20 % | Gently remind her, or wait for the pill: it's designed to be self-explanatory |
| 30 days before the **server** token expires | New write token → `secrets/github_token` → `docker compose restart` (§10.5). Settings shows the days left |
| If the **frame** token has an expiry | Rotate it from Settings a month early; revoke the old one after the heartbeat shows the new `tokgen` |
| Every few months | `git pull && docker compose up -d --build` on the server; `npm audit` now and then |
| Once a year (if you set up OTA) | Bump the pinned platform and library versions in `platformio.ini`, rebuild, run the tests, and publish the build via OTA. A newer Arduino core brings a newer root-certificate bundle (a rebuild with the same pins doesn't) |
| After a power cut at your place | Check the server came back (it has auto-power-on trouble). The frame doesn't care |
| After ~3–5 years | The 18650 cell fades. It's a standard cell in a cradle: swap it (same Adafruit part) and recycle the old one |

### 14.6 End of life

The 18650 is replaceable, so the frame should outlive several cells. If it's ever retired or passed on, run `factory-reset` over USB (wipes Wi-Fi, token, key), revoke its GitHub token, and recycle the cell at a Call2Recycle drop-off.
