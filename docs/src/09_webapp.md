## 9. Web app (full source, Docker)

### 9.1 What it does

- **Write** (the editor):
  - Text with 10 bundled fonts (7 script or handwriting), auto-fit, alignment, line spacing, "thicken" for thin scripts, a signature line.
  - 7 border templates (hearts, scallops, double line…).
  - Photos with Atkinson / Floyd–Steinberg / ordered / threshold dithering plus brightness, contrast, gamma, zoom and pan.
  - A drawing layer (black pen, white pen, eraser, ♥ stamps, undo).
  - The preview *is* the 1-bit output, with the battery corner shaded.
- **Queue:** what's on the frame now plus the upcoming list. Reorder with ↑/↓, "Send now", or remove. The queue plays one message per day at your chosen time, skipping days that have a pinned date.
- **Library:** every message with its status (draft / queued / scheduled / shown); edit, duplicate, queue or delete.
- **Settings:**
  - Frame behaviour (check intervals, quiet hours, time zone, heart colour/brightness/duration, queue cadence, heartbeat URL).
  - Publishing log and token expiry warnings.
  - Device-token rotation.
  - Firmware upload (OTA).

### 9.2 Layout

```
webapp/
├── package.json / package-lock.json   pinned deps (Fastify 5, better-sqlite3, zod 4, React 19, Vite 8)
├── tsconfig.json, tsconfig.server.json, vite.config.ts, vitest.config.ts
├── Dockerfile, docker-compose.yml, .dockerignore
├── scripts/init-secrets.mjs           creates message_key + admin_password_hash
├── secrets/                           (git-ignored) github_token, message_key, admin_password_hash
├── src/shared/   format.ts (bitmap format), types.ts (API types)
├── src/server/   index.ts config.ts db.ts auth.ts routes.ts crypto.ts github.ts manifest.ts publisher.ts schedule.ts png.ts
├── src/web/      index.html main.tsx App.tsx api.ts styles.css
│   ├── render/   compose.ts (layers -> 1-bit) dither.ts shapes.ts fonts.ts
│   └── components/ Editor.tsx Queue.tsx Library.tsx Settings.tsx Login.tsx
└── test/         format, crypto (+ firmware vectors), schedule, server (end-to-end with a fake GitHub)
```

### 9.3 Local development

```bash
cd webapp
npm ci
node scripts/init-secrets.mjs                     # creates secrets/message_key + admin_password_hash
printf '%s' 'github_pat_...WRITE token...' > secrets/github_token && chmod 600 secrets/*
export GITHUB_OWNER=<you> GITHUB_REPO=heartframe-messages COOKIE_SECURE=false DATA_DIR=./data \
       MESSAGE_KEY_FILE=secrets/message_key GITHUB_TOKEN_FILE=secrets/github_token \
       ADMIN_PASSWORD_HASH_FILE=secrets/admin_password_hash
npm run dev:server        # API on :8080
npm run dev:web           # UI on http://localhost:5173 (proxies /api)
npm test                  # 27 tests incl. end-to-end publish + decrypt
```

### 9.4 Security properties (what the code enforces)

| Area | Enforcement |
|---|---|
| Auth | One admin password (scrypt N=32768). Server-side sessions store only SHA-256 of the cookie token. Cookie is `HttpOnly; SameSite=Strict; Secure`. 14-day expiry. |
| CSRF | Every non-GET `/api/*` needs `X-HF-CSRF: 1`, which forces a CORS preflight that is never granted. The `Origin` must match `Host` / `X-Forwarded-Host`. |
| Brute force | 5 failures per IP → 15-minute lockout, plus a 400 ms delay per failure. |
| Input | Every body is validated with zod. Bitmap must be exactly 15,000 bytes. Photo must start with the JPEG magic bytes and be < 1.5 MB. Body size limits per route. |
| Uploaded images | **Never decoded on the server.** Served back only to you, with `Content-Type: image/jpeg`, `nosniff` and `CSP: sandbox`. Photos are re-encoded in *your browser* first, which strips EXIF/GPS. |
| XSS / framing | Strict CSP (`default-src 'self'`, no inline scripts, fonts self-hosted), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. |
| Secrets | Read from Docker secret files. Never logged, never sent to the browser. |
| GitHub | Fine-grained token, one repo, Contents RW. Its expiry date is read from GitHub's response header and shown in the UI. |
| Container | Non-root (uid 1000), read-only root FS, `cap_drop: ALL`, `no-new-privileges`, memory and PID limits, bound to 127.0.0.1. |

### 9.5 Deploy on the home server (Debian + CasaOS)

