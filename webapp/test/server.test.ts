// End-to-end: API -> publisher -> (fake) GitHub, then decrypt what landed in the repo
// exactly like the frame would.
import { createHash, scryptSync } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { KIND_BITMAP, KIND_MANIFEST, PIXEL_BYTES, bytesToBase64 } from "../src/shared/format";
import type { Config } from "../src/server/config";
import { openEnvelope, sha256Hex } from "../src/server/crypto";
import Database from "better-sqlite3";

import { openDb } from "../src/server/db";
import { GitHub } from "../src/server/github";
import { buildApp } from "../src/server/index";

class FakeRemote {
  blobs = new Map<string, Buffer>();
  trees = new Map<string, Map<string, string>>();
  commits = new Map<string, { tree: string; parents: string[] }>();
  ref: string | null = null;
  n = 0;

  private id(prefix: string) { return createHash("sha1").update(prefix + this.n++).digest("hex"); }
  private blob(data: Buffer) {
    const sha = createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
    this.blobs.set(sha, data);
    return sha;
  }
  files(): Map<string, Buffer> {
    const tree = this.trees.get(this.commits.get(this.ref!)!.tree)!;
    return new Map([...tree].map(([p, s]) => [p, this.blobs.get(s)!]));
  }

  fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(url));
    const p = u.pathname.replace(/^\/repos\/me\/msgs/, "");
    const m = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const json = (status: number, obj: unknown) =>
      new Response(JSON.stringify(obj), { status, headers: { "github-authentication-token-expiration": "2027-09-01 00:00:00 UTC" } });
    const auth = new Headers(init?.headers).get("authorization");
    if (!auth?.startsWith("Bearer github_pat_")) return json(401, { message: "Bad credentials" });

    if (m === "GET" && p === "/git/ref/heads/main") return this.ref ? json(200, { object: { sha: this.ref } }) : json(409, { message: "Git Repository is empty." });
    if (m === "GET" && p.startsWith("/git/commits/")) return json(200, { tree: { sha: this.commits.get(p.split("/").pop()!)!.tree } });
    if (m === "PUT" && p === "/contents/README.md") {
      const tree = new Map([["README.md", this.blob(Buffer.from(body.content, "base64"))]]);
      const t = this.id("t"); this.trees.set(t, tree);
      const c = this.id("c"); this.commits.set(c, { tree: t, parents: [] });
      this.ref = c;
      return json(201, {});
    }
    if (m === "GET" && p.startsWith("/git/trees/")) {
      const t = this.trees.get(p.split("/").pop()!)!;
      return json(200, { tree: [...t].map(([path, sha]) => ({ path, type: "blob", sha })) });
    }
    if (m === "POST" && p === "/git/blobs") return json(201, { sha: this.blob(Buffer.from(body.content, "base64")) });
    if (m === "POST" && p === "/git/trees") {
      const t = new Map(this.trees.get(body.base_tree)!);
      for (const e of body.tree) { if (e.sha === null) t.delete(e.path); else t.set(e.path, e.sha); }
      const id = this.id("t"); this.trees.set(id, t);
      return json(201, { sha: id });
    }
    if (m === "POST" && p === "/git/commits") {
      const id = this.id("c"); this.commits.set(id, { tree: body.tree, parents: body.parents });
      return json(201, { sha: id });
    }
    if (m === "PATCH" && p === "/git/refs/heads/main") {
      if (this.commits.get(body.sha)!.parents[0] !== this.ref) return json(422, { message: "not fast forward" });
      this.ref = body.sha;
      return json(200, {});
    }
    if (m === "GET" && p === "/contents/README.md") return json(200, {});
    return json(404, { message: `unhandled ${m} ${p}` });
  };
}

const KEY = Buffer.alloc(32, 9);
const salt = Buffer.alloc(16, 2);
const HASH = `scrypt$1024$8$1$${salt.toString("base64")}$${scryptSync("pink-pink-pink", salt, 32, { N: 1024, r: 8, p: 1 }).toString("base64")}`;

function setup() {
  const remote = new FakeRemote();
  const cfg: Config = {
    port: 0, host: "127.0.0.1", dataDir: mkdtempSync(path.join(tmpdir(), "hf-")), webDir: "/nonexistent",
    owner: "me", repo: "msgs", branch: "main", githubToken: "github_pat_server", messageKey: KEY,
    adminPasswordHash: HASH, otaPublicKeyPem: "", cookieSecure: false, requireTailscaleLogin: "",
  };
  const db = openDb(":memory:");
  const gh = new GitHub("me", "msgs", "main", "github_pat_server", remote.fetch as typeof fetch);
  const { app, publisher } = buildApp(cfg, db, gh);
  return { app, db, remote, publisher, cfg };
}

