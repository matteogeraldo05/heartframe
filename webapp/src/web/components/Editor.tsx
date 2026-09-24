// Editor.tsx - write text, add a photo, draw; see exactly what the e-paper will show.
import { useEffect, useMemo, useRef, useState } from "react";

import { bytesToBase64, HEIGHT, packBits, unpackBits, WIDTH, base64ToBytes } from "../../shared/format";
import type { MessageDoc, PhotoLayer } from "../../shared/types";
import { api } from "../api";
import { paintEpaper, renderMessage } from "../render/compose";
import { FONTS, fontInfo } from "../render/fonts";
import { fillHeart, TEMPLATES } from "../render/shapes";

const DEFAULT_DOC: MessageDoc = {
  v: 1,
  text: { content: "Good morning, beautiful", font: "Dancing Script", size: 0, align: "center", valign: "middle", lineHeight: 1.15, stroke: 0, whiteBehind: false },
  template: "corner-hearts",
  photo: null,
  drawing: null,
  signature: "",
};

const DEFAULT_PHOTO: PhotoLayer = {
  fit: "cover", zoom: 1, offsetX: 0, offsetY: 0, brightness: 0, contrast: 10, gamma: 1, algo: "atkinson", threshold: 128, sharpen: true, invert: false,
};

type Tab = "text" | "photo" | "draw" | "style";
type Brush = "pen" | "white" | "erase" | "heart";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("could not read that image"));
    img.src = src;
  });
}

