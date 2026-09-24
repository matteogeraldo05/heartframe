// config.ts - settings from environment variables, secrets from files.
// Secrets are mounted as files (Docker Compose "secrets:") instead of env vars:
// env vars leak through `docker inspect`, /proc/<pid>/environ and crash reports.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing environment variable ${name}`);
}

/** Read a secret from $NAME_FILE, else /run/secrets/<name>, else $NAME (dev only). */
export function secret(name: string, required = true): string {
  const file = process.env[`${name.toUpperCase()}_FILE`] ?? path.join("/run/secrets", name.toLowerCase());
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const direct = process.env[name.toUpperCase()];
  if (direct) return direct.trim();
  if (required) throw new Error(`secret ${name} not found (expected file ${file})`);
  return "";
}

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  webDir: string;
  owner: string;
  repo: string;
  branch: string;
  githubToken: string;
  messageKey: Buffer;         // 32 bytes, shared with the frame only
  adminPasswordHash: string;  // scrypt$... from scripts/init-secrets.mjs
  otaPublicKeyPem: string;    // optional
  cookieSecure: boolean;
  requireTailscaleLogin: string; // optional: only accept requests Tailscale Serve tagged with this login
}

export function loadConfig(): Config {
  const key = Buffer.from(secret("message_key"), "base64");
  if (key.length !== 32) throw new Error("message_key must be 32 bytes, base64 encoded");
  const token = secret("github_token");
  if (!token.startsWith("github_pat_")) throw new Error("github_token must be a fine-grained token (github_pat_...)");
  return {
    port: Number(env("PORT", "8080")),
    host: env("HOST", "0.0.0.0"),
    dataDir: env("DATA_DIR", "./data"),
    webDir: env("WEB_DIR", path.resolve("dist/web")),
    owner: env("GITHUB_OWNER"),
    repo: env("GITHUB_REPO"),
    branch: env("GITHUB_BRANCH", "main"),
    githubToken: token,
    messageKey: key,
    adminPasswordHash: secret("admin_password_hash"),
    otaPublicKeyPem: secret("ota_public_key", false),
    cookieSecure: env("COOKIE_SECURE", "true") !== "false",
    requireTailscaleLogin: env("REQUIRE_TAILSCALE_LOGIN", ""),
  };
}
