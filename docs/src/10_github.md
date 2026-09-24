## 10. GitHub: repos, formats, tokens

### 10.1 Two repositories

**`heartframe`** (code monorepo). No secrets, no messages. Safe to make public if you like. The CI workflow builds everything on each push.

```
heartframe/
├── firmware/  webapp/  enclosure/  docs/BUILD_GUIDE.md
├── README.md  .gitignore  .github/workflows/ci.yml
```

**`heartframe-messages`** (**private**). Written only by the web app, one commit per publish. Everything except the README is ciphertext:

```
heartframe-messages/
├── README.md                      "Everything here is AES-256-GCM encrypted"
├── manifest.hfe                   encrypted manifest (changes every publish)
├── b/<sha256>.hfe                 one encrypted bitmap per message in the manifest
│                                  (named by the sha256 of the .hfe file itself)
└── fw/<build>.bin                 only if you publish an OTA update (signed, not secret)
```

Bitmaps no longer referenced are deleted from the tree. They stay in git history, but only as ciphertext. If you ever want the history gone too, delete and recreate the repo, then press Settings → **Publish now** (the automatic runs skip publishing when nothing has changed).

### 10.2 File formats

**HFE1 envelope** (AES-256-GCM, 36 bytes of overhead):

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | `"HFE1"` |
| 4 | 1 | version = 1 |
| 5 | 1 | kind: 1 = manifest (UTF-8 JSON), 2 = bitmap (HFB1) |
| 6 | 2 | reserved = 0 |
| 8 | 12 | nonce |
| 20 | n | ciphertext |
| 20+n | 16 | GCM tag |

The AAD is bytes 0–19, so the kind and nonce are authenticated too: a bitmap can't be passed off as a manifest.

- **Manifest nonces:** random.
- **Bitmap nonces:** `HMAC-SHA256(HMAC(key,"heartframe nonce key v1"), kind ‖ plaintext)[0:12]`. This is deterministic, so identical bitmaps always produce the same file and the same path. That's safe for GCM because a nonce only repeats when the plaintext is identical.

**HFB1 bitmap** (15,012 bytes):

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | `"HFB1"` |
| 4 | 2 | width = 400 (little-endian) |
| 6 | 2 | height = 300 (little-endian) |
| 8 | 1 | format = 1 (1 bpp) |
| 9 | 1 | flags = 0 |
| 10 | 2 | reserved |
| 12 | 15000 | pixels: row-major, MSB = leftmost pixel, **1 = black** |

A 1-bit format is exactly what Adafruit GFX `drawBitmap()` takes. It's also only 15 KB, and 12 KB as a PNG, so there's no reason to compress it.

**Manifest** (JSON inside a kind-1 envelope):

```json
{
  "v": 1,
  "seq": 1766500000123,
  "gen": 1766500000,
  "cfg": {
    "tz": "EST5EDT,M3.2.0,M11.1.0",
    "chk": 60, "chkUsb": 15,
    "qs": 1380, "qe": 420,
    "led": [255, 8, 72], "ledMax": 160, "ledMs": 10000,
    "hb": "https://hc-ping.com/<uuid>", "hbH": 6
  },
  "items": [
    { "id": "k3v9x2abcd", "at": 1766664000, "sha": "<64 hex of b/<sha>.hfe>", "len": 15048, "s": 0 },
    { "id": "p0q8r7stuv", "at": 1766750400, "sha": "…", "len": 15048, "s": 1 }
  ],
  "fw":  { "ver": 2, "name": "1.0.1", "path": "fw/2.bin", "len": 1478304, "sha": "…", "sig": "<base64 DER>" },
  "tok": { "gen": 2, "val": "github_pat_…" }
}
```

| Field | Meaning | Frame's validation |
|---|---|---|
| `v` | format version | must be 1 |
| `seq` | publish counter (ms since epoch) | must be ≥ the last accepted seq (**anti-rollback**) |
| `gen` | server time at publish | fallback clock when the frame's clock is unknown |
| `cfg.tz` | POSIX TZ string (DST rules included) | printable, < 48 chars |
| `cfg.chk` / `chkUsb` | check interval, minutes (battery / USB) | clamped to 15–720 / 5–720 |
| `cfg.qs` / `qe` | quiet hours, minutes after local midnight (qs = qe → none) | clamped 0–1439 |
| `cfg.led`, `ledMax`, `ledMs` | heart colour, brightness cap, pulse length | clamped; firmware hard cap 200/255 |
| `cfg.hb`, `hbH` | heartbeat URL (https only), interval in hours | `https://` prefix required |
| `items[]` | current item + upcoming, sorted by `at` (≤ 40) | id `[A-Za-z0-9_-]{1,24}`, sha 64 lowercase hex, `len` ≤ 16 KB |
| `items[].s` | 1 = surprise (heartbeat pattern) | |
| `fw` | optional OTA: build number, path, size, sha, ECDSA signature | ignored if malformed; applied only if `ver` > current build and the signature verifies |
| `tok` | optional device-token rotation | applied only if `gen` > current and a test request succeeds |

