// Editor.tsx - write text, add a photo, draw; see exactly what the e-paper will show.
import { useEffect, useMemo, useRef, useState } from "react";

import { base64ToBytes, bytesToBase64, HEIGHT, packBits, unpackBits, WIDTH } from "../../shared/format";
import { uploadRef, type MessageDoc, type PhotoLayer } from "../../shared/types";
import { api } from "../api";
import { BorderTab, type BorderDraft } from "../editor/BorderTab";
import { DEFAULT_TOOLS, DrawTools, type ToolState } from "../editor/DrawTools";
import { History } from "../editor/history";
import { PhotoTab } from "../editor/PhotoTab";
import { stampMask } from "../editor/stamps";
import { TextTab } from "../editor/TextTab";
import { canvasPerCssPx, loadImage, maskToPng, normalisePhoto, toCanvasPx } from "../editor/util";
import { finishBits, paintEpaper, photoRect, renderMessage } from "../render/compose";
import { ensureFont, FONTS, fontInfo } from "../render/fonts";
import { brushOffsets, floodRegion, Layer, shapeMask, type PaintMode, type Rect } from "../render/layer";
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

/** The photo as shown (decoded) plus its JPEG bytes (what gets uploaded). */
type Photo = { img: HTMLImageElement; b64: string } | null;

/** One undo step: the whole editor just before a change. Layers are kept packed (15 KB each). */
interface Snap { doc: MessageDoc; photo: Photo; draw: [Uint8Array, Uint8Array]; border: [Uint8Array, Uint8Array] }

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Drag =
  | { kind: "paint"; x: number; y: number }
  | { kind: "shape"; x0: number; y0: number; moved: boolean; base: [Uint8Array, Uint8Array] }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "move"; sx: number; sy: number; orig: Rect; angle: number; handle: Handle | "move" }
  | { kind: "rotate"; cx: number; cy: number; start: number; angle0: number }
  | { kind: "photo"; sx: number; sy: number; panX: number; panY: number }
  | { kind: "text"; sx: number; sy: number; dx: number; dy: number };

const MODES: Partial<Record<ToolState["tool"], PaintMode>> = { pen: "black", white: "white", erase: "erase", dither: "dither" };

// ---- selection geometry (the box can be rotated by `a` around its centre) ---------------
const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const centre = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

/** Handle positions on the canvas, for a box rotated by `a`. */
function handlePoints(r: Rect, a: number): [Handle, number, number][] {
  const [cx, cy] = centre(r), hw = r.w / 2, hh = r.h / 2;
  const local: [Handle, number, number][] = [["nw", -hw, -hh], ["n", 0, -hh], ["ne", hw, -hh], ["e", hw, 0], ["se", hw, hh], ["s", 0, hh], ["sw", -hw, hh], ["w", -hw, 0]];
  return local.map(([h, x, y]) => { const [rx, ry] = rot(x, y, a); return [h, cx + rx, cy + ry]; });
}

/**
 * The round rotate handle, `gap` canvas px above the box (in the box's own "up"), and which edge
 * handle it hangs from. When that would be off the image (box at the top), it goes below instead.
 */
function rotateHandle(r: Rect, a: number, gap: number): { x: number; y: number; from: Handle } {
  const [cx, cy] = centre(r);
  const [ux, uy] = rot(0, -r.h / 2 - gap, a);
  const x = cx + ux, y = cy + uy;
  if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) return { x, y, from: "n" };
  return { x: cx - ux, y: cy - uy, from: "s" };
}

