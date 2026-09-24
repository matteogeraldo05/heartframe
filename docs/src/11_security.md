## 11. Security and safety

### 11.1 Threat model

**What we protect:** your messages (privacy), her family's Wi-Fi password, what appears on her screen (integrity), your GitHub account, your home server, and physical safety.

| # | Threat | Likelihood | Impact | Mitigation in this design | Residual risk |
|---|---|---|---|---|---|
| T1 | Someone reads the messages repo: GitHub incident, accidental "make public", a leaked token, a future collaborator | low | high (privacy) | AES-256-GCM: the repo only holds ciphertext, sizes and commit times | Timing metadata |
| T2 | Someone pushes content to her frame (leaked write token, repo access) | low | high (it's her bedroom) | GCM authentication: without the key, anything injected fails to decrypt and is ignored. Old manifests are rejected (`seq`). | None without the key |
| T3 | Frame lost, stolen or flash-dumped (USB + `esptool read_flash`) | low | **high**: Wi-Fi password, device token, message key, portal password | Response plan in §11.3. Read-only single-repo token. Recommend a **guest network** for the frame. | Real. Flash encryption would fix it (see §11.3). |
| T4 | Your home server is compromised | low | medium: attacker can publish messages | Tailnet-only access, loopback port, non-root read-only container, scrypt password + rate limit, secrets as files, pinned dependencies. **The server cannot sign firmware.** | Messages can be forged; the frame can't be reflashed |
| T5 | Web app attacks: XSS, CSRF, malicious uploads, brute force | low | medium | Strict CSP, CSRF header + Origin check, SameSite=Strict, zod validation, **no server-side image decoding**, rate limit | Low |
| T6 | Man-in-the-middle on her Wi-Fi | low | medium | TLS with full chain + hostname validation (Mozilla bundle); GCM authentication even if TLS were broken; anti-rollback | Denial of service only (she keeps the last message) |
| T7 | Malicious OTA | very low | high | ECDSA P-256 signature with an **offline key on your laptop**, SHA-256 check, monotonic build numbers, bootloader rollback, never retries a rejected build | Loss of your laptop key → rotate by USB |
| T8 | Setup portal abuse (neighbour joins the hotspot) | very low | medium | WPA2 password on the hotspot, only opens on a 5 s button hold or first boot, 10 min timeout, **no firmware-upload page** | Low |
| T9 | GitHub account takeover | low | high | 2FA/passkey. Fine-grained tokens limit the damage from tokens. | – |
| T10 | Supply chain (a library update breaks or backdoors things) | low | medium | Exact versions pinned (`lib_deps` tags, `package-lock.json`). Update deliberately, then re-run the tests. | – |

### 11.2 Hardening checklist

- [ ] Both GitHub tokens: fine-grained, **only** `heartframe-messages`, only Contents (Read for the frame, Read/Write for the server).
- [ ] GitHub 2FA on. The messages repo is **private**.
- [ ] `webapp/secrets/*` has mode 600, owned by uid 1000. `.gitignore` in place. `git status` shows no secrets before every push.
- [ ] `message_key` backed up in your password manager (you need it to re-provision the frame).
- [ ] Web UI password: 12+ characters, unique, in your password manager.
- [ ] Container port bound to `127.0.0.1`. Reached only via `tailscale serve`. **No router port forwarding.**
- [ ] `COOKIE_SECURE=true` (the default).
- [ ] Portal password is not her Wi-Fi password and not guessable. Write it on the hand-off card.
- [ ] Heartbeat configured (optional, recommended).
- [ ] OTA key generated **before** gifting if you want OTA (M8). Back up `~/.heartframe/ota_private.pem`. Never copy it to the server.
- [ ] Update containers every few months (`git pull && docker compose up -d --build`). Check `npm audit` once in a while.
- [ ] Before gifting: `status` on the frame shows secrets **redacted** and the right owner/repo.

### 11.3 If the frame is lost, stolen, or you just want a clean slate

1. **Revoke the frame token** on GitHub (Settings → Fine-grained tokens → Revoke). From now on the device reads nothing new.
2. **Rotate the message key:**
   - Delete `secrets/message_key` and run `init-secrets.mjs` again (it keeps the files that already exist).
   - `docker compose restart`, then Settings → Publish now. The server re-encrypts everything with the new key.
   - Provision the replacement frame with the new key.
3. Ask her family to **change the Wi-Fi password**, or better, have the frame on a **guest network** from the start.
4. Create a new frame token and provision it.

**Flash encryption.** This is the ESP32 feature that makes flash dumps useless. It burns eFuses irreversibly. Done wrong, it can permanently prevent you from flashing over USB, and it needs a custom build configuration. For a first build with a Christmas deadline, the risk of bricking the gift outweighs the risk of her frame being stolen and dumped by someone who knows how. Revisit it for v2 (use a spare Feather to learn). NVS encryption with the HMAC peripheral is the gentler option on the S3.

### 11.4 Li-ion, charging and heat: bedroom-safe rules

| Risk | Design measure | Your job |
|---|---|---|
| Wrong polarity destroys the charger | Adafruit cell (correct JST polarity) | **Check with a meter anyway** before the first connection (M3). |
| Crush or puncture | 18650 in a steel can, in a cradle, on foam, with no screws or sharp edges within 5 mm | Don't substitute a bare pouch cell without the pouch cradle (10 % swelling room). |
| Over-charge or over-discharge, short circuit | Cell's protection circuit (4.2 V / 2.75 V / over-current). Feather's CC/CV charger. The firmware stops at 3.45 V. 0.5 A PTC fuse on the LED line. | Heat-shrink every joint. Tape off unused wire ends. |
| Heat while charging | Linear charger dissipates < 1 W. Vents in the back. The ESP32 sleeps. | **M7 temperature check** (case < 35 °C). Charge on a desk, **not under pillows or blankets**. |
| Charging in the cold | Li-ion must not charge below 0 °C | Indoors only (fine for a bedroom). Don't leave it in a car. |
| Cheap chargers | Uses standard 5 V USB | Recommend her phone charger or a reputable 5 V brick. Include a good cable. |
| Ageing or swelling | – | If the back cover bulges or the frame smells odd: unplug it, put it on a non-flammable surface, and don't charge it again. Recycle the cell at a **Call2Recycle** drop-off (Home Depot, Staples, etc.). Never put it in household trash. |
| Storage | – | If unused for months: charge to ~50 %, slide the switch OFF, or unplug the JST. |
| Shipping or travel | – | Switch OFF. Consider unplugging the battery. |

The LEDs run about 10 s a day at ≤ 45 mA and the e-paper draws nothing when idle, so the only meaningful energy in the box is the cell. Its protection circuit, the charger's CC/CV profile and the rules above are what make it safe to leave unattended.
