import { useEffect, useState } from "react";

import { api } from "./api";
import { Editor } from "./components/Editor";
import { Library } from "./components/Library";
import { Login } from "./components/Login";
import { Logo } from "./components/Logo";
import { Queue } from "./components/Queue";
import { Settings } from "./components/Settings";
import { loadFonts } from "./render/fonts";
import { loadUploads } from "./render/uploads";
import { ThemeToggle } from "./theme";

type View = "compose" | "queue" | "library" | "settings";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [view, setView] = useState<View>("compose");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [uploadsReady, setUploadsReady] = useState(false);

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
    loadFonts().finally(() => setFontsReady(true));
    const onLogout = () => setAuthed(false);
    window.addEventListener("hf-logout", onLogout);
    return () => window.removeEventListener("hf-logout", onLogout);
  }, []);

  // Your uploaded fonts/borders must be loaded before a message that uses them is opened.
  useEffect(() => {
    if (!authed) { setUploadsReady(false); return; }
    loadUploads().catch(() => {}).finally(() => setUploadsReady(true));
  }, [authed]);

  if (authed === null || !fontsReady || (authed && !uploadsReady)) return <div className="center muted">loading…</div>;
  if (!authed) return (<><ThemeToggle floating /><Login onDone={() => setAuthed(true)} /></>);

  const edit = (id: string | null) => { setEditingId(id); setView("compose"); };
  const changed = () => setRefresh((n) => n + 1);

  return (
    <div className="app">
      <header>
        <Logo />
        <nav>
          {(["compose", "queue", "library", "settings"] as View[]).map((v) => (
            <button key={v} className={view === v ? "tab active" : "tab"} onClick={() => (v === "compose" ? edit(null) : setView(v))}>
              {v === "compose" ? "Write" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
          <button className="tab" onClick={() => api.logout().finally(() => setAuthed(false))}>Log out</button>
          <ThemeToggle />
        </nav>
      </header>
      <main>
        {view === "compose" && <Editor key={editingId ?? "new"} id={editingId} onSaved={changed} onDone={() => setView("queue")} />}
        {view === "queue" && <Queue refresh={refresh} onEdit={edit} onChanged={changed} />}
        {view === "library" && <Library refresh={refresh} onEdit={edit} onChanged={changed} />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}
