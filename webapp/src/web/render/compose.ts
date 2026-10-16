// compose.ts - MessageDoc (+ photo) -> the exact 1-bit image the frame will show.
// Layers, bottom to top: photo (dithered) -> border template -> text -> signature -> your drawing -> invert.
// Line art and text are thresholded (crisp); only the photo is dithered.
import { HEIGHT, packBits, unpackBits, WIDTH, base64ToBytes } from "../../shared/format";
import type { MessageDoc, PhotoLayer, TextBackground, TextLayer } from "../../shared/types";
import { adjust, dither, sharpen, toGray } from "./dither";
import { cssFont, fontInfo } from "./fonts";
import { layoutText, type Laid } from "./layout";
import { pad, TEMPLATES, type Template } from "./shapes";
import { uploadedBorder } from "./uploads";

/** Built-in template, or a custom border ("upload:<id>"); missing/deleted ones fall back to "No border". */
export function templateFor(id: string): Template {
  const up = uploadedBorder(id);
  if (up) return { id, label: up.info.name, inset: pad(up.info.inset ?? 30), draw() {}, mask: up.mask };
  return TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
}

function canvas(): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = WIDTH;
  c.height = HEIGHT;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return { c, ctx };
}

/** Black ink drawn on a white canvas -> 0/1 mask (1 = black) by 50 % threshold. */
function inkMask(draw: (ctx: CanvasRenderingContext2D) => void): Uint8Array {
  const { ctx } = canvas();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  draw(ctx);
  const d = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const out = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] < 128 ? 1 : 0;
  return out;
}

/** Where the photo lands on the canvas. Older messages stored offsetX/Y (-1..1); newer ones panX/Y in px. */
export function photoRect(iw: number, ih: number, p: PhotoLayer) {
  const base = p.fit === "cover" ? Math.max(WIDTH / iw, HEIGHT / ih) : Math.min(WIDTH / iw, HEIGHT / ih);
  const s = base * p.zoom;
  const dw = iw * s, dh = ih * s;
  const panX = p.panX ?? ((p.offsetX ?? 0) * Math.abs(WIDTH - dw)) / 2;
  const panY = p.panY ?? ((p.offsetY ?? 0) * Math.abs(HEIGHT - dh)) / 2;
  return { dx: (WIDTH - dw) / 2 + panX, dy: (HEIGHT - dh) / 2 + panY, dw, dh, panX, panY };
}

