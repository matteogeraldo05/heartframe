// Queue.tsx - what's on the frame now and what comes next.
import { useEffect, useState } from "react";

import type { MessageSummary } from "../../shared/types";
import { api, when } from "../api";

export function Thumb({ m }: { m: MessageSummary }) {
  return <img className="thumb" alt="" src={`/api/messages/${m.id}/preview.png?v=${m.updatedAt}`} />;
}

export function Queue({ refresh, onEdit, onChanged }: { refresh: number; onEdit: (id: string) => void; onChanged: () => void }) {
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [err, setErr] = useState("");

  const load = () => api.list().then(setItems).catch((e: Error) => setErr(e.message));
  useEffect(() => { void load(); }, [refresh]);

  const now = items.filter((m) => m.status === "shown").sort((a, b) => (b.showAt ?? 0) - (a.showAt ?? 0))[0];
  const upcoming = items.filter((m) => m.status === "queued" || m.status === "scheduled").sort((a, b) => (a.showAt ?? 9e15) - (b.showAt ?? 9e15));
  const queued = upcoming.filter((m) => m.status === "queued").sort((a, b) => (a.queuePos ?? 0) - (b.queuePos ?? 0));

  const act = (p: Promise<unknown>) => p.then(() => { onChanged(); return load(); }).catch((e: Error) => setErr(e.message));
  const move = (id: string, dir: -1 | 1) => {
    const ids = queued.map((m) => m.id);
    const i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void act(api.reorder(ids));
  };

  return (
    <div className="stack">
      {err && <p className="error">{err}</p>}
      <section className="card">
        <h2>On the frame now</h2>
        {now ? (
          <div className="item"><Thumb m={now} /><div><b>{now.title}</b><div className="muted">since {when(now.showAt)}</div></div></div>
        ) : <p className="muted">Nothing yet - the frame shows its welcome screen.</p>}
      </section>
      <section className="card">
        <h2>Coming up</h2>
        {!upcoming.length && <p className="muted">Empty. Write something and "Add to queue".</p>}
        {upcoming.map((m) => (
          <div className="item" key={m.id}>
            <Thumb m={m} />
            <div className="grow">
              <b>{m.title}</b>
              <div className="muted">{when(m.showAt)} · {m.status === "queued" ? "queue" : m.surprise ? "surprise" : "pinned date"}</div>
            </div>
            <div className="row">
              {m.status === "queued" && <button onClick={() => move(m.id, -1)} title="earlier">↑</button>}
              {m.status === "queued" && <button onClick={() => move(m.id, 1)} title="later">↓</button>}
              <button onClick={() => onEdit(m.id)}>Edit</button>
              <button onClick={() => act(api.sendNow(m.id))}>Send now</button>
              <button onClick={() => act(api.unschedule(m.id))}>Remove</button>
            </div>
          </div>
        ))}
        <p className="muted">Queued messages go out one per day at the time set in Settings. Pinned dates skip the queue for that day.</p>
      </section>
    </div>
  );
}
