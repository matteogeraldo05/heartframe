// Editor.tsx - write text, add a photo, draw; see exactly what the e-paper will show.
import { useEffect, useMemo, useRef, useState } from "react";

import { base64ToBytes, bytesToBase64, HEIGHT, packBits, unpackBits, WIDTH } from "../../shared/format";
import { uploadRef, type MessageDoc, type PhotoLayer } from "../../shared/types";
import { api } from "../api";
import { BorderTab, type BorderDraft } from "../editor/BorderTab";
import { DEFAULT_TOOLS, DrawTools, type ToolState } from "../editor/DrawTools";
import { PhotoTab } from "../editor/PhotoTab";
import { stampMask } from "../editor/stamps";
import { TextTab } from "../editor/TextTab";
import { canvasPerCssPx, loadImage, maskToPng, normalisePhoto, toCanvasPx } from "../editor/util";
import { finishBits, paintEpaper, photoRect, renderMessage } from "../render/compose";
import { ensureFont, FONTS, fontInfo } from "../render/fonts";
import { brushOffsets, Layer, type PaintMode, type Rect } from "../render/layer";
import { pad, TEMPLATES, type Template } from "../render/shapes";
import { imageMask, loadUploads, uploadedBorder, uploadedFont, useUploadsVersion } from "../render/uploads";

const DEFAULT_DOC: MessageDoc = {
  v: 1,
  text: { content: "", font: "Dancing Script", size: 0, align: "center", valign: "middle", lineHeight: 1.15, stroke: 0, background: "none" },
  template: "none",
  photo: null,
  drawing: null,
  signature: "",
};

const DEFAULT_PHOTO: PhotoLayer = {
  fit: "cover", zoom: 1, panX: 0, panY: 0, brightness: 0, contrast: 10, gamma: 1, algo: "atkinson", threshold: 128, sharpen: true, invert: false,
};

const EMPTY = new Uint8Array(WIDTH * HEIGHT);

type Tab = "text" | "photo" | "draw" | "border";
const TAB_LABELS: Record<Tab, string> = { text: "Text", photo: "Photo", draw: "Draw", border: "Border" };

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Drag =
  | { kind: "paint"; x: number; y: number }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "move"; sx: number; sy: number; orig: Rect; handle: Handle | "move" }
  | { kind: "photo"; sx: number; sy: number; panX: number; panY: number };

const MODES: Partial<Record<ToolState["tool"], PaintMode>> = { pen: "black", white: "white", erase: "erase", dither: "dither" };

function handlePoints(r: Rect): [Handle, number, number][] {
  const { x, y, w, h } = r;
  return [["nw", x, y], ["n", x + w / 2, y], ["ne", x + w, y], ["e", x + w, y + h / 2], ["se", x + w, y + h], ["s", x + w / 2, y + h], ["sw", x, y + h], ["w", x, y + h / 2]];
}

function resized(o: Rect, handle: Handle | "move", dx: number, dy: number): Rect {
  if (handle === "move") return { ...o, x: o.x + dx, y: o.y + dy };
  let { x, y, w, h } = o;
  if (handle.includes("w")) { const x2 = x + w; x = Math.min(x + dx, x2 - 1); w = x2 - x; }
  if (handle.includes("e")) w = Math.max(1, w + dx);
  if (handle.includes("n")) { const y2 = y + h; y = Math.min(y + dy, y2 - 1); h = y2 - y; }
  if (handle.includes("s")) h = Math.max(1, h + dy);
  return { x, y, w, h };
}

const normRect = (d: { x0: number; y0: number; x1: number; y1: number }): Rect => {
  const x = Math.floor(Math.min(d.x0, d.x1)), y = Math.floor(Math.min(d.y0, d.y1));
  return { x, y, w: Math.ceil(Math.max(d.x0, d.x1)) - x, h: Math.ceil(Math.max(d.y0, d.y1)) - y };
};

