# Heart Frame

A battery-powered 4.2" e-paper message frame with a glowing pink heart.
Messages are written in a small web app on a home server, encrypted, and
published to a **private** GitHub repo; the frame wakes up, fetches them,
shows them, pulses the heart for new ones, and goes back to sleep for months
per charge.

```
firmware/    ESP32-S3 (Adafruit Feather) firmware - PlatformIO / Arduino core 3.x
  lib/hfcore/  formats, crypto, manifest, scheduling (portable C++, host-tested)
  test_host/   host tests (run against vectors produced by the web app)
  tools/       provision.py (USB secrets), ota_keys.py (signed updates)
webapp/      React + TypeScript editor, Node (Fastify + SQLite) server, Docker
enclosure/   parametric OpenSCAD enclosure + test prints (./export.sh -> STLs)
docs/        BUILD_GUIDE.md - the full build guide
```

Quick commands:

```bash
# firmware
cd firmware && pio run                      # build
pio run -t upload                           # flash (hold BOOT, tap RESET first)
make -C test_host MBEDTLS=~/src/mbedtls     # host tests

# web app
cd webapp && npm ci && npm test && npm run build
docker compose up -d --build                # on the home server

# enclosure
cd enclosure && ./export.sh                 # writes stl/: STLs, paper template, insert drawing
```

## Deployment (how this instance actually runs)

The build guide (`docs/BUILD_GUIDE.md` §9.5–9.6) assumes the web app is reached
only through **Tailscale Serve**. This deployment does **not** use Tailscale for
the web app. Instead:

```
browser --HTTPS--> Cloudflare --Cloudflare Tunnel--> cloudflared (on the server)
        --> http://localhost:5683 --> heartframe container :8080
```

- **Host:** Debian + CasaOS, Docker Compose project in
  `/DATA/AppData/heartframe/webapp` (`docker compose up -d --build` from there).
- **Port:** host `5683` → container `8080` (see `webapp/docker-compose.yml`).
  The Cloudflare Tunnel's public hostname points at `http://localhost:5683`.
- **HTTPS:** terminated by Cloudflare, so `COOKIE_SECURE` stays `"true"`.
  Set it to `"false"` only if you need to log in over plain
  `http://<server-LAN-IP>:5683`.
- **Not used here:** `tailscale serve`, and `REQUIRE_TAILSCALE_LOGIN` (it relies on
  the header Tailscale Serve adds, so it would refuse every request).
- **Access control:** the app's own password is the only gate. Optionally put
  Cloudflare Access in front of the hostname (email one-time code) for a second
  layer.

### DNS gotcha (why publishing said "fetch failed")

If Tailscale is installed on the server with MagicDNS enabled, the host's
`/etc/resolv.conf` points at Tailscale's resolver. Containers inherit it and,
when it misbehaves, every GitHub call fails with `getaddrinfo EAI_AGAIN` and the
publish log shows `fetch failed (EAI_AGAIN)`. Fixes applied:

1. `dns: [1.1.1.1, 9.9.9.9]` on the service in `webapp/docker-compose.yml`.
2. `sudo tailscale set --accept-dns=false` on the server (the host uses the
   router's DNS again; Tailscale itself keeps working).
3. `sudo systemctl restart docker`, because the Docker daemon keeps the old
   resolver until it restarts (image pulls and builds fail otherwise).

Quick check from the server:

```bash
docker exec heartframe node -e "fetch('https://api.github.com').then(r=>console.log('OK',r.status)).catch(e=>console.log('FAIL',e.cause))"
```

## Web app features added after the guide

- **Light / dark theme:** toggle in the header (and on the login screen).
  Follows the device setting until you pick one; the choice is remembered per
  browser. `src/web/public/theme-init.js` applies it before first paint (a
  separate file because the CSP forbids inline scripts).
- **Heart favicon** and home-screen icon (`src/web/public/`).
- **Clearer publish errors:** the log includes the underlying network cause,
  e.g. `fetch failed (ENOTFOUND)`.

This repository contains **no secrets and no messages**. Secrets live in
`webapp/secrets/` (git-ignored) and in the frame's flash; messages live only
(encrypted) in the separate private messages repo.
