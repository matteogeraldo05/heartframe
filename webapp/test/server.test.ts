// End-to-end: API -> publisher -> (fake) GitHub, then decrypt what landed in the repo
// exactly like the frame would.
import { createHash, scryptSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { KIND_BITMAP, KIND_MANIFEST, PIXEL_BYTES, bytesToBase64 } from "../src/shared/format";
import type { Config } from "../src/server/config";
import { openEnvelope, sha256Hex } from "../src/server/crypto";
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
  return { app, db, remote, publisher };
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
});