```bash
# 1) code
sudo mkdir -p /opt/heartframe && sudo chown "$USER" /opt/heartframe
git clone https://github.com/<you>/heartframe.git /opt/heartframe
cd /opt/heartframe/webapp

# 2) secrets (Node isn't needed on the server: run the script in a throwaway container)
docker run --rm -it -v "$PWD":/app -w /app node:24-bookworm-slim node scripts/init-secrets.mjs
printf '%s' 'github_pat_...SERVER WRITE token...' > secrets/github_token
mkdir -p data
sudo chown -R 1000:1000 secrets data && sudo chmod 600 secrets/* && sudo chmod 700 secrets

# 3) configure: edit GITHUB_OWNER / GITHUB_REPO in docker-compose.yml
nano docker-compose.yml

# 4) run
docker compose up -d --build
docker compose logs -f heartframe        # look for "Server listening" and "publish: ..."
curl -s http://127.0.0.1:8080/healthz    # {"ok":true}
```

CasaOS is a UI on top of plain Docker, so a CLI `docker compose` project runs fine alongside it and shows up in the CasaOS dashboard. Updating later: `git pull && docker compose up -d --build`.

**Back up** `webapp/secrets/message_key` (password manager) and `webapp/data/heartframe.sqlite` (your message library). Nextcloud or any off-box backup is fine. The key matters most: without it you'd have to re-provision the frame.

### 9.6 HTTPS with Tailscale Serve (tailnet only)

```bash
curl -fsSL https://tailscale.com/install.sh | sh     # on the server
sudo tailscale up
```

1. In the Tailscale admin console → DNS: enable **MagicDNS** and **HTTPS Certificates**.
2. On the server: `sudo tailscale serve --bg 8080`.
3. Open `https://<server-name>.<your-tailnet>.ts.net` on your laptop or phone. Both must have Tailscale installed and be logged in.

The certificate is a real Let's Encrypt one, issued for your tailnet name. Nothing is reachable from the internet or even from the LAN, because the container port is bound to 127.0.0.1. Optional extra lock: set `REQUIRE_TAILSCALE_LOGIN: "you@github"` in the compose file. Requests that didn't come through `tailscale serve` as you are then refused before the password check.

**Without Tailscale** (LAN only): change the port mapping to `"8080:8080"`, set `COOKIE_SECURE: "false"`, and accept that your password crosses the LAN in cleartext. Not recommended.

### 9.7 Source

@@include webapp/package.json json@@

@@include webapp/tsconfig.json json@@

@@include webapp/tsconfig.server.json json@@

@@include webapp/vite.config.ts ts@@

@@include webapp/vitest.config.ts ts@@

@@include webapp/Dockerfile dockerfile@@

@@include webapp/docker-compose.yml yaml@@

@@include webapp/.dockerignore text@@

@@include webapp/secrets/.gitignore text@@

@@include webapp/scripts/init-secrets.mjs js@@

@@include webapp/src/shared/format.ts ts@@

@@include webapp/src/shared/types.ts ts@@

@@include webapp/src/server/index.ts ts@@

@@include webapp/src/server/config.ts ts@@

@@include webapp/src/server/db.ts ts@@

@@include webapp/src/server/auth.ts ts@@

@@include webapp/src/server/routes.ts ts@@

@@include webapp/src/server/crypto.ts ts@@

@@include webapp/src/server/github.ts ts@@

@@include webapp/src/server/manifest.ts ts@@

@@include webapp/src/server/publisher.ts ts@@

@@include webapp/src/server/schedule.ts ts@@

@@include webapp/src/server/png.ts ts@@

@@include webapp/src/web/index.html html@@

@@include webapp/src/web/vite-env.d.ts ts@@

@@include webapp/src/web/main.tsx tsx@@

@@include webapp/src/web/App.tsx tsx@@

@@include webapp/src/web/api.ts ts@@

@@include webapp/src/web/styles.css css@@

@@include webapp/src/web/render/compose.ts ts@@

@@include webapp/src/web/render/dither.ts ts@@

@@include webapp/src/web/render/shapes.ts ts@@

@@include webapp/src/web/render/fonts.ts ts@@

@@include webapp/src/web/components/Editor.tsx tsx@@

@@include webapp/src/web/components/Queue.tsx tsx@@

@@include webapp/src/web/components/Library.tsx tsx@@

@@include webapp/src/web/components/Settings.tsx tsx@@

@@include webapp/src/web/components/Login.tsx tsx@@

@@include webapp/test/format.test.ts ts@@

@@include webapp/test/crypto.test.ts ts@@

@@include webapp/test/schedule.test.ts ts@@

@@include webapp/test/server.test.ts ts@@

The monorepo root also has a `README.md`, a `.gitignore` (secrets, build output), and an optional CI workflow:

@@include .gitignore text@@

@@include .github/workflows/ci.yml yaml@@
