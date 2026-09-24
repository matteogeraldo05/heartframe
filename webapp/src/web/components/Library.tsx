// Library.tsx - every message you've made, including drafts and history.
import { useEffect, useState } from "react";

import type { MessageSummary } from "../../shared/types";
import { api, when } from "../api";
import { Thumb } from "./Queue";

export function Library({ refresh, onEdit, onChanged }: { refresh: number; onEdit: (id: string) => void; onChanged: () => void }) {
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [err, setErr] = useState("");
  const load = () => api.list().then(setItems).catch((e: Error) => setErr(e.message));
  useEffect(() => { void load(); }, [refresh]);
  const act = (p: Promise<unknown>) => p.then(() => { onChanged(); return load(); }).catch((e: Error) => setErr(e.message));

  return (
    <div className="stack">
      {err && <p className="error">{err}</p>}
      <div className="grid">
        {items.map((m) => (
          <div className="card tile" key={m.id}>
            <Thumb m={m} />
            <b>{m.title}</b>
            <span className={`badge ${m.status}`}>{m.status}{m.surprise ? " ♥" : ""}</span>
            <span className="muted">{m.showAt ? when(m.showAt) : "not scheduled"}</span>
            <div className="row">
              <button onClick={() => onEdit(m.id)}>Edit</button>
              <button onClick={() => act(api.duplicate(m.id))}>Duplicate</button>
              {m.status === "draft" && <button onClick={() => act(api.queue(m.id))}>Queue</button>}
              <button onClick={() => { if (confirm(`Delete "${m.title}"?`)) void act(api.remove(m.id)); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {!items.length && <p className="muted">No messages yet.</p>}
    </div>
  );
}