/** Older messages may point at a font/border that was deleted since: fall back to the defaults. */
function normalise(d: MessageDoc): { doc: MessageDoc; lost: string[] } {
  const lost: string[] = [];
  const text = { ...d.text };
  if (!FONTS.some((f) => f.family === text.font) && !uploadedFont(text.font)) { lost.push("font"); text.font = FONTS[0].family; }
  let template = d.template;
  if (!TEMPLATES.some((t) => t.id === template) && !uploadedBorder(template)) { lost.push("border"); template = "none"; }
  const photo = d.photo && d.photo.algo === "bayer" ? { ...d.photo, algo: "bayer4" as const } : d.photo; // same matrix
  return { doc: { ...d, text, template, photo }, lost };
}

export function Editor({ id, onSaved, onDone }: { id: string | null; onSaved: () => void; onDone: () => void }) {
  const [msgId, setMsgId] = useState<string | null>(id);
  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<MessageDoc>(DEFAULT_DOC);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoB64, setPhotoB64] = useState<string | null | undefined>(undefined); // undefined = unchanged
  const [tab, setTab] = useState<Tab>("text");
  const [tools, setToolsState] = useState<ToolState>(DEFAULT_TOOLS);
  const [showOverlay, setShowOverlay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [tick, setTick] = useState(0);         // repaint after drawing changes (layers live in refs)
  const [fontTick, setFontTick] = useState(0); // re-render once a bold/italic face has loaded
  const [draft, setDraft] = useState<BorderDraft | null>(null);
  const uploadsVersion = useUploadsVersion();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawLayer = useRef(new Layer());
  const borderLayer = useRef(new Layer());
  const drag = useRef<Drag | null>(null);
  const marquee = useRef<Rect | null>(null);
  const panFrame = useRef<{ raf: number; patch: Partial<PhotoLayer> | null }>({ raf: 0, patch: null });

  const editingBorder = tab === "border" && draft !== null;
  const toolsActive = tab === "draw" || editingBorder;
  const layer = () => (editingBorder ? borderLayer.current : drawLayer.current);
  const repaint = () => setTick((t) => t + 1);

  // Load an existing message.
  useEffect(() => {
    if (!id) return;
    api.get(id).then(async (m) => {
      const { doc: d, lost } = normalise(m.doc);
      setTitle(m.title);
      setDoc(d);
      if (m.doc.drawing) drawLayer.current.load(unpackBits(base64ToBytes(m.doc.drawing.black)), unpackBits(base64ToBytes(m.doc.drawing.white)));
      if (lost.length) setNote(`The ${lost.join(" and ")} this message used was deleted; showing the default instead. The saved version is unchanged until you save.`);
      if (m.hasPhoto) setPhoto(await loadImage(`/api/messages/${id}/photo`));
      repaint();
    }).catch((e: Error) => setNote(e.message));
  }, [id]);

  // Bold/italic faces load on first use; render again once they're there.
  useEffect(() => {
    let live = true;
    ensureFont(fontInfo(doc.text.font), !!doc.text.bold, !!doc.text.italic).then(() => { if (live) setFontTick((t) => t + 1); }, () => {});
    return () => { live = false; };
  }, [doc.text.font, doc.text.bold, doc.text.italic, uploadsVersion]);

  // A border being drawn: preview the text inside its margin; its pixels are added live below.
  const draftTemplate = useMemo<Template | undefined>(
    () => (editingBorder ? { id: "draft", label: "", inset: pad(draft!.inset), draw() {}, mask: EMPTY } : undefined),
    [editingBorder, draft?.inset],
  );

  // Everything except your drawing and invert; recomputed only when the design changes.
  const base = useMemo(
    () => renderMessage({ ...doc, drawing: null, invert: false }, photo, draftTemplate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, photo, draftTemplate, fontTick, uploadsVersion],
  );

  const currentBits = () => {
    let bits = base.bits;
    if (editingBorder) bits = finishBits(bits, borderLayer.current.composite().black, EMPTY, false);
    const d = drawLayer.current.composite();
    return finishBits(bits, d.black, d.white, !!doc.invert);
  };

  // Paint the preview (+ selection box and handles on top, which are not part of the image).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    paintEpaper(c, currentBits(), showOverlay);
    if (!toolsActive || tools.tool !== "select") return;
    const r = marquee.current ?? layer().float?.to;
    if (!r) return;
    const k = canvasPerCssPx(c);
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.lineWidth = Math.max(1, 1.5 * k);
    ctx.strokeStyle = "#ff2f8a";
    ctx.setLineDash([4 * k, 3 * k]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (!marquee.current) {
      ctx.setLineDash([]);
      const hs = 9 * k;
      for (const [, x, y] of handlePoints(r)) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
        ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
      }
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, showOverlay, tick, doc.invert, editingBorder, toolsActive, tools.tool]);

  const setPhotoLayer = (patch: Partial<PhotoLayer>) => setDoc((d) => ({ ...d, photo: { ...(d.photo ?? DEFAULT_PHOTO), ...patch } }));

  const setTools = (patch: Partial<ToolState>) => {
    if (patch.tool && patch.tool !== "select") { layer().commitFloat(); repaint(); }
    setToolsState((t) => ({ ...t, ...patch }));
  };
  const switchTab = (t: Tab) => {
    drawLayer.current.commitFloat();
    borderLayer.current.commitFloat();
    setTab(t);
    repaint();
  };

  // ---- history & selection actions ----------------------------------------------
  const undo = () => { if (layer().undo()) repaint(); };
  const redo = () => { if (layer().redo()) repaint(); };
  const applySel = () => { layer().commitFloat(); repaint(); };
  const cancelSel = () => { layer().cancelFloat(); repaint(); };
  const deleteSel = () => { layer().deleteFloat(); repaint(); };

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (and Ctrl+Y); Enter / Esc / Delete for a selection.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (!toolsActive) return;
    const el = e.target as HTMLElement | null;
    const typing = el?.closest("textarea, select, input:not([type=range]):not([type=checkbox]):not([type=file])");
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && k === "y") { e.preventDefault(); redo(); }
    else if (layer().float && e.key === "Enter") { e.preventDefault(); applySel(); }
    else if (layer().float && e.key === "Escape") { e.preventDefault(); cancelSel(); }
    else if (layer().float && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); deleteSel(); }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // ---- pointer: draw, select, move the photo ------------------------------------
  const offsets = useMemo(() => brushOffsets(tools.size, tools.shape), [tools.size, tools.shape]);

  // Pointer handlers sit on the frame around the canvas: at high device pixel ratios the browser
  // hit-tests the last sliver of the edge pixels as the frame, and a finger at the edge should still draw.
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const c = canvasRef.current!;
    const p = toCanvasPx(c, e.clientX, e.clientY);
    if (p.x < 0 || p.y < 0 || p.x >= WIDTH || p.y >= HEIGHT) return; // on the white frame itself
    const target = e.currentTarget;
    if (tab === "photo" && photo && doc.photo) {
      target.setPointerCapture(e.pointerId);
      const r = photoRect(photo.width, photo.height, doc.photo);
      drag.current = { kind: "photo", sx: p.x, sy: p.y, panX: r.panX, panY: r.panY };
      return;
    }
    if (!toolsActive) return;
    target.setPointerCapture(e.pointerId);
    const L = layer();
    const px = Math.floor(p.x), py = Math.floor(p.y);
    if (tools.tool === "stamp") {
      const s = stampMask(tools.stamp, tools.stampSize);
      if (!s) { setNote("That stamp was deleted; pick another."); return; }
      L.checkpoint();
      L.stamp(s.mask, s.w, s.h, p.x, p.y);
      repaint();
      return;
    }
    if (tools.tool === "select") {
      const f = L.float;
      if (f) {
        const tol = 10 * canvasPerCssPx(c);
        const hit = handlePoints(f.to).find(([, hx, hy]) => Math.abs(hx - p.x) <= tol && Math.abs(hy - p.y) <= tol);
        const inside = p.x >= f.to.x && p.x <= f.to.x + f.to.w && p.y >= f.to.y && p.y <= f.to.y + f.to.h;
        if (hit || inside) { drag.current = { kind: "move", sx: p.x, sy: p.y, orig: { ...f.to }, handle: hit ? hit[0] : "move" }; return; }
        L.commitFloat();
      }
      drag.current = { kind: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      marquee.current = null;
      repaint();
      return;
    }
    L.checkpoint();
    L.dab(px, py, offsets, MODES[tools.tool]!, tools.amount);
    drag.current = { kind: "paint", x: px, y: py };
    repaint();
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvasPx(canvasRef.current!, e.clientX, e.clientY);
    if (d.kind === "paint") {
      const px = Math.floor(p.x), py = Math.floor(p.y);
      if (px === d.x && py === d.y) return;
      layer().line(d.x, d.y, px, py, offsets, MODES[tools.tool]!, tools.amount);
      d.x = px; d.y = py;
      repaint();
    } else if (d.kind === "marquee") {
      d.x1 = p.x; d.y1 = p.y;
      marquee.current = normRect(d);
      repaint();
    } else if (d.kind === "move") {
      const f = layer().float;
      if (f) { f.to = resized(d.orig, d.handle, p.x - d.sx, p.y - d.sy); repaint(); }
    } else {
      // Photo: coalesce to one re-render per frame (dithering the whole image isn't free).
      panFrame.current.patch = { panX: Math.round(d.panX + p.x - d.sx), panY: Math.round(d.panY + p.y - d.sy), offsetX: undefined, offsetY: undefined };
      if (!panFrame.current.raf) {
        panFrame.current.raf = requestAnimationFrame(() => {
          panFrame.current.raf = 0;
          if (panFrame.current.patch) setPhotoLayer(panFrame.current.patch);
        });
      }
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "marquee") {
      const r = normRect(d);
      marquee.current = null;
      if (Math.abs(d.x1 - d.x0) >= 1 || Math.abs(d.y1 - d.y0) >= 1) layer().lift(r);
      repaint();
    }
  };

  // ---- photo ---------------------------------------------------------------
  const pickPhoto = async (file: File) => {
    try {
      const { img, b64 } = await normalisePhoto(file);
      setPhoto(img);
      setPhotoB64(b64);
      setDoc((d) => ({
        ...d,
        photo: d.photo ? { ...d.photo, panX: 0, panY: 0, offsetX: undefined, offsetY: undefined } : DEFAULT_PHOTO,
        template: d.template === "corner-hearts" ? "none" : d.template,
      }));
    } catch (x) { setNote((x as Error).message); }
  };

  // ---- custom borders --------------------------------------------------------
  const startBorder = () => {
    borderLayer.current.load(new Uint8Array(WIDTH * HEIGHT), new Uint8Array(WIDTH * HEIGHT));
    setDraft({ name: "", inset: 30 });
    setTools({ tool: "pen" });
    repaint();
  };
  const borderFromImage = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg"].includes(ext)) { setNote("Choose a PNG or JPEG file."); return; }
    if (file.size > 2 * 1024 * 1024) { setNote("That file is over 2 MB."); return; }
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      borderLayer.current.load(imageMask(img, WIDTH, HEIGHT), new Uint8Array(WIDTH * HEIGHT));
      setDraft({ name: file.name.replace(/\.[^.]+$/, "").slice(0, 60), inset: 30 });
      setNote(img.naturalWidth === WIDTH && img.naturalHeight === HEIGHT ? "" : `That image is ${img.naturalWidth} × ${img.naturalHeight}; it was stretched to 400 × 300.`);
      repaint();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const saveBorder = async () => {
    if (!draft) return;
    const L = borderLayer.current;
    L.commitFloat();
    if (!L.black.some((v) => v)) { setNote("The border is empty - draw something first."); return; }
    setBusy(true);
    try {
      const info = await api.upload({ kind: "border", name: draft.name.trim(), data: await maskToPng(L.black), inset: draft.inset });
      await loadUploads();
      setDoc((d) => ({ ...d, template: uploadRef(info.id) }));
      setDraft(null);
      setNote(`Border "${info.name}" saved.`);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---- save & publish ---------------------------------------------------------
  const save = async (): Promise<string> => {
    const L = drawLayer.current;
    L.commitFloat();
    await ensureFont(fontInfo(doc.text.font), !!doc.text.bold, !!doc.text.italic).catch(() => {});
    const fresh = renderMessage({ ...doc, drawing: null, invert: false }, photo);
    const bits = finishBits(fresh.bits, L.black, L.white, !!doc.invert);
    const body = {
      title: title.trim() || doc.text.content.split("\n")[0].slice(0, 60).trim() || "Untitled",
      doc: { ...doc, drawing: L.isEmpty() ? null : { black: bytesToBase64(packBits(L.black)), white: bytesToBase64(packBits(L.white)) } },
      bitmap: bytesToBase64(packBits(bits)),
      ...(photoB64 !== undefined ? { photo: photoB64 } : {}),
    };
    const saved = msgId ? await api.update(msgId, body) : await api.create(body);
    setMsgId(saved.id);
    setPhotoB64(undefined);
    onSaved();
    repaint();
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

  const L = layer();
  const toolsPanel = (
    <DrawTools
      tools={tools} setTools={setTools}
      canUndo={L.canUndo} canRedo={L.canRedo} onUndo={undo} onRedo={redo}
      onClear={() => { L.clear(); repaint(); }} clearLabel={editingBorder ? "Clear border" : "Clear drawing"}
      floating={!!L.float} onApply={applySel} onCancel={cancelSel} onDelete={deleteSel}
      borderMode={editingBorder} onNote={setNote}
    />
  );

  const canvasClass = ["epaper", toolsActive ? "drawing" : "", tab === "photo" && photo ? "movable" : ""].filter(Boolean).join(" ");

  return (
    <div className="editor">
      <section className="controls card">
        <input className="title" placeholder="Title (only you see this)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="tabs">
          {(["text", "photo", "draw", "border"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => switchTab(t)}>{TAB_LABELS[t]}</button>
          ))}
        </div>

        {tab === "text" && <TextTab doc={doc} setDoc={setDoc} fontPx={base.fontPx} onNote={setNote} />}
        {tab === "photo" && (
          <PhotoTab doc={doc} hasPhoto={!!photo} setPhotoLayer={setPhotoLayer} onPick={(f) => void pickPhoto(f)}
            onRemove={() => { setPhoto(null); setPhotoB64(null); setDoc((d) => ({ ...d, photo: null })); }} />
        )}
        {tab === "draw" && (
          <div className="stack">
            {toolsPanel}
            <p className="muted">Draw directly on the preview.</p>
          </div>
        )}
        {tab === "border" && (
          <BorderTab doc={doc} setTemplate={(t) => setDoc((d) => ({ ...d, template: t }))}
            showOverlay={showOverlay} setShowOverlay={setShowOverlay}
            draft={draft} setDraft={(d) => { setDraft(d); repaint(); }} onStartDraw={startBorder} onUploadPng={(f) => void borderFromImage(f)}
            onSave={() => void saveBorder()} busy={busy} tools={editingBorder ? toolsPanel : null} />
        )}
      </section>

      <section className="preview card">
        <div className="bezel" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className={canvasClass} data-testid="epaper" />
        </div>
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