/** Resize in the box's own (rotated) frame: the opposite edge/corner stays put on the canvas. */
function resized(o: Rect, a: number, handle: Handle | "move", dx: number, dy: number): Rect {
  if (handle === "move") return { ...o, x: o.x + dx, y: o.y + dy };
  const [ldx, ldy] = rot(dx, dy, -a);
  let x = -o.w / 2, y = -o.h / 2, w = o.w, h = o.h;
  if (handle.includes("w")) { const x2 = x + w; x = Math.min(x + ldx, x2 - 1); w = x2 - x; }
  if (handle.includes("e")) w = Math.max(1, w + ldx);
  if (handle.includes("n")) { const y2 = y + h; y = Math.min(y + ldy, y2 - 1); h = y2 - y; }
  if (handle.includes("s")) h = Math.max(1, h + ldy);
  const [ccx, ccy] = rot(x + w / 2, y + h / 2, a); // new centre, relative to the old one
  const [ocx, ocy] = centre(o);
  return { x: ocx + ccx - w / 2, y: ocy + ccy - h / 2, w, h };
}

const insideBox = (r: Rect, a: number, px: number, py: number) => {
  const [cx, cy] = centre(r);
  const [lx, ly] = rot(px - cx, py - cy, -a);
  return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2;
};

const normRect = (d: { x0: number; y0: number; x1: number; y1: number }): Rect => {
  const x = Math.floor(Math.min(d.x0, d.x1)), y = Math.floor(Math.min(d.y0, d.y1));
  return { x, y, w: Math.ceil(Math.max(d.x0, d.x1)) - x, h: Math.ceil(Math.max(d.y0, d.y1)) - y };
};

/** Shift: lock shapes to a square/circle and lines to 45° steps. */
function constrain(kind: ToolState["shapeKind"], x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0, dy = y1 - y0;
  if (kind === "line") {
    if (Math.abs(dx) > 2 * Math.abs(dy)) return [x1, y0];
    if (Math.abs(dy) > 2 * Math.abs(dx)) return [x0, y1];
  }
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  return [x0 + Math.sign(dx || 1) * m, y0 + Math.sign(dy || 1) * m];
}

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

/** Which part of the doc changed (quick edits to the same thing become one undo step). */
function changeKey(a: MessageDoc, b: MessageDoc): string {
  const keys: string[] = [];
  for (const k of Object.keys({ ...a, ...b }) as (keyof MessageDoc)[]) {
    if (a[k] === b[k]) continue;
    if ((k === "text" || k === "photo") && a[k] && b[k]) {
      const x = a[k] as unknown as Record<string, unknown>, y = b[k] as unknown as Record<string, unknown>;
      for (const kk of Object.keys({ ...x, ...y })) if (x[kk] !== y[kk]) keys.push(`${k}.${kk}`);
    } else keys.push(k);
  }
  return keys.sort().join(",");
}

