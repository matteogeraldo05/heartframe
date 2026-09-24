// schedule.ts - wall-clock time in a named timezone (DST-safe) and queue slots.
// No date library: Intl gives us the offset, two passes settle DST edges.

export interface LocalDate { y: number; mo: number; d: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function localParts(epochSec: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(epochSec * 1000))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

function offsetMinutes(epochMs: number, tz: string): number {
  const p = localParts(Math.floor(epochMs / 1000), tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / 60000);
}

/** Unix seconds for local wall-clock y-mo-d hh:mm in `tz`. */
export function zonedToUtc(date: LocalDate, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(date.y, date.mo - 1, date.d, hh, mm);
  const off1 = offsetMinutes(guess, tz);
  let t = guess - off1 * 60000;
  const off2 = offsetMinutes(t, tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return Math.floor(t / 1000);
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const x = new Date(Date.UTC(date.y, date.mo - 1, date.d + n));
  return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

export function dayKey(date: LocalDate): string {
  return `${date.y}-${String(date.mo).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

export function localDay(epochSec: number, tz: string): LocalDate {
  const p = localParts(epochSec, tz);
  return { y: p.y, mo: p.mo, d: p.d };
}

export function parseHHMM(s: string): { hh: number; mm: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`bad time ${s}`);
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 23 || mm > 59) throw new Error(`bad time ${s}`);
  return { hh, mm };
}

export function hhmmToMinutes(s: string): number {
  const { hh, mm } = parseHHMM(s);
  return hh * 60 + mm;
}

/**
 * Times for the queued messages, in queue order: one every `everyDays` days at
 * `time` local, starting after `now` and after the last queued message that was
 * already shown, skipping days that have a pinned (explicitly scheduled) message.
 */
export function queueTimes(opts: {
  count: number;
  now: number;
  lastShownQueueAt: number | null;
  time: string;
  everyDays: number;
  tz: string;
  pinnedDays: Set<string>;
}): number[] {
  const { hh, mm } = parseHHMM(opts.time);
  const every = Math.max(1, Math.floor(opts.everyDays));
  let day = localDay(opts.now, opts.tz);
  if (opts.lastShownQueueAt !== null) {
    const next = addDays(localDay(opts.lastShownQueueAt, opts.tz), every);
    if (zonedToUtc(next, hh, mm, opts.tz) > zonedToUtc(day, hh, mm, opts.tz)) day = next;
  }
  if (zonedToUtc(day, hh, mm, opts.tz) <= opts.now) day = addDays(day, 1);
  const out: number[] = [];
  let guard = 0;
  while (out.length < opts.count && guard++ < 5000) {
    if (!opts.pinnedDays.has(dayKey(day))) out.push(zonedToUtc(day, hh, mm, opts.tz));
    day = addDays(day, every);
  }
  return out;
}
