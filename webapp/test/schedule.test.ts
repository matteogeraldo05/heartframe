import { describe, expect, it } from "vitest";

import { addDays, localParts, queueTimes, zonedToUtc } from "../src/server/schedule";
import { selectItems } from "../src/server/manifest";
import type { MessageRow } from "../src/server/db";

const TZ = "America/Toronto";
const iso = (t: number) => new Date(t * 1000).toISOString();

describe("time zones", () => {
  it("converts Toronto wall-clock to UTC on both sides of DST (2026: Mar 8, Nov 1)", () => {
    expect(iso(zonedToUtc({ y: 2026, mo: 3, d: 7 }, 7, 30, TZ))).toBe("2026-03-07T12:30:00.000Z"); // EST -5
    expect(iso(zonedToUtc({ y: 2026, mo: 3, d: 9 }, 7, 30, TZ))).toBe("2026-03-09T11:30:00.000Z"); // EDT -4
    expect(iso(zonedToUtc({ y: 2026, mo: 10, d: 31 }, 7, 30, TZ))).toBe("2026-10-31T11:30:00.000Z");
    expect(iso(zonedToUtc({ y: 2026, mo: 11, d: 2 }, 7, 30, TZ))).toBe("2026-11-02T12:30:00.000Z");
    expect(iso(zonedToUtc({ y: 2026, mo: 12, d: 25 }, 7, 0, TZ))).toBe("2026-12-25T12:00:00.000Z");
  });

  it("adds calendar days across month ends", () => {
    expect(addDays({ y: 2026, mo: 12, d: 31 }, 1)).toEqual({ y: 2027, mo: 1, d: 1 });
    expect(localParts(zonedToUtc({ y: 2026, mo: 11, d: 1 }, 7, 30, TZ), TZ)).toMatchObject({ hh: 7, mm: 30 });
  });
});

describe("queue", () => {
  const now = zonedToUtc({ y: 2026, mo: 12, d: 20 }, 9, 0, TZ); // Dec 20, 09:00
  it("starts tomorrow when today's slot has passed, one per day", () => {
    const t = queueTimes({ count: 3, now, lastShownQueueAt: null, time: "07:30", everyDays: 1, tz: TZ, pinnedDays: new Set() });
    expect(t.map((x) => localParts(x, TZ).d)).toEqual([21, 22, 23]);
    expect(t.every((x) => localParts(x, TZ).hh === 7 && localParts(x, TZ).mm === 30)).toBe(true);
  });
  it("skips days that have a pinned message (Christmas)", () => {
    const t = queueTimes({ count: 6, now, lastShownQueueAt: null, time: "07:30", everyDays: 1, tz: TZ, pinnedDays: new Set(["2026-12-25"]) });
    expect(t.map((x) => localParts(x, TZ).d)).toEqual([21, 22, 23, 24, 26, 27]);
  });
  it("respects the cadence after the last shown queued message", () => {
    const last = zonedToUtc({ y: 2026, mo: 12, d: 20 }, 7, 30, TZ);
    const t = queueTimes({ count: 2, now, lastShownQueueAt: last, time: "07:30", everyDays: 2, tz: TZ, pinnedDays: new Set() });
    expect(t.map((x) => localParts(x, TZ).d)).toEqual([22, 24]);
  });
});

describe("manifest item selection", () => {
  const row = (id: string, show_at: number | null, status: MessageRow["status"] = "queued"): MessageRow => ({
    id, title: id, doc: "{}", bitmap: Buffer.alloc(15000), photo: null, status, show_at, queue_pos: 0, surprise: 0, created_at: 1, updated_at: 1,
  });
  it("keeps only the current (latest past) item plus upcoming ones, oldest first", () => {
    const items = selectItems([row("old", 100), row("current", 200), row("next", 400), row("later", 300), row("draft", null, "draft")], 250);
    expect(items.map((r) => r.id)).toEqual(["current", "later", "next"]);
  });
  it("caps the list at 40 for the firmware", () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(`m${i}`, 1000 + i));
    expect(selectItems(rows, 0)).toHaveLength(40);
  });
});