export function Editor({ id, onSaved, onDone }: { id: string | null; onSaved: () => void; onDone: () => void }) {
  const [msgId, setMsgId] = useState<string | null>(id);
  const [title, setTitle] = useState("");
  const [doc, setDocState] = useState<MessageDoc>(DEFAULT_DOC);
  const [photo, setPhotoState] = useState<Photo>(null);
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
  const history = useRef(new History<Snap>());
  const docRef = useRef(doc);
  const photoRef = useRef<Photo>(null);
  const savedPhoto = useRef<string | null>(null); // JPEG (base64) the server has; upload only when it differs
  const drag = useRef<Drag | null>(null);
  const marquee = useRef<Rect | null>(null);
  const frame = useRef<{ raf: number; run: (() => void) | null }>({ raf: 0, run: null });

  const editingBorder = tab === "border" && draft !== null;
  const toolsActive = tab === "draw" || editingBorder;
  const layer = () => (editingBorder ? borderLayer.current : drawLayer.current);
  const repaint = () => setTick((t) => t + 1);

  // ---- state + history ------------------------------------------------------------
  const setPhoto = (p: Photo) => { photoRef.current = p; setPhotoState(p); };
  const snapshot = (): Snap => {
    const d = drawLayer.current, b = borderLayer.current;
    return { doc: docRef.current, photo: photoRef.current, draw: [packBits(d.black), packBits(d.white)], border: [packBits(b.black), packBits(b.white)] };
  };
  const restore = (s: Snap) => {
    docRef.current = s.doc;
    setDocState(s.doc);
    setPhoto(s.photo);
    drawLayer.current.load(unpackBits(s.draw[0]), unpackBits(s.draw[1]));
    borderLayer.current.load(unpackBits(s.border[0]), unpackBits(s.border[1]));
    repaint();
  };
  /** Call right before any change to the drawing, a drag, a photo swap... (one undo step each). */
  const checkpoint = () => history.current.push(snapshot());
  /** Every doc edit goes through here; bursts of the same kind of edit merge into one undo step. */
  const editDoc = (fn: (d: MessageDoc) => MessageDoc) => {
    const prev = docRef.current, next = fn(prev);
    if (next === prev) return;
    history.current.pushMerged(snapshot(), changeKey(prev, next));
    docRef.current = next;
    setDocState(next);
  };
  /** Live updates during a drag (the drag's start was already checkpointed). */
  const dragDoc = (fn: (d: MessageDoc) => MessageDoc) => { docRef.current = fn(docRef.current); setDocState(docRef.current); };

  // Load an existing message.
  useEffect(() => {
    if (!id) return;
    api.get(id).then(async (m) => {
      const { doc: d, lost } = normalise(m.doc);
      setTitle(m.title);
      docRef.current = d;
      setDocState(d);
      if (m.doc.drawing) drawLayer.current.load(unpackBits(base64ToBytes(m.doc.drawing.black)), unpackBits(base64ToBytes(m.doc.drawing.white)));
      if (lost.length) setNote(`The ${lost.join(" and ")} this message used was deleted; showing the default instead. The saved version is unchanged until you save.`);
      if (m.hasPhoto) {
        const blob = await (await fetch(`/api/messages/${id}/photo`, { credentials: "same-origin" })).blob();
        const b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
        savedPhoto.current = b64;
        setPhoto({ img: await loadImage(URL.createObjectURL(blob)), b64 });
      }
      history.current.clear();
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
    () => renderMessage({ ...doc, drawing: null, invert: false }, photo?.img ?? null, draftTemplate),
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
    const f = layer().float;
    const r = marquee.current ?? f?.to;
    if (!r) return;
    const a = marquee.current ? 0 : (f?.angle ?? 0);
    const k = canvasPerCssPx(c);
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.lineWidth = Math.max(1, 1.5 * k);
    ctx.strokeStyle = "#ff2f8a";
    ctx.setLineDash([4 * k, 3 * k]);
    const [cx, cy] = centre(r);
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!marquee.current) {
      ctx.setLineDash([]);
      const { x: hx, y: hy, from } = rotateHandle(r, a, 18 * k);
      const [, tx, ty] = handlePoints(r, a).find(([h]) => h === from)!;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(hx, hy, 5.5 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff2f8a";
      ctx.beginPath(); ctx.arc(hx, hy, 2 * k, 0, Math.PI * 2); ctx.fill();
      const hs = 9 * k;
      for (const [, x, y] of handlePoints(r, a)) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
        ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
      }
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, showOverlay, tick, doc.invert, editingBorder, toolsActive, tools.tool]);

  const setPhotoLayer = (patch: Partial<PhotoLayer>) => editDoc((d) => ({ ...d, photo: { ...(d.photo ?? DEFAULT_PHOTO), ...patch } }));

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

  // ---- undo/redo & selection actions --------------------------------------------
  const undo = () => {
    const L = layer();
    if (L.float) { L.cancelFloat(); history.current.dropLast(); repaint(); return; } // undo a selection = put it back
    const prev = history.current.undo(snapshot());
    if (prev) restore(prev);
  };
  const redo = () => {
    drawLayer.current.commitFloat();
    borderLayer.current.commitFloat();
    const next = history.current.redo(snapshot());
    if (next) restore(next);
  };
  const applySel = () => { layer().commitFloat(); repaint(); };
  const cancelSel = () => { if (layer().float) { layer().cancelFloat(); history.current.dropLast(); repaint(); } };
  const deleteSel = () => { layer().deleteFloat(); repaint(); };

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo - on every tab. While you're typing in
  // a text box the browser's own undo applies there instead. Enter / Esc / Delete for a selection.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest("textarea, input:not([type=range]):not([type=checkbox]):not([type=file]):not([type=radio])")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && !e.altKey && k === "y") { e.preventDefault(); redo(); return; }
    if (!toolsActive || !layer().float) return;
    if (e.key === "Enter") { e.preventDefault(); applySel(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelSel(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSel(); }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // ---- pointer: draw, shapes, fill, select, move the photo or the text --------------
  const offsets = useMemo(() => brushOffsets(tools.size, tools.shape), [tools.size, tools.shape]);
  /** Run `fn` once per animation frame at most (re-rendering photo/text on every pointer event is wasteful). */
  const perFrame = (fn: () => void) => {
    frame.current.run = fn;
    if (!frame.current.raf) frame.current.raf = requestAnimationFrame(() => { frame.current.raf = 0; frame.current.run?.(); });
  };

  // Pointer handlers sit on the frame around the canvas: at high device pixel ratios the browser
  // hit-tests the last sliver of the edge pixels as the frame, and a finger at the edge should still draw.
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const c = canvasRef.current!;
    const p = toCanvasPx(c, e.clientX, e.clientY);
    const L = layer();
    const k = canvasPerCssPx(c);
    // The rotate handle can sit above the image; everything else must start on the image.
    const f = toolsActive && tools.tool === "select" ? L.float : null;
    const rh = f ? rotateHandle(f.to, f.angle, 18 * k) : null;
    const onRotate = !!rh && Math.hypot(rh.x - p.x, rh.y - p.y) <= 12 * k;
    if (!onRotate && (p.x < 0 || p.y < 0 || p.x >= WIDTH || p.y >= HEIGHT)) return; // on the white frame itself
    const target = e.currentTarget;
    const t = docRef.current.text;
    if (tab === "photo" && photo && docRef.current.photo) {
      target.setPointerCapture(e.pointerId);
      checkpoint();
      const r = photoRect(photo.img.width, photo.img.height, docRef.current.photo);
      drag.current = { kind: "photo", sx: p.x, sy: p.y, panX: r.panX, panY: r.panY };
      return;
    }
    if (tab === "text" && t.content.trim()) {
      target.setPointerCapture(e.pointerId);
      checkpoint();
      drag.current = { kind: "text", sx: p.x, sy: p.y, dx: t.dx ?? 0, dy: t.dy ?? 0 };
      return;
    }
    if (!toolsActive) return;
    target.setPointerCapture(e.pointerId);
    const px = Math.floor(p.x), py = Math.floor(p.y);
    if (tools.tool === "stamp") {
      const s = stampMask(tools.stamp, tools.stampSize);
      if (!s) { setNote("That stamp was deleted; pick another."); return; }
      checkpoint();
      L.stamp(s.mask, s.w, s.h, p.x, p.y);
      repaint();
      return;
    }
    if (tools.tool === "fill") {
      checkpoint();
      L.paintMask(floodRegion(currentBits(), px, py), tools.ink, tools.amount);
      repaint();
      return;
    }
    if (tools.tool === "shape") {
      checkpoint();
      drag.current = { kind: "shape", x0: px, y0: py, moved: false, base: [L.black.slice(), L.white.slice()] };
      return;
    }
    if (tools.tool === "select") {
      if (f) {
        if (onRotate) {
          const [cx, cy] = centre(f.to);
          drag.current = { kind: "rotate", cx, cy, start: Math.atan2(p.y - cy, p.x - cx), angle0: f.angle };
          return;
        }
        const tol = 10 * k;
        const hit = handlePoints(f.to, f.angle).find(([, hx, hy]) => Math.abs(hx - p.x) <= tol && Math.abs(hy - p.y) <= tol);
        if (hit || insideBox(f.to, f.angle, p.x, p.y)) {
          drag.current = { kind: "move", sx: p.x, sy: p.y, orig: { ...f.to }, angle: f.angle, handle: hit ? hit[0] : "move" };
          return;
        }
        L.commitFloat();
      }
      drag.current = { kind: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      marquee.current = null;
      repaint();
      return;
    }
    checkpoint();
    L.dab(px, py, offsets, MODES[tools.tool]!, tools.amount);
    drag.current = { kind: "paint", x: px, y: py };
    repaint();
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvasPx(canvasRef.current!, e.clientX, e.clientY);
    const L = layer();
    if (d.kind === "paint") {
      const px = Math.floor(p.x), py = Math.floor(p.y);
      if (px === d.x && py === d.y) return;
      L.line(d.x, d.y, px, py, offsets, MODES[tools.tool]!, tools.amount);
      d.x = px; d.y = py;
      repaint();
    } else if (d.kind === "shape") {
      let x1 = Math.max(0, Math.min(WIDTH - 1, Math.floor(p.x))), y1 = Math.max(0, Math.min(HEIGHT - 1, Math.floor(p.y)));
      if (e.shiftKey) [x1, y1] = constrain(tools.shapeKind, d.x0, d.y0, x1, y1);
      d.moved ||= x1 !== d.x0 || y1 !== d.y0;
      L.black.set(d.base[0]); L.white.set(d.base[1]);
      L.paintMask(shapeMask(tools.shapeKind, d.x0, d.y0, x1, y1, tools.filled, tools.size), tools.ink, tools.amount);
      repaint();
    } else if (d.kind === "marquee") {
      d.x1 = p.x; d.y1 = p.y;
      marquee.current = normRect(d);
      repaint();
    } else if (d.kind === "move") {
      const f = L.float;
      if (f) { f.to = resized(d.orig, d.angle, d.handle, p.x - d.sx, p.y - d.sy); repaint(); }
    } else if (d.kind === "rotate") {
      const f = L.float;
      if (!f) return;
      let a = d.angle0 + Math.atan2(p.y - d.cy, p.x - d.cx) - d.start;
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      f.angle = a;
      repaint();
    } else if (d.kind === "photo") {
      const panX = Math.round(d.panX + p.x - d.sx), panY = Math.round(d.panY + p.y - d.sy);
      perFrame(() => dragDoc((doc) => ({ ...doc, photo: { ...(doc.photo ?? DEFAULT_PHOTO), panX, panY, offsetX: undefined, offsetY: undefined } })));
    } else {
      const dx = Math.round(d.dx + p.x - d.sx), dy = Math.round(d.dy + p.y - d.sy);
      perFrame(() => dragDoc((doc) => ({ ...doc, text: { ...doc.text, dx, dy } })));
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "marquee") {
      const r = normRect(d);
      marquee.current = null;
      if (Math.abs(d.x1 - d.x0) >= 1 || Math.abs(d.y1 - d.y0) >= 1) {
        checkpoint();
        if (!layer().lift(r)) history.current.dropLast();
      }
      repaint();
    } else if (d?.kind === "shape" && !d.moved) {
      // A click without dragging draws nothing.
      const L = layer();
      L.black.set(d.base[0]); L.white.set(d.base[1]);
      history.current.dropLast();
      repaint();
    }
  };

  // ---- photo ---------------------------------------------------------------
  const pickPhoto = async (file: File) => {
    try {
      const { img, b64 } = await normalisePhoto(file);
      checkpoint();
      setPhoto({ img, b64 });
      dragDoc((d) => ({
        ...d,
        photo: d.photo ? { ...d.photo, panX: 0, panY: 0, offsetX: undefined, offsetY: undefined } : DEFAULT_PHOTO,
        template: d.template === "corner-hearts" ? "none" : d.template,
      }));
    } catch (x) { setNote((x as Error).message); }
  };
  const removePhoto = () => {
    checkpoint();
    setPhoto(null);
    dragDoc((d) => ({ ...d, photo: null }));
  };

  // ---- custom borders --------------------------------------------------------
  const startBorder = () => {
    checkpoint();
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
      checkpoint();
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
      editDoc((d) => ({ ...d, template: uploadRef(info.id) }));
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
    const d = docRef.current, ph = photoRef.current;
    await ensureFont(fontInfo(d.text.font), !!d.text.bold, !!d.text.italic).catch(() => {});
    const fresh = renderMessage({ ...d, drawing: null, invert: false }, ph?.img ?? null);
    const bits = finishBits(fresh.bits, L.black, L.white, !!d.invert);
    const photoNow = ph?.b64 ?? null;
    const body = {
      title: title.trim() || d.text.content.split("\n")[0].slice(0, 60).trim() || "Untitled",
      doc: { ...d, drawing: L.isEmpty() ? null : { black: bytesToBase64(packBits(L.black)), white: bytesToBase64(packBits(L.white)) } },
      bitmap: bytesToBase64(packBits(bits)),
      ...(photoNow !== savedPhoto.current ? { photo: photoNow } : {}), // only send the photo when it changed
    };
    const saved = msgId ? await api.update(msgId, body) : await api.create(body);
    setMsgId(saved.id);
    savedPhoto.current = photoNow;
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
      onClear={() => { checkpoint(); L.clear(); repaint(); }} clearLabel={editingBorder ? "Clear border" : "Clear drawing"}
      floating={!!L.float} onApply={applySel} onCancel={cancelSel} onDelete={deleteSel}
      borderMode={editingBorder} onNote={setNote}
    />
  );

  const movable = (tab === "photo" && photo) || (tab === "text" && doc.text.content.trim());
  const canvasClass = ["epaper", toolsActive ? "drawing" : "", movable ? "movable" : ""].filter(Boolean).join(" ");
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? "⌘" : "Ctrl+";

  return (
    <div className="editor">
      <section className="controls card">
        <input className="title" placeholder="Title (only you see this)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="tabs">
          {(["text", "photo", "draw", "border"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => switchTab(t)}>{TAB_LABELS[t]}</button>
          ))}
        </div>

        {tab === "text" && <TextTab doc={doc} setDoc={editDoc} fontPx={base.fontPx} onNote={setNote} />}
        {tab === "photo" && (
          <PhotoTab doc={doc} hasPhoto={!!photo} setPhotoLayer={setPhotoLayer} onPick={(f) => void pickPhoto(f)} onRemove={removePhoto} />
        )}
        {tab === "draw" && (
          <div className="stack">
            {toolsPanel}
            <p className="muted">Draw directly on the preview.</p>
          </div>
        )}
        {tab === "border" && (
          <BorderTab doc={doc} setTemplate={(t) => editDoc((d) => ({ ...d, template: t }))}
            showOverlay={showOverlay} setShowOverlay={setShowOverlay}
            draft={draft} setDraft={(d) => { setDraft(d); repaint(); }} onStartDraw={startBorder} onUploadPng={(f) => void borderFromImage(f)}
            onSave={() => void saveBorder()} busy={busy} tools={editingBorder ? toolsPanel : null} />
        )}
      </section>

      <section className="preview card">
        <div className="bezel" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className={canvasClass} data-testid="epaper" />
        </div>
        <div className="history-bar">
          <button type="button" disabled={!history.current.canUndo && !L.float} onClick={undo} title={`Undo (${mod}Z)`}>↶ Undo</button>
          <button type="button" disabled={!history.current.canRedo} onClick={redo} title={`Redo (${mod}Shift+Z or ${mod}Y)`}>↷ Redo</button>
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
