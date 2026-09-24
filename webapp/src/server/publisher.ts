// publisher.ts - one publish at a time, debounced. Each publish = one atomic commit.
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Config } from "./config.js";
import { gitBlobSha } from "./crypto.js";
import type { DB } from "./db.js";
import type { GitHub, TreeChange } from "./github.js";
import { buildManifest, reflowQueue, type FirmwareInfo } from "./manifest.js";

export class Publisher {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private lastHash = "";
  pending = false;

  constructor(private db: DB, private gh: GitHub, private cfg: Config, private log: (msg: string) => void) {}

  /** Ask for a publish soon (edits in quick succession become one commit). */
  schedule(delayMs = 1500): void {
    this.pending = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.run(false); }, delayMs);
  }

  async run(force: boolean): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      do {
        this.again = false;
        try {
          const detail = await this.publishOnce(force);
          if (detail) { this.db.logPublish(true, detail); this.log(`publish: ${detail}`); }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.db.logPublish(false, msg);
          this.log(`publish failed: ${msg}`);
        }
      } while (this.again);
      this.pending = false;
      this.running = null;
    })();
    return this.running;
  }

  private async publishOnce(force: boolean): Promise<string | null> {
    reflowQueue(this.db);
    const built = buildManifest(this.db, this.cfg);
    if (!force && built.contentHash === this.lastHash) return null;

    const files = new Map<string, Buffer>();
    files.set("manifest.hfe", built.manifest);
    for (const b of built.blobs) files.set(b.path, b.data);
    const fw = this.db.getSetting<FirmwareInfo | null>("firmware", null);
    if (fw) files.set(fw.path, readFileSync(path.join(this.cfg.dataDir, "firmware", path.basename(fw.path))));

    for (let attempt = 0; attempt < 3; attempt++) {
      let head = await this.gh.getHead();
      if (!head) { await this.gh.initRepo(); head = await this.gh.getHead(); }
      if (!head) throw new Error("repository still empty after init");
      const tree = await this.gh.listTree(head.treeSha);

      const changes: TreeChange[] = [];
      for (const [p, data] of files) {
        if (tree.get(p) === gitBlobSha(data)) continue; // already there, byte for byte
        changes.push({ path: p, sha: await this.gh.createBlob(data) });
      }
      // Remove bitmaps / firmware the manifest no longer references (history keeps them, encrypted).
      for (const p of tree.keys()) {
        if ((p.startsWith("b/") || p.startsWith("fw/")) && !files.has(p)) changes.push({ path: p, sha: null });
      }
      if (!changes.length) { this.lastHash = built.contentHash; return null; }
      const sha = await this.gh.commit(head, changes, `publish ${new Date().toISOString()}`);
      if (sha) {
        this.lastHash = built.contentHash;
        return `${built.itemCount} message(s) live, ${changes.length} file change(s), commit ${sha.slice(0, 7)}`;
      }
    }
    throw new Error("branch kept moving; gave up after 3 attempts");
  }
}
