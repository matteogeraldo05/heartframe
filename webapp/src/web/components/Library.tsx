// Library.tsx - every message you've made, including drafts and history.
import { useEffect, useState } from "react";

import type { MessageSummary } from "../../shared/types";
import { api, when } from "../api";
import { SORTS, sortMessages, type SortKey } from "../sort";
import { Thumb } from "./Queue";

const KEY = "hf-library-sort";

function savedSort(): SortKey {
  try {
    const v = localStorage.getItem(KEY);
    return SORTS.some(([k]) => k === v) ? (v as SortKey) : "date";
  } catch {
    return "date";
  }
}

export function Library({ refresh, onEdit, onChanged }: { refresh: number; onEdit: (id: string) => void; onChanged: () => void }) {
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<SortKey>(savedSort);
  const load = () => api.list().then(setItems).catch((e: Error) => setErr(e.message));
  useEffect(() => { void load(); }, [refresh]);
  const act = (p: Promise<unknown>) => p.then(() => { onChanged(); return load(); }).catch((e: Error) => setErr(e.message));
  const changeSort = (k: SortKey) => {
    setSort(k);
    try { localStorage.setItem(KEY, k); } catch { /* storage blocked: still sorts for this visit */ }
  };
  const star = (m: MessageSummary) => {
    setItems((xs) => xs.map((x) => (x.id === m.id ? { ...x, favourite: !m.favourite } : x))); // instant; server confirms
    api.favourite(m.id, !m.favourite).catch((e: Error) => { setErr(e.message); void load(); });
  };

  return (
    <div className="stack">
      {err && <p className="error">{err}</p>}
      <div className="row library-bar">
        <label className="inline">Sort by
          <select value={sort} onChange={(e) => changeSort(e.target.value as SortKey)}>
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="grid">
        {sortMessages(items, sort).map((m) => (
          <div className="card tile" key={m.id}>
            <div className="tile-top">
              <Thumb m={m} />
              <button type="button" className={m.favourite ? "star on" : "star"} aria-pressed={m.favourite}
                aria-label={m.favourite ? `Remove "${m.title}" from favourites` : `Add "${m.title}" to favourites`}
                title={m.favourite ? "Favourite" : "Add to favourites"} onClick={() => star(m)}>
                {m.favourite ? "★" : "☆"}
              </button>
            </div>
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
