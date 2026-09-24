// routes.ts - the JSON API used by the React UI. Every route below requires a session.
import { createPublicKey, verify as verifySig } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { PIXEL_BYTES } from "../shared/format.js";
import type { StatusInfo } from "../shared/types.js";
import { TIMEZONES } from "../shared/types.js";
import { requireSession } from "./auth.js";
import type { Config } from "./config.js";
import { sha256Hex } from "./crypto.js";
import type { DB, MessageRow } from "./db.js";
import type { GitHub } from "./github.js";
import { reflowQueue, type FirmwareInfo } from "./manifest.js";
import { bitmapToPng } from "./png.js";
import type { Publisher } from "./publisher.js";

const b64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const DocSchema = z.object({
  v: z.literal(1),
  text: z.object({
    content: z.string().max(2000),
    font: z.string().max(60),
    size: z.number().min(0).max(240),
    align: z.enum(["left", "center", "right"]),
    valign: z.enum(["top", "middle", "bottom"]),
    lineHeight: z.number().min(0.7).max(2.5),
    stroke: z.number().min(0).max(4),
    whiteBehind: z.boolean(),
  }),
  template: z.string().max(40),
  photo: z.object({
    fit: z.enum(["cover", "contain"]),
    zoom: z.number().min(0.2).max(5),
    offsetX: z.number().min(-1).max(1),
    offsetY: z.number().min(-1).max(1),
    brightness: z.number().min(-100).max(100),
    contrast: z.number().min(-100).max(100),
    gamma: z.number().min(0.3).max(3),
    algo: z.enum(["atkinson", "floyd", "bayer", "threshold"]),
    threshold: z.number().min(0).max(255),
    sharpen: z.boolean(),
    invert: z.boolean(),
  }).nullable(),
  drawing: z.object({ black: b64.max(20100), white: b64.max(20100) }).nullable(),
  signature: z.string().max(60),
});

const SaveSchema = z.object({
  title: z.string().trim().min(1).max(120),
  doc: DocSchema,
  bitmap: b64.max(20100),
  photo: b64.max(2_100_000).nullable().optional(),
});

const SettingsSchema = z.object({
  tzName: z.enum(TIMEZONES.map((t) => t.name) as [string, ...string[]]),
  checkMin: z.number().int().min(15).max(720),
  checkUsbMin: z.number().int().min(5).max(720),
  quietStart: hhmm,
  quietEnd: hhmm,
  ledColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ledMax: z.number().int().min(0).max(200),
  ledMs: z.number().int().min(1000).max(30000),
  heartbeatUrl: z.union([z.literal(""), z.string().url().startsWith("https://").max(110)]),
  heartbeatHours: z.number().int().min(1).max(48),
  queueTime: hhmm,
  queueEveryDays: z.number().int().min(1).max(14),
});

const FirmwareSchema = z.object({
  bin: b64.max(6_000_000),
  info: z.object({
    ver: z.number().int().min(1),
    name: z.string().regex(/^[0-9A-Za-z._-]{1,15}$/),
    len: z.number().int().min(1024).max(0x300000),
    sha: z.string().regex(/^[0-9a-f]{64}$/),
    sig: b64.max(150),
  }),
});

function decodeBitmap(s: string): Buffer {
  const b = Buffer.from(s, "base64");
  if (b.length !== PIXEL_BYTES) throw Object.assign(new Error(`bitmap must be ${PIXEL_BYTES} bytes`), { statusCode: 400 });
  return b;
}

function decodePhoto(s: string | null | undefined): Buffer | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  const b = Buffer.from(s, "base64");
  // Stored as-is and only ever sent back to you; never decoded on the server.
  if (b.length > 1_500_000 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) throw Object.assign(new Error("photo must be a JPEG under 1.5 MB"), { statusCode: 400 });
  return b;
}

