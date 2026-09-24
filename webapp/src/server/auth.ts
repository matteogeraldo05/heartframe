// auth.ts - one admin password, server-side sessions, CSRF defence.
//  - Session cookie: random 256-bit token, HttpOnly + SameSite=Strict (+ Secure on HTTPS).
//    Only its SHA-256 is stored, so a leaked database can't be replayed as a login.
//  - State-changing requests must carry `X-HF-CSRF: 1` (a custom header forces a CORS
//    preflight, which we never allow) and, if present, a matching Origin header.
//  - Login is rate limited per IP.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Config } from "./config.js";
import { verifyPassword } from "./crypto.js";
import type { DB } from "./db.js";

const COOKIE = "hf_session";
const SESSION_TTL = 14 * 24 * 3600;

export function registerAuth(app: FastifyInstance, db: DB, cfg: Config) {
  // Failed logins per IP: 5 tries, then locked for 15 minutes.
  const attempts = new Map<string, { count: number; until: number }>();
  const tooManyAttempts = (ip: string): boolean => {
    const a = attempts.get(ip);
    return !!a && a.count >= 5 && a.until > Date.now();
  };
  const recordFailure = (ip: string) => {
    const a = attempts.get(ip);
    attempts.set(ip, { count: a && a.until > Date.now() ? a.count + 1 : 1, until: Date.now() + 15 * 60 * 1000 });
  };

  // Optional: only accept requests that came through `tailscale serve` as you.
  app.addHook("onRequest", async (req, reply) => {
    if (cfg.requireTailscaleLogin && req.url !== "/healthz") {
      if (req.headers["tailscale-user-login"] !== cfg.requireTailscaleLogin) return reply.code(403).send({ error: "forbidden" });
    }
  });

  // CSRF: every non-GET API call needs the custom header and a same-origin Origin.
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/") || req.method === "GET" || req.method === "HEAD") return;
    if (req.headers["x-hf-csrf"] !== "1") return reply.code(403).send({ error: "missing CSRF header" });
    const origin = req.headers.origin;
    if (origin) {
      let host = "";
      try { host = new URL(origin).host; } catch { /* "null" or garbage */ }
      const allowed = [req.headers.host, req.headers["x-forwarded-host"]].filter(Boolean);
      if (!allowed.includes(host)) return reply.code(403).send({ error: "cross-origin request" });
    }
  });

  app.post("/api/login", async (req, reply) => {
    const ip = req.ip;
    if (tooManyAttempts(ip)) return reply.code(429).send({ error: "too many attempts, wait 15 minutes" });
    const password = (req.body as { password?: unknown } | undefined)?.password;
    if (typeof password !== "string" || password.length > 200 || !verifyPassword(cfg.adminPasswordHash, password)) {
      recordFailure(ip);
      await new Promise((r) => setTimeout(r, 400)); // slow down guessing
      return reply.code(401).send({ error: "wrong password" });
    }
    attempts.delete(ip);
    const token = db.createSession(SESSION_TTL);
    reply.setCookie(COOKIE, token, {
      path: "/", httpOnly: true, sameSite: "strict", secure: cfg.cookieSecure, maxAge: SESSION_TTL,
    });
    return { ok: true };
  });

  app.post("/api/logout", async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) db.deleteSession(token);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });
}

/** preHandler for protected routes. */
export function requireSession(db: DB) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!db.validSession(req.cookies[COOKIE])) return reply.code(401).send({ error: "login required" });
  };
}