const doc = {
  v: 1, template: "none", photo: null, drawing: null, signature: "",
  text: { content: "hi", font: "Dancing Script", size: 0, align: "center", valign: "middle", lineHeight: 1.2, stroke: 0, whiteBehind: false },
};
const pixels = new Uint8Array(PIXEL_BYTES).map((_, i) => i % 251);

describe("server", () => {
  let t: ReturnType<typeof setup>;
  let cookie = "";
  const H = () => ({ cookie, "x-hf-csrf": "1", "content-type": "application/json" });

  beforeEach(async () => {
    t = setup();
    const res = await t.app.inject({ method: "POST", url: "/api/login", headers: { "x-hf-csrf": "1" }, payload: { password: "pink-pink-pink" } });
    expect(res.statusCode).toBe(200);
    cookie = String(res.headers["set-cookie"]).split(";")[0];
  });

  it("requires a session and the CSRF header", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/messages" })).statusCode).toBe(401);
    const noCsrf = await t.app.inject({ method: "POST", url: "/api/messages", headers: { cookie }, payload: {} });
    expect(noCsrf.statusCode).toBe(403);
    const evil = await t.app.inject({ method: "POST", url: "/api/messages", headers: { ...H(), origin: "https://evil.example" }, payload: {} });
    expect(evil.statusCode).toBe(403);
  });

  it("rate-limits password guessing", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await t.app.inject({ method: "POST", url: "/api/login", headers: { "x-hf-csrf": "1" }, payload: { password: "nope" } })).statusCode;
    }
    expect(last).toBe(429);
  });

  it("rejects malformed bitmaps and non-JPEG photos", async () => {
    const bad = await t.app.inject({ method: "POST", url: "/api/messages", headers: H(), payload: { title: "x", doc, bitmap: bytesToBase64(new Uint8Array(10)) } });
    expect(bad.statusCode).toBe(400);
    const svg = await t.app.inject({ method: "POST", url: "/api/messages", headers: H(),
      payload: { title: "x", doc, bitmap: bytesToBase64(pixels), photo: Buffer.from("<svg onload=alert(1)>").toString("base64") } });
    expect(svg.statusCode).toBe(400);
  });

  it("send-now publishes one atomic commit the frame can decrypt", async () => {
    const created = await t.app.inject({ method: "POST", url: "/api/messages", headers: H(), payload: { title: "morning", doc, bitmap: bytesToBase64(pixels) } });
    expect(created.statusCode).toBe(200);
    const { id } = created.json();
    const sent = await t.app.inject({ method: "POST", url: `/api/messages/${id}/send-now`, headers: H(), payload: {} });
    expect(sent.statusCode).toBe(200);

    const files = t.remote.files();
    const manifest = JSON.parse(openEnvelope(KEY, files.get("manifest.hfe")!, KIND_MANIFEST).toString());
    expect(manifest.v).toBe(1);
    expect(manifest.cfg.tz).toBe("EST5EDT,M3.2.0,M11.1.0");
    expect(manifest.items).toHaveLength(1);
    const item = manifest.items[0];
    expect(item).toMatchObject({ id, s: 1, len: 15048 });
    const blob = files.get(`b/${item.sha}.hfe`)!;
    expect(sha256Hex(blob)).toBe(item.sha);
    const bmp = openEnvelope(KEY, blob, KIND_BITMAP);
    expect(bmp.subarray(0, 4).toString()).toBe("HFB1");
    expect(Buffer.from(bmp.subarray(12)).equals(Buffer.from(pixels))).toBe(true);

    // Preview PNG for the library.
    const png = await t.app.inject({ method: "GET", url: `/api/messages/${id}/preview.png`, headers: { cookie } });
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.rawPayload.subarray(1, 4).toString()).toBe("PNG");
  });

  it("queues messages one per day and keeps paths stable across publishes", async () => {
    const ids: string[] = [];
    for (const title of ["a", "b", "c"]) {
      const r = await t.app.inject({ method: "POST", url: "/api/messages", headers: H(), payload: { title, doc, bitmap: bytesToBase64(pixels.map((x) => x ^ title.charCodeAt(0))) } });
      ids.push(r.json().id);
      expect((await t.app.inject({ method: "POST", url: `/api/messages/${r.json().id}/queue`, headers: H(), payload: {} })).statusCode).toBe(200);
    }
    const list = (await t.app.inject({ method: "GET", url: "/api/messages", headers: { cookie } })).json() as { id: string; showAt: number }[];
    const times = ids.map((id) => list.find((m) => m.id === id)!.showAt);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(23 * 3600);
    expect(times[2] - times[1]).toBeLessThanOrEqual(25 * 3600);

    await t.publisher.run(true);
    const first = [...t.remote.files().keys()].filter((p) => p.startsWith("b/")).sort();
    // Reorder: same set of bitmap files, new dates.
    await t.app.inject({ method: "POST", url: "/api/queue/order", headers: H(), payload: { ids: [ids[2], ids[0], ids[1]] } });
    await t.publisher.run(true);
    const second = [...t.remote.files().keys()].filter((p) => p.startsWith("b/")).sort();
    expect(second).toEqual(first);
    const manifest = JSON.parse(openEnvelope(KEY, t.remote.files().get("manifest.hfe")!, KIND_MANIFEST).toString());
    expect(manifest.items.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it("validates settings and publishes them into the manifest", async () => {
    const s = (await t.app.inject({ method: "GET", url: "/api/settings", headers: { cookie } })).json();
    const bad = await t.app.inject({ method: "PUT", url: "/api/settings", headers: H(), payload: { ...s, checkMin: 1 } });
    expect(bad.statusCode).toBe(400);
    const ok = await t.app.inject({ method: "PUT", url: "/api/settings", headers: H(), payload: { ...s, ledColor: "#ff0050", quietStart: "22:30" } });
    expect(ok.statusCode).toBe(200);
    await t.publisher.run(true);
    const manifest = JSON.parse(openEnvelope(KEY, t.remote.files().get("manifest.hfe")!, KIND_MANIFEST).toString());
    expect(manifest.cfg.led).toEqual([255, 0, 80]);
    expect(manifest.cfg.qs).toBe(22 * 60 + 30);
  });

  // ---- added with uploads / favourites / LED removal -------------------------------
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
  const WOFF2 = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(40, 2)]);
  const up = (payload: object, headers = H()) => t.app.inject({ method: "POST", url: "/api/uploads", headers, payload });

  it("uploads: validates type by content and size, stores under a generated name", async () => {
    const font = await up({ kind: "font", name: "My Hand", data: WOFF2.toString("base64") });
    expect(font.statusCode).toBe(200);
    const info = font.json();
    expect(info).toMatchObject({ kind: "font", name: "My Hand", mime: "font/woff2" });
    const files = readdirSync(path.join(t.cfg.dataDir, "uploads", "font"));
    expect(files).toEqual([`${info.id}.woff2`]);            // never the uploaded name

    // Wrong type for the kind, disguised file, too big, HTML pretending to be a PNG.
    expect((await up({ kind: "font", name: "x", data: PNG.toString("base64") })).statusCode).toBe(400);
    expect((await up({ kind: "stamp", name: "x", data: WOFF2.toString("base64") })).statusCode).toBe(400);
    expect((await up({ kind: "stamp", name: "x", data: Buffer.from("<html><script>alert(1)</script>").toString("base64") })).statusCode).toBe(400);
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await up({ kind: "border", name: "x", data: big.toString("base64") })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await up({ kind: "../etc", name: "x", data: PNG.toString("base64") })).statusCode).toBe(400);

    // Served back as-is, sandboxed.
    const file = await t.app.inject({ method: "GET", url: `/api/uploads/${info.id}/file`, headers: { cookie } });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("font/woff2");
    expect(String(file.headers["content-security-policy"])).toContain("sandbox");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(file.rawPayload).equals(WOFF2)).toBe(true);
  });

  it("uploads: need a session and the CSRF header", async () => {
    const data = PNG.toString("base64");
    expect((await t.app.inject({ method: "GET", url: "/api/uploads" })).statusCode).toBe(401);
    expect((await up({ kind: "stamp", name: "x", data }, { "content-type": "application/json", "x-hf-csrf": "1" } as never)).statusCode).toBe(401);
    expect((await up({ kind: "stamp", name: "x", data }, { cookie, "content-type": "application/json" } as never)).statusCode).toBe(403);
    const ok = (await up({ kind: "stamp", name: "x", data })).json();
    expect((await t.app.inject({ method: "DELETE", url: `/api/uploads/${ok.id}`, headers: { cookie } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: `/api/uploads/${ok.id}/file` })).statusCode).toBe(401);
  });

  it("uploads: list says which messages use a border/font; delete removes the file", async () => {
    const border = (await up({ kind: "border", name: "Stars", data: PNG.toString("base64"), inset: 40 })).json();
    expect(border.inset).toBe(40);
    const usesIt = { ...doc, template: `upload:${border.id}` };
    const m = (await t.app.inject({ method: "POST", url: "/api/messages", headers: H(), payload: { title: "starry", doc: usesIt, bitmap: bytesToBase64(pixels) } })).json();
    const list = (await t.app.inject({ method: "GET", url: "/api/uploads", headers: { cookie } })).json();
    expect(list[0].usedBy).toEqual([{ id: m.id, title: "starry" }]);
    const del = await t.app.inject({ method: "DELETE", url: `/api/uploads/${border.id}`, headers: H(), payload: {} });
    expect(del.statusCode).toBe(200);
    expect(existsSync(path.join(t.cfg.dataDir, "uploads", "border", `${border.id}.png`))).toBe(false);
    // The message keeps its saved bitmap (and still opens).
    const got = await t.app.inject({ method: "GET", url: `/api/messages/${m.id}`, headers: { cookie } });
    expect(got.statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: `/api/messages/${m.id}/preview.png`, headers: { cookie } })).statusCode).toBe(200);
  });

  it("favourites: toggles without counting as an edit", async () => {
    const m = (await t.app.inject({ method: "POST", url: "/api/messages", headers: H(), payload: { title: "fav", doc, bitmap: bytesToBase64(pixels) } })).json();
    expect(m.favourite).toBe(false);
    t.db.raw.prepare("UPDATE messages SET updated_at = 5 WHERE id = ?").run(m.id);
    const fav = await t.app.inject({ method: "POST", url: `/api/messages/${m.id}/favourite`, headers: H(), payload: { favourite: true } });
    expect(fav.json()).toMatchObject({ favourite: true, updatedAt: 5 });
    const dup = (await t.app.inject({ method: "POST", url: `/api/messages/${m.id}/duplicate`, headers: H(), payload: {} })).json();
    expect(dup.favourite).toBe(false);
  });

  it("accepts docs saved before this version and docs using the new fields", async () => {
    const legacy = { ...doc, text: { ...doc.text, whiteBehind: true },
      photo: { fit: "cover", zoom: 1, offsetX: 0.2, offsetY: -0.4, brightness: 0, contrast: 10, gamma: 1, algo: "bayer", threshold: 128, sharpen: true, invert: false } };
    const a = await t.app.inject({ method: "POST", url: "/api/messages", headers: H(), payload: { title: "old", doc: legacy, bitmap: bytesToBase64(pixels) } });
    expect(a.statusCode).toBe(200);
    const back = (await t.app.inject({ method: "GET", url: `/api/messages/${a.json().id}`, headers: { cookie } })).json();
    expect(back.doc).toEqual(legacy);
    const modern = { ...doc, invert: true,
      text: { content: "hi", font: "upload:0123456789abcdef", size: 0, align: "left", valign: "top", lineHeight: 1.2, stroke: 0, bold: true, italic: true, underline: true, strike: false, bullets: true, background: "outline", outline: 3 },
      photo: { fit: "cover", zoom: 1.5, panX: -40, panY: 12, brightness: 0, contrast: 10, gamma: 1, algo: "stucki", threshold: 128, sharpen: true, invert: false } };
    expect((await t.app.inject({ method: "POST", url: "/api/messages", headers: H(), payload: { title: "new", doc: modern, bitmap: bytesToBase64(pixels) } })).statusCode).toBe(200);
  });

  it("settings save without the LED fields and the stored LED values stay in the manifest", async () => {
    const { ledColor: _c, ledMax: _m, ledMs: _s, ...rest } = (await t.app.inject({ method: "GET", url: "/api/settings", headers: { cookie } })).json();
    const ok = await t.app.inject({ method: "PUT", url: "/api/settings", headers: H(), payload: { ...rest, checkMin: 90 } });
    expect(ok.statusCode).toBe(200);
    await t.publisher.run(true);
    const manifest = JSON.parse(openEnvelope(KEY, t.remote.files().get("manifest.hfe")!, KIND_MANIFEST).toString());
    expect(manifest.cfg).toMatchObject({ chk: 90, led: [255, 8, 72], ledMax: 160, ledMs: 10000 });
  });
});

describe("database migration", () => {
  it("adds the favourite column to a database from the previous version, keeping its messages", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hf-old-"));
    const old = new Database(path.join(dir, "heartframe.sqlite"));
    old.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, title TEXT NOT NULL, doc TEXT NOT NULL, bitmap BLOB NOT NULL, photo BLOB,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','scheduled')), show_at INTEGER, queue_pos REAL,
      surprise INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    old.prepare("INSERT INTO messages (id,title,doc,bitmap,created_at,updated_at) VALUES ('abc','kept',?,?,1,2)").run(JSON.stringify(doc), Buffer.from(pixels));
    old.close();
    const db = openDb(dir);
    const r = db.get("abc")!;
    expect(db.summary(r)).toMatchObject({ id: "abc", title: "kept", favourite: false, updatedAt: 2 });
    expect(Buffer.from(r.bitmap).equals(Buffer.from(pixels))).toBe(true);
    db.raw.close();
    openDb(dir).raw.close(); // second start: migration is a no-op
  });
});