export function registerRoutes(app: FastifyInstance, db: DB, cfg: Config, gh: GitHub, pub: Publisher) {
  const auth = { preHandler: requireSession(db) };
  const big = { ...auth, bodyLimit: 4 * 1024 * 1024 };

  const find = (id: string): MessageRow => {
    const r = db.get(id);
    if (!r) throw Object.assign(new Error("not found"), { statusCode: 404 });
    return r;
  };
  const isLive = (r: MessageRow) => r.status !== "draft";

  app.get("/api/me", auth, async () => ({ ok: true }));

  app.get("/api/messages", auth, async () => db.list().map((r) => db.summary(r)));

  app.get<{ Params: { id: string } }>("/api/messages/:id", auth, async (req) => {
    const r = find(req.params.id);
    return { ...db.summary(r), doc: db.parseDoc(r) };
  });

  app.get<{ Params: { id: string } }>("/api/messages/:id/preview.png", auth, async (req, reply) => {
    const r = find(req.params.id);
    reply.header("Content-Type", "image/png").header("Cache-Control", "private, max-age=30");
    return reply.send(bitmapToPng(new Uint8Array(r.bitmap)));
  });

  app.get<{ Params: { id: string } }>("/api/messages/:id/photo", auth, async (req, reply) => {
    const r = find(req.params.id);
    if (!r.photo) return reply.code(404).send({ error: "no photo" });
    reply.header("Content-Type", "image/jpeg")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Content-Disposition", 'inline; filename="photo.jpg"')
      .header("Cache-Control", "private, no-store");
    return reply.send(r.photo);
  });

  app.post("/api/messages", big, async (req) => {
    const body = SaveSchema.parse(req.body);
    const now = db.now();
    const row: MessageRow = {
      id: db.newId(), title: body.title, doc: JSON.stringify(body.doc), bitmap: decodeBitmap(body.bitmap),
      photo: decodePhoto(body.photo) ?? null, status: "draft", show_at: null, queue_pos: null, surprise: 0,
      created_at: now, updated_at: now,
    };
    db.insert(row);
    return db.summary(row);
  });

  app.put<{ Params: { id: string } }>("/api/messages/:id", big, async (req) => {
    const r = find(req.params.id);
    const body = SaveSchema.parse(req.body);
    const photo = decodePhoto(body.photo);
    db.update(r.id, {
      title: body.title, doc: JSON.stringify(body.doc), bitmap: decodeBitmap(body.bitmap),
      ...(photo !== undefined ? { photo } : {}),
    });
    if (isLive(r)) pub.schedule();
    return db.summary(find(r.id));
  });

  app.post<{ Params: { id: string } }>("/api/messages/:id/duplicate", auth, async (req) => {
    const r = find(req.params.id);
    const now = db.now();
    const copy: MessageRow = { ...r, id: db.newId(), title: `${r.title} (copy)`, status: "draft", show_at: null, queue_pos: null, surprise: 0, created_at: now, updated_at: now };
    db.insert(copy);
    return db.summary(copy);
  });

  app.post<{ Params: { id: string } }>("/api/messages/:id/queue", auth, async (req) => {
    const r = find(req.params.id);
    if (db.status(r) === "shown") throw Object.assign(new Error("already shown - duplicate it to use it again"), { statusCode: 409 });
    const maxPos = Math.max(0, ...db.list().map((x) => x.queue_pos ?? 0));
    db.update(r.id, { status: "queued", show_at: null, queue_pos: maxPos + 1, surprise: 0 });
    reflowQueue(db);
    pub.schedule();
    return db.summary(find(r.id));
  });

  app.post<{ Params: { id: string } }>("/api/messages/:id/schedule", auth, async (req) => {
    const r = find(req.params.id);
    const { showAt } = z.object({ showAt: z.number().int() }).parse(req.body);
    if (db.status(r) === "shown") throw Object.assign(new Error("already shown - duplicate it to use it again"), { statusCode: 409 });
    if (showAt < db.now() - 60) throw Object.assign(new Error("that time is in the past"), { statusCode: 400 });
    db.update(r.id, { status: "scheduled", show_at: showAt, queue_pos: null, surprise: 0 });
    reflowQueue(db);
    pub.schedule();
    return db.summary(find(r.id));
  });

  // Surprise: goes live immediately with the "heartbeat" LED pattern. The frame picks it
  // up at its next check (every hour by default; every 15 min when plugged in).
  app.post<{ Params: { id: string } }>("/api/messages/:id/send-now", auth, async (req) => {
    let r = find(req.params.id);
    if (db.status(r) === "shown") {
      const now = db.now();
      r = { ...r, id: db.newId(), created_at: now, updated_at: now }; // new id so it counts as new on the frame
      db.insert({ ...r, status: "draft", show_at: null, queue_pos: null, surprise: 0 });
    }
    db.update(r.id, { status: "scheduled", show_at: db.now() - 5, queue_pos: null, surprise: 1 });
    reflowQueue(db);
    await pub.run(false);
    return db.summary(find(r.id));
  });

  app.post<{ Params: { id: string } }>("/api/messages/:id/unschedule", auth, async (req) => {
    const r = find(req.params.id);
    if (db.status(r) === "shown") throw Object.assign(new Error("already shown"), { statusCode: 409 });
    db.update(r.id, { status: "draft", show_at: null, queue_pos: null, surprise: 0 });
    reflowQueue(db);
    pub.schedule();
    return db.summary(find(r.id));
  });

  app.delete<{ Params: { id: string } }>("/api/messages/:id", auth, async (req) => {
    const r = find(req.params.id);
    db.remove(r.id);
    if (isLive(r)) { reflowQueue(db); pub.schedule(); }
    return { ok: true };
  });

  app.post("/api/queue/order", auth, async (req) => {
    const { ids } = z.object({ ids: z.array(z.string().max(24)).max(500) }).parse(req.body);
    const tx = db.raw.transaction(() => ids.forEach((id, i) => { if (db.get(id)?.status === "queued") db.update(id, { queue_pos: i + 1 }); }));
    tx();
    reflowQueue(db);
    pub.schedule();
    return { ok: true };
  });

  app.get("/api/settings", auth, async () => db.settings());
  app.put("/api/settings", auth, async (req) => {
    const s = SettingsSchema.parse(req.body);
    db.putSetting("device", s);
    reflowQueue(db);
    pub.schedule();
    return db.settings();
  });

  // Rotate the frame's read-only token: the new one travels inside the encrypted manifest.
  app.post("/api/device-token", auth, async (req, reply) => {
    const { token } = z.object({ token: z.string().regex(/^github_pat_[A-Za-z0-9_]{20,120}$/) }).parse(req.body);
    const probe = await gh.probeToken(token);
    if (!probe.ok) return reply.code(400).send({ error: `GitHub refused that token (HTTP ${probe.status}). Is it scoped to the messages repo with Contents: read?` });
    const cur = db.getSetting<{ gen: number; val: string } | null>("deviceToken", null);
    db.putSetting("deviceToken", { gen: (cur?.gen ?? 1) + 1, val: token });
    db.putSetting("deviceTokenExpiry", probe.expiry);
    pub.schedule(100);
    return { ok: true, expiry: probe.expiry };
  });

  app.get("/api/status", auth, async (): Promise<StatusInfo> => {
    const log = db.publishLog();
    const fw = db.getSetting<FirmwareInfo | null>("firmware", null);
    return {
      lastPublish: log[0] ?? null,
      log,
      serverTokenExpiry: gh.tokenExpiry,
      deviceTokenGen: db.getSetting<{ gen: number } | null>("deviceToken", null)?.gen ?? 1,
      deviceTokenExpiry: db.getSetting<string | null>("deviceTokenExpiry", null),
      firmware: fw ? { ver: fw.ver, name: fw.name } : null,
      repo: `${cfg.owner}/${cfg.repo}`,
      pending: pub.pending,
    };
  });

  app.post("/api/publish", auth, async () => {
    await pub.run(true);
    return { ok: true, log: db.publishLog()[0] ?? null };
  });

  // OTA (stretch goal): upload firmware.bin + the .json from tools/ota_keys.py sign.
  app.post("/api/firmware", { ...auth, bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const { bin, info } = FirmwareSchema.parse(req.body);
    const data = Buffer.from(bin, "base64");
    if (data.length !== info.len || sha256Hex(data) !== info.sha) return reply.code(400).send({ error: "file does not match its .json (size/sha)" });
    if (!data.includes(Buffer.from(`HFBUILD:${info.ver};HFNAME:${info.name};`))) return reply.code(400).send({ error: "build marker does not match the version" });
    if (cfg.otaPublicKeyPem) {
      const ok = verifySig("sha256", data, createPublicKey(cfg.otaPublicKeyPem), Buffer.from(info.sig, "base64"));
      if (!ok) return reply.code(400).send({ error: "signature does not verify with secrets/ota_public_key" });
    }
    const dir = path.join(cfg.dataDir, "firmware");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${info.ver}.bin`), data);
    const fw: FirmwareInfo = { ver: info.ver, name: info.name, path: `fw/${info.ver}.bin`, len: info.len, sha: info.sha, sig: info.sig };
    db.putSetting("firmware", fw);
    pub.schedule(100);
    return { ok: true };
  });

  app.delete("/api/firmware", auth, async () => {
    db.putSetting("firmware", null);
    pub.schedule(100);
    return { ok: true };
  });
}