function renderPhoto(img: CanvasImageSource & { width: number; height: number }, p: PhotoLayer): Uint8Array {
  const { ctx } = canvas();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const { dx, dy, dw, dh } = photoRect(img.width, img.height, p);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
  let g = toGray(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  g = adjust(g, p.brightness, p.contrast, p.gamma, p.invert);
  if (p.sharpen) g = sharpen(g, WIDTH, HEIGHT);
  return dither(g, WIDTH, HEIGHT, p.algo, p.threshold);
}

export const textBackground = (t: TextLayer): TextBackground => t.background ?? (t.whiteBehind ? "box" : "none");

export interface RenderResult {
  bits: Uint8Array;     // WIDTH*HEIGHT, 1 = black
  packed: Uint8Array;   // 15000 bytes, what gets uploaded
  fontPx: number;       // chosen size (for the "too small for this font" warning)
}

/** Draws the text block (with bullets, faux bold/italic, underline/strike) in black. */
function textInk(t: TextLayer, laid: Laid, x0: (w: number) => number, y0: number, fauxBold: number) {
  const f = fontInfo(t.font);
  const fauxItalic = !!t.italic && !f.italic;
  return (ctx: CanvasRenderingContext2D, grow = 0) => {
    ctx.font = cssFont(f, laid.px, t.bold, t.italic);
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    // Decide on the number, not ctx.lineWidth: canvas ignores lineWidth = 0 and keeps 1.
    const lw = t.stroke + fauxBold + grow * 2;
    if (lw > 0) ctx.lineWidth = lw;
    // Decorations sit relative to the alphabetic baseline: measure where it is from "middle".
    const x = ctx.measureText("x");
    const toBaseline = x.actualBoundingBoxDescent;
    const xHeight = x.actualBoundingBoxAscent + x.actualBoundingBoxDescent;
    const th = Math.max(2, Math.round(laid.px * 0.06));
    const blockX = x0(laid.width);
    laid.lines.forEach((l, i) => {
      const y = y0 + laid.lineH * (i + 0.5);
      const lx = t.bullets ? blockX + l.indent : x0(l.width);
      if (fauxItalic) ctx.setTransform(1, 0, -0.2, 1, 0.2 * y, 0); // lean right around this line's middle
      if (l.text) {
        ctx.fillText(l.text, lx, y);
        if (lw > 0) ctx.strokeText(l.text, lx, y);
      }
      if (l.bullet) {
        ctx.beginPath();
        ctx.arc(blockX + laid.px * 0.22, y + toBaseline - xHeight / 2, laid.px * 0.11 + grow, 0, Math.PI * 2);
        ctx.fill();
      }
      if (l.text && t.underline) ctx.fillRect(lx - grow, y + toBaseline + th - grow, l.width + grow * 2, th + grow * 2);
      if (l.text && t.strike) ctx.fillRect(lx - grow, y + toBaseline - xHeight / 2 - th / 2 - grow, l.width + grow * 2, th + grow * 2);
      if (fauxItalic) ctx.setTransform(1, 0, 0, 1, 0, 0);
    });
  };
}

/** Everything except your drawing and the invert (the editor adds those live, see finishBits). */
export function renderMessage(
  doc: MessageDoc,
  photo: (CanvasImageSource & { width: number; height: number }) | null,
  tplOverride?: Template, // editor: preview with a border that is still being drawn
): RenderResult {
  const bits: Uint8Array = photo && doc.photo ? renderPhoto(photo, doc.photo) : new Uint8Array(WIDTH * HEIGHT);
  const tpl = tplOverride ?? templateFor(doc.template);
  const or = (m: Uint8Array) => { for (let i = 0; i < bits.length; i++) if (m[i]) bits[i] = 1; };

  if (tpl.mask) or(tpl.mask);
  else if (tpl.id !== "none") or(inkMask((ctx) => tpl.draw(ctx, WIDTH, HEIGHT)));

  let fontPx = 0;
  const t = doc.text;
  if (t.content.trim()) {
    const box = { x: tpl.inset.left, y: tpl.inset.top, w: WIDTH - tpl.inset.left - tpl.inset.right, h: HEIGHT - tpl.inset.top - tpl.inset.bottom };
    const f = fontInfo(t.font);
    const bg = textBackground(t);
    const outline = bg === "outline" ? (t.outline ?? 3) : 0;
    const { ctx: m } = canvas();
    // Faux bold for fonts without a bundled bold: a stroke that scales with the size.
    const fauxBoldAt = (px: number) => (t.bold && !f.bold ? Math.max(1, px / 24) : 0);
    const laid = layoutText(
      (px) => { m.font = cssFont(f, px, t.bold, t.italic); return (s) => m.measureText(s).width; },
      t, box.w - t.stroke * 2 - outline * 2 - (t.bold && !f.bold ? 4 : 0), box.h,
    );
    fontPx = laid.px;
    const blockH = laid.lines.length * laid.lineH;
    let y0 = box.y;
    if (t.valign === "middle") y0 = box.y + (box.h - blockH) / 2;
    if (t.valign === "bottom") y0 = box.y + box.h - blockH;
    // Dragged text: the whole block (and its background) moves; older messages have no dx/dy.
    const dx = t.dx ?? 0;
    y0 += t.dy ?? 0;
    const xFor = (w: number) => dx + (t.align === "left" ? box.x : t.align === "right" ? box.x + box.w - w : box.x + (box.w - w) / 2);
    const clear = (x: number, y: number, w: number, h: number) => {
      const bx = Math.max(0, Math.floor(x)), by = Math.max(0, Math.floor(y));
      const bw = Math.min(WIDTH - bx, Math.ceil(w)), bh = Math.min(HEIGHT - by, Math.ceil(h));
      for (let yy = by; yy < by + bh; yy++) for (let xx = bx; xx < bx + bw; xx++) bits[yy * WIDTH + xx] = 0;
    };

    if (bg === "box") {
      // Clear a box so text stays readable on top of a photo.
      const pad = 8;
      clear(xFor(laid.width) - pad, y0 - pad, laid.width + pad * 2, blockH + pad * 2);
    } else if (bg === "lines") {
      const pad = 6;
      laid.lines.forEach((l, i) => {
        if (!l.text) return;
        const x = t.bullets ? xFor(laid.width) : xFor(l.width);
        const w = t.bullets ? l.indent + l.width : l.width;
        clear(x - pad, y0 + laid.lineH * i - 2, w + pad * 2, laid.lineH + 4);
      });
    }
    const ink = textInk(t, laid, xFor, y0, fauxBoldAt(laid.px));
    if (bg === "outline") {
      // White stroke around the letters: the photo still shows between the words.
      const halo = inkMask((ctx) => ink(ctx, outline));
      for (let i = 0; i < bits.length; i++) if (halo[i]) bits[i] = 0;
    }
    or(inkMask((ctx) => ink(ctx)));
  }

  if (doc.signature.trim()) {
    or(inkMask((ctx) => {
      ctx.font = cssFont(fontInfo("Dancing Script"), 24);
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(doc.signature, WIDTH - tpl.inset.right + 6, HEIGHT - Math.max(10, tpl.inset.bottom - 16));
    }));
  }

  if (doc.drawing) {
    finishBits(bits, unpackBits(base64ToBytes(doc.drawing.black)), unpackBits(base64ToBytes(doc.drawing.white)), false, bits);
  }
  if (doc.invert) for (let i = 0; i < bits.length; i++) bits[i] ^= 1;
  return { bits, packed: packBits(bits), fontPx };
}

/** Your drawing on top of the rendered design, then the optional invert. */
export function finishBits(base: Uint8Array, black: Uint8Array, white: Uint8Array, invert: boolean, out: Uint8Array = base.slice()): Uint8Array {
  for (let i = 0; i < out.length; i++) {
    if (black[i]) out[i] = 1;
    else if (white[i]) out[i] = 0;
    else out[i] = base[i];
    if (invert) out[i] ^= 1;
  }
  return out;
}

/** Paint a 1-bit image on a visible canvas with e-paper-ish colours. */
export function paintEpaper(target: HTMLCanvasElement, bits: Uint8Array, showOverlay: boolean) {
  const ctx = target.getContext("2d")!;
  const img = ctx.createImageData(WIDTH, HEIGHT);
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] ? [38, 38, 42] : [236, 234, 226];
    img.data.set([v[0], v[1], v[2], 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  if (showOverlay) {
    // Where the frame draws its battery indicator.
    ctx.fillStyle = "rgba(255, 64, 129, 0.35)";
    ctx.fillRect(318, 2, 80, 22);
  }
}