**Selection rule on the frame:** show the item with the latest `at` ≤ now. Pulse if its `id` has never been shown. Prefetch the next 3. Wake exactly at the next `at` if it's sooner than the next check. The server decides everything else (queue order, cadence, pinned dates, surprises = `at: now`), so the logic in the frame stays small and testable. It also keeps working when the server is off.

### 10.3 Why tokens and not something else

- **Deploy keys** never expire, but they only work with the git protocol (SSH). Implementing that on an ESP32 isn't practical.
- **GitHub Apps** need a private key on the device to mint 1-hour tokens, which is worse if the device is dumped.
- **Your own relay** (a Cloudflare Worker or similar) is another service to run.

**Fine-grained PATs** scoped to one repo, read-only, are the right tool. Combined with encryption, a leaked device token by itself reveals only ciphertext and timestamps.

### 10.4 Creating the two tokens (exact settings)

GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.

**Token 1: frame (read-only)**

| Field | Value |
|---|---|
| Token name | `heart-frame-device-read` |
| Resource owner | your personal account |
| Expiration | **No expiration** (recommended here; see below) or 366 days |
| Repository access | **Only select repositories** → `heartframe-messages` |
| Repository permissions | **Contents: Read-only** (Metadata: Read-only is added automatically). **Nothing else.** |

**Token 2: server (write)**

| Field | Value |
|---|---|
| Token name | `heart-frame-server-write` |
| Expiration | **366 days** (or custom). Add a calendar reminder 30 days before. The web app shows a warning too. |
| Repository access | **Only select repositories** → `heartframe-messages` |
| Repository permissions | **Contents: Read and write** (Metadata: Read-only automatic). **Nothing else.** |

**Why "no expiration" for the frame's token?** Expiry limits how long a *leaked* token is useful. This token:

- can only **read** one repo,
- that repo holds only **ciphertext**,
- can be **revoked in one click**, and
- is used hourly, so GitHub's one-year inactivity revocation never triggers.

Meanwhile, an expiring device token is the single most likely way this gift silently dies while you're busy. If you prefer hygiene, choose 366 days: rotation is a 2-minute job (below). Just don't let it lapse.

Test a token from your laptop (read-only check):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github.raw+json" -H "User-Agent: test" \
  https://api.github.com/repos/<you>/heartframe-messages/contents/README.md      # 200
```

**Never commit a token.** GitHub's secret scanning **automatically revokes** tokens pushed to public repos, which would break the frame. `.gitignore` covers `webapp/secrets/`.

### 10.5 Token lifecycle

| Event | What happens | What you do |
|---|---|---|
| Rotating the **frame** token (planned) | Paste the new token in Settings → "Replace the frame's token". It's sent inside the encrypted manifest (`tok.gen` + 1). The frame tests it, switches, and reports `tokgen=2` in its heartbeat. | After the heartbeat shows the new generation, revoke the old token on GitHub. |
| Frame token **expired / revoked** unexpectedly | Checks fail with HTTP 401. The frame keeps showing its last message, adds the small cloud icon, keeps retrying (5/15/30 min, then hourly, every 3 h after a day of failures), and sends `/fail` heartbeats, so you get an email. | Re-provision over USB (`provision.py`, 5 minutes) with a new token, and paste the **same** token into Settings → "Replace the frame's token", so the manifest and the frame agree (otherwise the frame keeps test-driving the dead token from the manifest). |
| **Server** token expiring | The web app shows days left in Settings (read from GitHub's `github-authentication-token-expiration` header). Warns under 30 days. | Create a new write token, `printf '%s' '<token>' > secrets/github_token`, `docker compose restart`. |
| Server token expired | Publishing fails, with a clear error in the publish log. The frame keeps playing the messages it already has (up to 39 upcoming). | Same as above. |
| Frame lost or stolen | See §11.3. | Revoke the device token, rotate the message key. |
