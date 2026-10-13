// A fake /api so the UI runs in the browser without the real server (uploads are kept in memory).
import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

export const sampleMessages = () => [
  { id: "m1", title: "Banana bread", status: "draft", updatedAt: 100, favourite: false },
  { id: "m2", title: "Apple pie", status: "queued", updatedAt: 300, favourite: false },
  { id: "m3", title: "Cherry on top", status: "shown", updatedAt: 200, favourite: true },
].map((m) => ({ createdAt: 1, showAt: null, surprise: false, queuePos: null, hasPhoto: false, ...m }));

const THUMB = readFileSync(new URL("../src/web/public/favicon-192.png", import.meta.url));

export async function fakeApi(page: Page, opts: { messages?: Record<string, unknown>[] } = {}) {
  const messages: Record<string, unknown>[] = opts.messages ?? [];
  const uploads: { info: Record<string, unknown>; data: Buffer }[] = [];
  let n = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const p = url.pathname, m = req.method();
    if (p === "/api/me") return json({ ok: true });
    if (p === "/api/uploads" && m === "GET") return json(uploads.map((u) => u.info));
    if (p === "/api/uploads" && m === "POST") {
      const body = req.postDataJSON();
      const data = Buffer.from(body.data, "base64");
      const mime = body.kind === "font" ? "font/ttf" : data[0] === 0x89 ? "image/png" : "image/jpeg";
      const info = { id: `u${(++n).toString().padStart(15, "0")}`, kind: body.kind, name: body.name, mime, size: data.length, createdAt: 1, inset: body.kind === "border" ? (body.inset ?? 30) : null, usedBy: [] };
      uploads.push({ info, data });
      return json(info);
    }
    const file = /^\/api\/uploads\/(\w+)\/file$/.exec(p);
    if (file) {
      const u = uploads.find((x) => x.info.id === file[1]);
      return u ? route.fulfill({ status: 200, contentType: String(u.info.mime), body: u.data }) : json({ error: "not found" }, 404);
    }
    if (p === "/api/messages" && m === "GET") return json(messages);
    const fav = /^\/api\/messages\/(\w+)\/favourite$/.exec(p);
    if (fav) {
      const msg = messages.find((x) => x.id === fav[1])!;
      msg.favourite = req.postDataJSON().favourite;
      return json(msg);
    }
    if (/^\/api\/messages\/\w+\/preview\.png$/.test(p)) return route.fulfill({ status: 200, contentType: "image/png", body: THUMB });
    if (p === "/api/settings") return json({ tzName: "America/Toronto", checkMin: 60, checkUsbMin: 15, quietStart: "23:00", quietEnd: "07:00", heartbeatUrl: "", heartbeatHours: 6, queueTime: "07:30", queueEveryDays: 1 });
    if (p === "/api/status") return json({ lastPublish: null, log: [], serverTokenExpiry: null, deviceTokenGen: 1, deviceTokenExpiry: null, firmware: null, repo: "me/msgs", pending: false });
    return json({ error: `not stubbed: ${m} ${p}` }, 404);
  });
}
