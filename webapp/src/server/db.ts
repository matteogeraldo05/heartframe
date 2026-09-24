// db.ts - SQLite (one file in the data volume). WAL mode, so a crash or power cut
// never corrupts it. Plenty for one user and a few hundred messages.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { DeviceSettings, MessageDoc, MessageStatus, MessageSummary } from "../shared/types.js";

export interface MessageRow {
  id: string;
  title: string;
  doc: string;
  bitmap: Buffer;          // 15000 packed bytes
  photo: Buffer | null;    // browser-normalised JPEG, never decoded here
  status: "draft" | "queued" | "scheduled";
  show_at: number | null;
  queue_pos: number | null;
  surprise: number;
  created_at: number;
  updated_at: number;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  tzName: "America/Toronto",
  checkMin: 60,
  checkUsbMin: 15,
  quietStart: "23:00",
  quietEnd: "07:00",
  ledColor: "#ff0848",
  ledMax: 160,
  ledMs: 10000,
  heartbeatUrl: "",
  heartbeatHours: 6,
  queueTime: "07:30",
  queueEveryDays: 1,
};

export type DB = ReturnType<typeof openDb>;

export function openDb(dataDir: string) {
  let file = ":memory:";
  if (dataDir !== ":memory:") {
    mkdirSync(dataDir, { recursive: true });
    file = path.join(dataDir, "heartframe.sqlite");
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      doc TEXT NOT NULL,
      bitmap BLOB NOT NULL,
      photo BLOB,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','scheduled')),
      show_at INTEGER,
      queue_pos REAL,
      surprise INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_show_at ON messages(show_at);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS publish_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, ok INTEGER NOT NULL, detail TEXT NOT NULL
    );
  `);

  const now = () => Math.floor(Date.now() / 1000);

  function status(r: MessageRow, t = now()): MessageStatus {
    if (r.status === "draft") return "draft";
    if (r.show_at !== null && r.show_at <= t) return "shown";
    return r.status;
  }

  function summary(r: MessageRow): MessageSummary {
    return {
      id: r.id, title: r.title, status: status(r), showAt: r.show_at, surprise: !!r.surprise,
      queuePos: r.queue_pos, hasPhoto: r.photo !== null, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  const q = {
    all: db.prepare<[], MessageRow>("SELECT * FROM messages ORDER BY COALESCE(show_at, 9e15) DESC, created_at DESC"),
    get: db.prepare<[string], MessageRow>("SELECT * FROM messages WHERE id = ?"),
    insert: db.prepare(`INSERT INTO messages (id,title,doc,bitmap,photo,status,show_at,queue_pos,surprise,created_at,updated_at)
                        VALUES (@id,@title,@doc,@bitmap,@photo,@status,@show_at,@queue_pos,@surprise,@created_at,@updated_at)`),
    del: db.prepare<[string]>("DELETE FROM messages WHERE id = ?"),
    setting: db.prepare<[string], { value: string }>("SELECT value FROM settings WHERE key = ?"),
    putSetting: db.prepare<[string, string]>("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"),
    log: db.prepare<[number, number, string]>("INSERT INTO publish_log(at,ok,detail) VALUES(?,?,?)"),
    logs: db.prepare<[], { at: number; ok: number; detail: string }>("SELECT at, ok, detail FROM publish_log ORDER BY id DESC LIMIT 20"),
  };

  return {
    raw: db,
    now,
    status,
    summary,
    newId(): string {
      // 10 chars of [a-z0-9]: fits the firmware's id rules, unguessable enough for a label
      const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
      const b = randomBytes(10);
      return Array.from(b, (x) => alphabet[x % 36]).join("");
    },
    list(): MessageRow[] { return q.all.all(); },
    get(id: string): MessageRow | undefined { return q.get.get(id); },
    insert(r: MessageRow) { q.insert.run(r); },
    update(id: string, fields: Partial<MessageRow>) {
      const allowed = ["title", "doc", "bitmap", "photo", "status", "show_at", "queue_pos", "surprise"];
      const keys = Object.keys(fields).filter((k) => allowed.includes(k));
      if (!keys.length) return;
      const sql = `UPDATE messages SET ${keys.map((k) => `${k} = @${k}`).join(", ")}, updated_at = @__now WHERE id = @__id`;
      db.prepare(sql).run({ ...fields, __now: now(), __id: id });
    },
    remove(id: string) { q.del.run(id); },
    parseDoc(r: MessageRow): MessageDoc { return JSON.parse(r.doc) as MessageDoc; },

    getSetting<T>(key: string, fallback: T): T {
      const row = q.setting.get(key);
      return row ? (JSON.parse(row.value) as T) : fallback;
    },
    putSetting(key: string, value: unknown) { q.putSetting.run(key, JSON.stringify(value)); },
    settings(): DeviceSettings { return { ...DEFAULT_SETTINGS, ...this.getSetting<Partial<DeviceSettings>>("device", {}) }; },

    logPublish(ok: boolean, detail: string) { q.log.run(now(), ok ? 1 : 0, detail.slice(0, 500)); },
    publishLog() { return q.logs.all().map((l) => ({ at: l.at, ok: !!l.ok, detail: l.detail })); },

    // Sessions: only a hash of the cookie value is stored.
    createSession(ttlSeconds: number): string {
      const token = randomBytes(32).toString("base64url");
      db.prepare("INSERT INTO sessions(id_hash, expires_at) VALUES(?, ?)").run(hashToken(token), now() + ttlSeconds);
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
      return token;
    },
    validSession(token: string | undefined): boolean {
      if (!token) return false;
      const row = db.prepare<[string], { expires_at: number }>("SELECT expires_at FROM sessions WHERE id_hash = ?").get(hashToken(token));
      return !!row && row.expires_at > now();
    },
    deleteSession(token: string) { db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(hashToken(token)); },
  };
}

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}
