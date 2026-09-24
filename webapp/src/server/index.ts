// index.ts - Fastify server: API + the built React app. Meant to sit behind
// `tailscale serve` (HTTPS, tailnet-only). Never port-forward it to the internet.
import { existsSync } from "node:fs";

import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";

import { registerAuth } from "./auth.js";
import { loadConfig, type Config } from "./config.js";
import { openDb, type DB } from "./db.js";
import { GitHub } from "./github.js";
import { Publisher } from "./publisher.js";
import { registerRoutes } from "./routes.js";

const CSP = [
  "default-src 'self'",
  "img-src 'self' blob: data:",
  "style-src 'self'",
  "font-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function buildApp(cfg: Config, db: DB, gh: GitHub) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 1024 * 1024, trustProxy: false });
  const publisher = new Publisher(db, gh, cfg, (m) => app.log.info(m));

  app.register(cookie);
  app.addHook("onSend", async (_req, reply, payload) => {
    if (!reply.hasHeader("Content-Security-Policy")) reply.header("Content-Security-Policy", CSP);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "invalid input", issues: err.issues.slice(0, 5) });
    const e = err as Error & { statusCode?: number };
    const code = e.statusCode ?? 500;
    if (code >= 500) app.log.error(e);
    return reply.code(code).send({ error: code >= 500 ? "server error" : e.message });
  });

  app.get("/healthz", async () => ({ ok: true }));
  registerAuth(app, db, cfg);
  registerRoutes(app, db, cfg, gh, publisher);

  if (existsSync(cfg.webDir)) {
    app.register(fastifyStatic, { root: cfg.webDir, index: ["index.html"], maxAge: "1h" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }
  return { app, publisher };
}

async function main() {
  const cfg = loadConfig();
  const db = openDb(cfg.dataDir);
  const gh = new GitHub(cfg.owner, cfg.repo, cfg.branch, cfg.githubToken);
  const { app, publisher } = buildApp(cfg, db, gh);
  await app.listen({ port: cfg.port, host: cfg.host });
  // Re-publish every 30 minutes: rolls the "current message" forward and keeps up to
  // 40 upcoming messages in the manifest. No-op commits are skipped.
  publisher.schedule(5000);
  setInterval(() => publisher.schedule(0), 30 * 60 * 1000).unref();
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => { void app.close().then(() => { db.raw.close(); process.exit(0); }); });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
