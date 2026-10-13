// uploads.ts - your own fonts, stamps and borders, kept in DATA_DIR/uploads/<kind>/.
//  - Files are checked by their first bytes (not by name or claimed type) and capped at 2 MB.
//  - Stored under a generated name; the name you typed is only a label in the database.
//  - Like photos, the server never decodes them; it hands them back to your browser as-is,
//    with nosniff + a sandbox CSP so a file can't run as a page.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { UPLOAD_MAX_BYTES, uploadRef, type MessageDoc, type UploadInfo, type UploadKind } from "../shared/types.js";
import type { Config } from "./config.js";
import type { DB, UploadRow } from "./db.js";

const httpError = (code: number, message: string) => Object.assign(new Error(message), { statusCode: code });

/** Work out what a file really is from its magic bytes. null = not an allowed type. */
export function sniff(kind: UploadKind, b: Buffer): { mime: string; ext: string } | null {
  const ascii = (n: number) => b.toString("latin1", 0, n);
  if (kind === "font") {
    if (b.length >= 4 && b.readUInt32BE(0) === 0x00010000) return { mime: "font/ttf", ext: "ttf" };
    if (ascii(4) === "true") return { mime: "font/ttf", ext: "ttf" };
    if (ascii(4) === "OTTO") return { mime: "font/otf", ext: "otf" };
    if (ascii(4) === "wOFF") return { mime: "font/woff", ext: "woff" };
    if (ascii(4) === "wOF2") return { mime: "font/woff2", ext: "woff2" };
    return null;
  }
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

const UploadSchema = z.object({
  kind: z.enum(["font", "stamp", "border"]),
  name: z.string().trim().min(1).max(60),
  data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(Math.ceil(UPLOAD_MAX_BYTES / 3) * 4 + 4),
  inset: z.number().int().min(0).max(120).optional(),
});

/** Which saved messages use each uploaded font / border (stamps are baked into drawings). */
function usage(db: DB): Map<string, { id: string; title: string }[]> {
  const used = new Map<string, { id: string; title: string }[]>();
  for (const r of db.list()) {
    let doc: MessageDoc;
    try { doc = db.parseDoc(r); } catch { continue; }
    for (const ref of new Set([doc.text?.font, doc.template])) {
      if (typeof ref === "string" && ref.startsWith("upload:")) {
        const id = ref.slice(7);
        used.set(id, [...(used.get(id) ?? []), { id: r.id, title: r.title }]);
      }
    }
  }
  return used;
}

export function registerUploads(app: FastifyInstance, db: DB, cfg: Config, auth: { preHandler: preHandlerHookHandler }) {
  const dir = (kind: UploadKind) => path.join(cfg.dataDir, "uploads", kind);
  const info = (r: UploadRow, used: Map<string, { id: string; title: string }[]>): UploadInfo => ({
    id: r.id, kind: r.kind, name: r.name, mime: r.mime, size: r.size, createdAt: r.created_at, inset: r.inset, usedBy: used.get(r.id) ?? [],
  });
  const find = (id: string): UploadRow => {
    const r = db.getUpload(id);
    if (!r) throw httpError(404, "not found");
    return r;
  };

  app.get("/api/uploads", auth, async () => {
    const used = usage(db);
    return db.uploads().map((r) => info(r, used));
  });

  app.post("/api/uploads", { ...auth, bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const body = UploadSchema.parse(req.body);
    const data = Buffer.from(body.data, "base64");
    if (data.length === 0 || data.length > UPLOAD_MAX_BYTES) throw httpError(400, "file must be under 2 MB");
    const type = sniff(body.kind, data);
    if (!type) throw httpError(400, body.kind === "font" ? "fonts must be TTF, OTF, WOFF or WOFF2" : "images must be PNG or JPEG");
    const id = randomBytes(8).toString("hex");
    const row: UploadRow = {
      id, kind: body.kind, name: body.name, file: `${id}.${type.ext}`, mime: type.mime, size: data.length,
      inset: body.kind === "border" ? (body.inset ?? 30) : null, created_at: db.now(),
    };
    mkdirSync(dir(body.kind), { recursive: true });
    writeFileSync(path.join(dir(body.kind), row.file), data, { flag: "wx" });
    db.insertUpload(row);
    return info(row, new Map());
  });

  app.get<{ Params: { id: string } }>("/api/uploads/:id/file", auth, async (req, reply) => {
    const r = find(req.params.id);
    const data = readFileSync(path.join(dir(r.kind), path.basename(r.file)));
    reply.header("Content-Type", r.mime)
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Content-Disposition", `inline; filename="${r.file}"`)
      .header("Cache-Control", "private, max-age=86400, immutable"); // a given id never changes
    return reply.send(data);
  });

  app.delete<{ Params: { id: string } }>("/api/uploads/:id", auth, async (req) => {
    const r = find(req.params.id);
    db.removeUpload(r.id);
    rmSync(path.join(dir(r.kind), path.basename(r.file)), { force: true });
    return { ok: true, ref: uploadRef(r.id) };
  });
}
