// manifest.ts - turn the database into what the frame downloads:
//   manifest.hfe       encrypted JSON (see firmware/lib/hfcore/src/hf_manifest.h)
//   b/<sha256>.hfe     one encrypted bitmap per message in the manifest
import { createHash } from "node:crypto";

import { makeBitmapFile } from "../shared/format.js";
import { TIMEZONES } from "../shared/types.js";
import type { Config } from "./config.js";
import { sealBitmap, sealManifest, sha256Hex } from "./crypto.js";
import type { DB, MessageRow } from "./db.js";
import { dayKey, hhmmToMinutes, localDay, queueTimes } from "./schedule.js";

export const MAX_ITEMS = 40; // firmware limit (hf::kMaxItems)

export interface FirmwareInfo { ver: number; name: string; path: string; len: number; sha: string; sig: string }

export interface BuiltManifest {
  manifest: Buffer;                             // encrypted manifest.hfe
  blobs: { path: string; data: Buffer }[];      // encrypted bitmaps
  contentHash: string;                          // changes only when the frame would see a difference
  itemCount: number;
}

/** Re-assign dates to queued (not yet shown) messages, in queue order. */
export function reflowQueue(db: DB, now = db.now()): void {
  const s = db.settings();
  const rows = db.list();
  const queued = rows
    .filter((r) => r.status === "queued" && (r.show_at === null || r.show_at > now))
    .sort((a, b) => (a.queue_pos ?? 0) - (b.queue_pos ?? 0));
  const shown = rows.filter((r) => r.status === "queued" && r.show_at !== null && r.show_at <= now);
  const lastShownQueueAt = shown.length ? Math.max(...shown.map((r) => r.show_at as number)) : null;
  const pinnedDays = new Set(
    rows.filter((r) => r.status === "scheduled" && !r.surprise && r.show_at !== null && r.show_at > now)
      .map((r) => dayKey(localDay(r.show_at as number, s.tzName))),
  );
  const times = queueTimes({
    count: queued.length, now, lastShownQueueAt, time: s.queueTime, everyDays: s.queueEveryDays, tz: s.tzName, pinnedDays,
  });
  const tx = db.raw.transaction(() => {
    queued.forEach((r, i) => { if (r.show_at !== times[i]) db.update(r.id, { show_at: times[i] }); });
  });
  tx();
}

/** The message on screen now (latest past) + upcoming ones, oldest first. */
export function selectItems(rows: MessageRow[], now: number): MessageRow[] {
  const live = rows.filter((r) => r.status !== "draft" && r.show_at !== null);
  const past = live.filter((r) => (r.show_at as number) <= now)
    .sort((a, b) => (b.show_at as number) - (a.show_at as number) || b.created_at - a.created_at);
  const future = live.filter((r) => (r.show_at as number) > now).sort((a, b) => (a.show_at as number) - (b.show_at as number));
  const items = [...(past.length ? [past[0]] : []), ...future];
  return items.slice(0, MAX_ITEMS);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [255, 8, 72];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildManifest(db: DB, cfg: Config, now = db.now()): BuiltManifest {
  const s = db.settings();
  const items = selectItems(db.list(), now);
  const blobs: { path: string; data: Buffer }[] = [];
  const entries = items.map((r) => {
    const env = sealBitmap(cfg.messageKey, makeBitmapFile(new Uint8Array(r.bitmap)));
    const sha = sha256Hex(env);
    blobs.push({ path: `b/${sha}.hfe`, data: env });
    return { id: r.id, at: r.show_at as number, sha, len: env.length, s: r.surprise ? 1 : 0 };
  });

  const tz = TIMEZONES.find((t) => t.name === s.tzName) ?? TIMEZONES[0];
  const fw = db.getSetting<FirmwareInfo | null>("firmware", null);
  const tok = db.getSetting<{ gen: number; val: string } | null>("deviceToken", null);
  const body = {
    cfg: {
      tz: tz.posix,
      chk: s.checkMin,
      chkUsb: s.checkUsbMin,
      qs: hhmmToMinutes(s.quietStart),
      qe: hhmmToMinutes(s.quietEnd),
      led: hexToRgb(s.ledColor),
      ledMax: s.ledMax,
      ledMs: s.ledMs,
      hb: s.heartbeatUrl,
      hbH: s.heartbeatHours,
    },
    items: entries,
    ...(fw ? { fw } : {}),
    ...(tok ? { tok } : {}),
  };
  const contentHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const json = JSON.stringify({ v: 1, seq: Date.now(), gen: now, ...body });
  return { manifest: sealManifest(cfg.messageKey, json), blobs, contentHash, itemCount: entries.length };
}
