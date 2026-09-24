// github.ts - minimal GitHub REST client for the PRIVATE messages repo.
// Uses the Git Data API so every publish is ONE atomic commit (manifest + bitmaps
// together): the frame can never see a manifest that points at a missing file.
// Needs a fine-grained token with "Contents: Read and write" on that one repo.

export interface Head { commitSha: string; treeSha: string }
export interface TreeChange { path: string; sha: string | null } // sha null = delete

type FetchFn = typeof fetch;

export class GitHub {
  tokenExpiry: string | null = null;

  constructor(
    private owner: string,
    private repo: string,
    private branch: string,
    private token: string,
    private fetchFn: FetchFn = fetch,
  ) {}

  private async req(method: string, path: string, body?: unknown, token = this.token): Promise<{ status: number; json: any }> {
    const res = await this.fetchFn(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "heart-frame-webapp",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const exp = res.headers.get("github-authentication-token-expiration");
    if (exp && token === this.token) this.tokenExpiry = exp;
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
    return { status: res.status, json };
  }

  private fail(what: string, r: { status: number; json: any }): never {
    const msg = r.json?.message ?? "";
    const hint = r.status === 401 ? " (token expired or revoked?)" : r.status === 403 || r.status === 404 ? " (token lacks access to this repo?)" : "";
    throw new Error(`GitHub ${what} failed: HTTP ${r.status} ${msg}${hint}`);
  }

  /** null = the repository has no commits yet. */
  async getHead(): Promise<Head | null> {
    const ref = await this.req("GET", `/git/ref/heads/${this.branch}`);
    if (ref.status === 404 || ref.status === 409) return null;
    if (ref.status !== 200) this.fail("read branch", ref);
    const commitSha: string = ref.json.object.sha;
    const commit = await this.req("GET", `/git/commits/${commitSha}`);
    if (commit.status !== 200) this.fail("read commit", commit);
    return { commitSha, treeSha: commit.json.tree.sha };
  }

  /** First commit via the contents API (the Git Data API cannot start an empty repo). */
  async initRepo(): Promise<void> {
    const readme = "# Heart Frame messages\n\nWritten by the Heart Frame web app. Everything here is AES-256-GCM encrypted.\nKeep this repository private anyway.\n";
    const r = await this.req("PUT", `/contents/README.md`, {
      message: "init", content: Buffer.from(readme).toString("base64"), branch: this.branch,
    });
    if (r.status !== 201 && r.status !== 200) this.fail("initialise repo", r);
  }

  async listTree(treeSha: string): Promise<Map<string, string>> {
    const r = await this.req("GET", `/git/trees/${treeSha}?recursive=1`);
    if (r.status !== 200) this.fail("list tree", r);
    const map = new Map<string, string>();
    for (const e of r.json.tree as { path: string; type: string; sha: string }[]) if (e.type === "blob") map.set(e.path, e.sha);
    return map;
  }

  async createBlob(data: Uint8Array): Promise<string> {
    const r = await this.req("POST", `/git/blobs`, { content: Buffer.from(data).toString("base64"), encoding: "base64" });
    if (r.status !== 201) this.fail("upload blob", r);
    return r.json.sha;
  }

  async commit(head: Head, changes: TreeChange[], message: string): Promise<string | null> {
    const tree = await this.req("POST", `/git/trees`, {
      base_tree: head.treeSha,
      tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", sha: c.sha })),
    });
    if (tree.status !== 201) this.fail("create tree", tree);
    const commit = await this.req("POST", `/git/commits`, { message, tree: tree.json.sha, parents: [head.commitSha] });
    if (commit.status !== 201) this.fail("create commit", commit);
    const ref = await this.req("PATCH", `/git/refs/heads/${this.branch}`, { sha: commit.json.sha, force: false });
    if (ref.status === 422) return null; // someone else moved the branch: caller retries
    if (ref.status !== 200) this.fail("move branch", ref);
    return commit.json.sha;
  }

  /** Check a token (e.g. a new device token) can read the repo; returns its expiry header. */
  async probeToken(token: string): Promise<{ ok: boolean; status: number; expiry: string | null }> {
    const res = await this.fetchFn(`https://api.github.com/repos/${this.owner}/${this.repo}/contents/README.md?ref=${this.branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "heart-frame-webapp" },
      signal: AbortSignal.timeout(20000),
    });
    await res.arrayBuffer();
    return { ok: res.status === 200, status: res.status, expiry: res.headers.get("github-authentication-token-expiration") };
  }
}