/** Downscale to <= 1200 px and re-encode as JPEG in the browser (strips EXIF/GPS, HEIC fails here). */
async function normalisePhoto(file: File): Promise<{ img: HTMLImageElement; b64: string }> {
  const url = URL.createObjectURL(file);
  try {
    const src = await loadImage(url).catch(() => {
      throw new Error("Couldn't read this image. iPhone HEIC photos only open in Safari - export as JPEG or use Safari.");
    });
    const scale = Math.min(1, 1200 / Math.max(src.naturalWidth, src.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(src.naturalWidth * scale);
    c.height = Math.round(src.naturalHeight * scale);
    c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.88));
    const b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    const img = await loadImage(URL.createObjectURL(blob));
    return { img, b64 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Editor({ id, onSaved, onDone }: { id: string | null; onSaved: () => void; onDone: () => void }) {
  const [msgId, setMsgId] = useState<string | null>(id);
  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<MessageDoc>(DEFAULT_DOC);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoB64, setPhotoB64] = useState<string | null | undefined>(undefined); // undefined = unchanged
  const [tab, setTab] = useState<Tab>("text");
  const [brush, setBrush] = useState<Brush>("pen");
  const [brushSize, setBrushSize] = useState(4);
  const [showOverlay, setShowOverlay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [drawTick, setDrawTick] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const black = useRef<Uint8Array>(new Uint8Array(WIDTH * HEIGHT));
  const white = useRef<Uint8Array>(new Uint8Array(WIDTH * HEIGHT));
  const undo = useRef<{ b: Uint8Array; w: Uint8Array }[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Load an existing message.
  useEffect(() => {
    if (!id) return;
    api.get(id).then(async (m) => {
      setTitle(m.title);
      setDoc(m.doc);
      if (m.doc.drawing) {
        black.current = unpackBits(base64ToBytes(m.doc.drawing.black));
        white.current = unpackBits(base64ToBytes(m.doc.drawing.white));
      }
      if (m.hasPhoto) setPhoto(await loadImage(`/api/messages/${id}/photo`));
    }).catch((e: Error) => setNote(e.message));
  }, [id]);

  // Everything except your drawing; recomputed only when the design changes.
  const base = useMemo(() => renderMessage({ ...doc, drawing: null }, photo), [doc, photo]);

  const finalBits = () => {
    const bits = base.bits.slice();
    for (let i = 0; i < bits.length; i++) {
      if (black.current[i]) bits[i] = 1;
      else if (white.current[i]) bits[i] = 0;
    }
    return bits;
  };

  useEffect(() => {
    if (canvasRef.current) paintEpaper(canvasRef.current, finalBits(), showOverlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, showOverlay, drawTick]);

  const setText = (patch: Partial<MessageDoc["text"]>) => setDoc((d) => ({ ...d, text: { ...d.text, ...patch } }));
  const setPhotoLayer = (patch: Partial<PhotoLayer>) => setDoc((d) => ({ ...d, photo: { ...(d.photo ?? DEFAULT_PHOTO), ...patch } }));

  // ---- drawing -------------------------------------------------------------
  const paint = (x: number, y: number) => {
    const r = Math.max(1, brushSize / 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = Math.round(x + dx), py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) continue;
        const i = py * WIDTH + px;
        black.current[i] = brush === "pen" ? 1 : 0;
        white.current[i] = brush === "white" ? 1 : 0;
      }
    }
  };
  const stampHeart = (x: number, y: number) => {
    const c = document.createElement("canvas");
    c.width = WIDTH; c.height = HEIGHT;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    fillHeart(ctx, x, y, brushSize * 6);
    const d = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    for (let i = 0; i < WIDTH * HEIGHT; i++) if (d[i * 4 + 3] > 128) { black.current[i] = 1; white.current[i] = 0; }
  };
  const toPixel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * WIDTH) / rect.width, y: ((e.clientY - rect.top) * HEIGHT) / rect.height };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tab !== "draw") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    undo.current.push({ b: black.current.slice(), w: white.current.slice() });
    if (undo.current.length > 20) undo.current.shift();
    const p = toPixel(e);
    if (brush === "heart") stampHeart(p.x, p.y); else paint(p.x, p.y);
    last.current = brush === "heart" ? null : p;
    setDrawTick((t) => t + 1);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tab !== "draw" || !last.current) return;
    const p = toPixel(e);
    const steps = Math.ceil(Math.hypot(p.x - last.current.x, p.y - last.current.y));
    for (let s = 1; s <= steps; s++) paint(last.current.x + ((p.x - last.current.x) * s) / steps, last.current.y + ((p.y - last.current.y) * s) / steps);
    last.current = p;
    setDrawTick((t) => t + 1);
  };
  const onUp = () => { last.current = null; };

  const drawingForDoc = (): MessageDoc["drawing"] => {
    const any = black.current.some((v) => v) || white.current.some((v) => v);
    return any ? { black: bytesToBase64(packBits(black.current)), white: bytesToBase64(packBits(white.current)) } : null;
  };

  // ---- save & publish ---------------------------------------------------------
  const save = async (): Promise<string> => {
    const body = {
      title: title.trim() || doc.text.content.split("\n")[0].slice(0, 60) || "Untitled",
      doc: { ...doc, drawing: drawingForDoc() },
      bitmap: bytesToBase64(packBits(finalBits())),
      ...(photoB64 !== undefined ? { photo: photoB64 } : {}),
    };
    const saved = msgId ? await api.update(msgId, body) : await api.create(body);
    setMsgId(saved.id);
    setPhotoB64(undefined);
    onSaved();
    return saved.id;
  };
  const run = (label: string, fn: (id: string) => Promise<unknown>, done = false) => async () => {
    setBusy(true);
    setNote("");
    try {
      const sid = await save();
      await fn(sid);
      setNote(label);
      if (done) onDone();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const f = fontInfo(doc.text.font);
  const tooSmall = base.fontPx > 0 && base.fontPx < f.minPx;

  return (
    <div className="editor">
      <section className="controls card">
        <input className="title" placeholder="Title (only you see this)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="tabs">
          {(["text", "photo", "draw", "style"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {tab === "text" && (
          <div className="stack">
            <textarea rows={5} value={doc.text.content} onChange={(e) => setText({ content: e.target.value })} placeholder="Write your message…" />
            <label>Font
              <select value={doc.text.font} onChange={(e) => setText({ font: e.target.value })}>
                {FONTS.map((x) => <option key={x.family} value={x.family}>{x.label}</option>)}
              </select>
            </label>
            <label>Size {doc.text.size === 0 ? `(auto: ${base.fontPx}px)` : `${doc.text.size}px`}
              <input type="range" min={0} max={140} value={doc.text.size} onChange={(e) => setText({ size: +e.target.value })} />
            </label>
            {tooSmall && <p className="warn">This font breaks up below ~{f.minPx}px on e-paper. Use fewer words, a bolder font, or thicken it below.</p>}
            <label>Thicken (helps thin script fonts) {doc.text.stroke}px
              <input type="range" min={0} max={4} step={0.5} value={doc.text.stroke} onChange={(e) => setText({ stroke: +e.target.value })} />
            </label>
            <label>Line spacing {doc.text.lineHeight.toFixed(2)}
              <input type="range" min={0.8} max={2} step={0.05} value={doc.text.lineHeight} onChange={(e) => setText({ lineHeight: +e.target.value })} />
            </label>
            <div className="row">
              <select value={doc.text.align} onChange={(e) => setText({ align: e.target.value as MessageDoc["text"]["align"] })}>
                <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
              </select>
              <select value={doc.text.valign} onChange={(e) => setText({ valign: e.target.value as MessageDoc["text"]["valign"] })}>
                <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
              </select>
            </div>
            <label className="check"><input type="checkbox" checked={doc.text.whiteBehind} onChange={(e) => setText({ whiteBehind: e.target.checked })} /> White box behind the text (for photos)</label>
            <label>Signature (bottom right)
              <input value={doc.signature} maxLength={40} onChange={(e) => setDoc({ ...doc, signature: e.target.value })} placeholder="- M" />
            </label>
          </div>
        )}

        {tab === "photo" && (
          <div className="stack">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const { img, b64 } = await normalisePhoto(file);
                setPhoto(img);
                setPhotoB64(b64);
                if (!doc.photo) setDoc((d) => ({ ...d, photo: DEFAULT_PHOTO, template: d.template === "corner-hearts" ? "none" : d.template }));
              } catch (x) { setNote((x as Error).message); }
            }} />
            {photo && doc.photo && (
              <>
                <div className="row">
                  <select value={doc.photo.algo} onChange={(e) => setPhotoLayer({ algo: e.target.value as PhotoLayer["algo"] })}>
                    <option value="atkinson">Atkinson (best for faces)</option>
                    <option value="floyd">Floyd–Steinberg (smooth)</option>
                    <option value="bayer">Ordered (pattern)</option>
                    <option value="threshold">Threshold (line art)</option>
                  </select>
                  <select value={doc.photo.fit} onChange={(e) => setPhotoLayer({ fit: e.target.value as PhotoLayer["fit"] })}>
                    <option value="cover">Fill</option><option value="contain">Fit</option>
                  </select>
                </div>
                {([
                  ["brightness", -100, 100, 1], ["contrast", -100, 100, 1], ["gamma", 0.4, 2.5, 0.05],
                  ["zoom", 1, 4, 0.05], ["offsetX", -1, 1, 0.02], ["offsetY", -1, 1, 0.02],
                ] as const).map(([k, min, max, step]) => (
                  <label key={k}>{k} {Number(doc.photo![k]).toFixed(step < 1 ? 2 : 0)}
                    <input type="range" min={min} max={max} step={step} value={doc.photo![k]} onChange={(e) => setPhotoLayer({ [k]: +e.target.value })} />
                  </label>
                ))}
                {doc.photo.algo === "threshold" && (
                  <label>threshold {doc.photo.threshold}
                    <input type="range" min={0} max={255} value={doc.photo.threshold} onChange={(e) => setPhotoLayer({ threshold: +e.target.value })} />
                  </label>
                )}
                <label className="check"><input type="checkbox" checked={doc.photo.sharpen} onChange={(e) => setPhotoLayer({ sharpen: e.target.checked })} /> Sharpen</label>
                <label className="check"><input type="checkbox" checked={doc.photo.invert} onChange={(e) => setPhotoLayer({ invert: e.target.checked })} /> Invert</label>
                <button onClick={() => { setPhoto(null); setPhotoB64(null); setDoc({ ...doc, photo: null }); }}>Remove photo</button>
              </>
            )}
            <p className="muted">Photos are shrunk and re-encoded in your browser (location data stripped) before upload. The server never decodes them.</p>
          </div>
        )}

        {tab === "draw" && (
          <div className="stack">
            <div className="row">
              {(["pen", "white", "erase", "heart"] as Brush[]).map((b) => (
                <button key={b} className={brush === b ? "tab active" : "tab"} onClick={() => setBrush(b)}>
                  {b === "pen" ? "Black pen" : b === "white" ? "White pen" : b === "erase" ? "Eraser" : "♥ stamp"}
                </button>
              ))}
            </div>
            <label>Size {brushSize}
              <input type="range" min={1} max={16} value={brushSize} onChange={(e) => setBrushSize(+e.target.value)} />
            </label>
            <div className="row">
              <button onClick={() => { const u = undo.current.pop(); if (u) { black.current = u.b; white.current = u.w; setDrawTick((t) => t + 1); } }}>Undo</button>
              <button onClick={() => { undo.current.push({ b: black.current.slice(), w: white.current.slice() }); black.current.fill(0); white.current.fill(0); setDrawTick((t) => t + 1); }}>Clear drawing</button>
            </div>
            <p className="muted">Draw directly on the preview.</p>
          </div>
        )}

        {tab === "style" && (
          <div className="stack">
            <label>Border
              <select value={doc.template} onChange={(e) => setDoc({ ...doc, template: e.target.value })}>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} /> Show where the battery indicator goes</label>
          </div>
        )}
      </section>

      <section className="preview card">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className={tab === "draw" ? "epaper drawing" : "epaper"}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <p className="muted">Exactly what the frame will show (1-bit, 400 × 300).</p>
        <div className="actions">
          <button disabled={busy} onClick={run("Saved as draft", async () => {})}>Save draft</button>
          <button disabled={busy} onClick={run("Added to the queue", (sid) => api.queue(sid), true)}>Add to queue</button>
          <span className="row">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <button disabled={busy || !when} onClick={run("Scheduled", (sid) => api.schedule(sid, Math.floor(new Date(when).getTime() / 1000)), true)}>Schedule</button>
          </span>
          <button className="primary" disabled={busy} onClick={run("Sent! It shows up at the frame's next check.", (sid) => api.sendNow(sid))}>Send now ♥</button>
        </div>
        {note && <p className="note">{note}</p>}
      </section>
    </div>
  );
}
