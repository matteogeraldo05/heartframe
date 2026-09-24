// compose.ts - MessageDoc (+ photo) -> the exact 1-bit image the frame will show.
// Layers, bottom to top: photo (dithered) -> border template -> text -> signature -> your drawing.
// Line art and text are thresholded (crisp); only the photo is dithered.
import { HEIGHT, packBits, unpackBits, WIDTH, base64ToBytes } from "../../shared/format";
import type { MessageDoc, TextLayer } from "../../shared/types";
import { adjust, dither, sharpen, toGray } from "./dither";
import { cssFont, fontInfo } from "./fonts";
import { TEMPLATES } from "./shapes";

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

function renderPhoto(img: CanvasImageSource & { width: number; height: number }, p: NonNullable<MessageDoc["photo"]>): Uint8Array {
  const { ctx } = canvas();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const iw = img.width, ih = img.height;
  const base = p.fit === "cover" ? Math.max(WIDTH / iw, HEIGHT / ih) : Math.min(WIDTH / iw, HEIGHT / ih);
  const s = base * p.zoom;
  const dw = iw * s, dh = ih * s;
  const dx = (WIDTH - dw) / 2 + (p.offsetX * Math.abs(WIDTH - dw)) / 2;
  const dy = (HEIGHT - dh) / 2 + (p.offsetY * Math.abs(HEIGHT - dh)) / 2;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
  let g = toGray(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  g = adjust(g, p.brightness, p.contrast, p.gamma, p.invert);
  if (p.sharpen) g = sharpen(g, WIDTH, HEIGHT);
  return dither(g, WIDTH, HEIGHT, p.algo, p.threshold);
}

interface Laid { lines: string[]; px: number; lineH: number; width: number }

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = words[0];
    for (const w of words.slice(1)) {
      if (ctx.measureText(`${line} ${w}`).width <= maxW) line += ` ${w}`;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/** Word-wrap and, when size = 0, find the largest font size that fits the box. */
export function layoutText(ctx: CanvasRenderingContext2D, t: TextLayer, boxW: number, boxH: number): Laid {
  const f = fontInfo(t.font);
  const measure = (px: number): Laid => {
    ctx.font = cssFont(f, px);
    const lines = wrap(ctx, t.content, boxW);
    const width = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    return { lines, px, lineH: px * t.lineHeight, width };
  };
  if (t.size > 0) return measure(t.size);
  let lo = 10, hi = 160, best = measure(lo);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = measure(mid);
    const fits = m.lines.length * m.lineH <= boxH && m.width <= boxW;
    if (fits) { best = m; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

export interface RenderResult {
  bits: Uint8Array;     // WIDTH*HEIGHT, 1 = black
  packed: Uint8Array;   // 15000 bytes, what gets uploaded
  fontPx: number;       // chosen size (for the "too small for this font" warning)
}

export function renderMessage(doc: MessageDoc, photo: (CanvasImageSource & { width: number; height: number }) | null): RenderResult {
  const bits = photo && doc.photo ? renderPhoto(photo, doc.photo) : new Uint8Array(WIDTH * HEIGHT);
  const tpl = TEMPLATES.find((x) => x.id === doc.template) ?? TEMPLATES[0];
  const or = (m: Uint8Array) => { for (let i = 0; i < bits.length; i++) if (m[i]) bits[i] = 1; };

  if (tpl.id !== "none") or(inkMask((ctx) => tpl.draw(ctx, WIDTH, HEIGHT)));

  let fontPx = 0;
  const t = doc.text;
  if (t.content.trim()) {
    const box = { x: tpl.inset.left, y: tpl.inset.top, w: WIDTH - tpl.inset.left - tpl.inset.right, h: HEIGHT - tpl.inset.top - tpl.inset.bottom };
    const { ctx: m } = canvas();
    const laid = layoutText(m, t, box.w - t.stroke * 2, box.h);
    fontPx = laid.px;
    const blockH = laid.lines.length * laid.lineH;
    let y0 = box.y;
    if (t.valign === "middle") y0 = box.y + (box.h - blockH) / 2;
    if (t.valign === "bottom") y0 = box.y + box.h - blockH;
    const xFor = (w: number) => (t.align === "left" ? box.x : t.align === "right" ? box.x + box.w - w : box.x + (box.w - w) / 2);

    if (t.whiteBehind) {
      // Clear a rounded box so text stays readable on top of a photo.
      const pad = 8;
      const bx = Math.max(0, Math.floor(xFor(laid.width) - pad)), by = Math.max(0, Math.floor(y0 - pad));
      const bw = Math.min(WIDTH - bx, Math.ceil(laid.width + pad * 2)), bh = Math.min(HEIGHT - by, Math.ceil(blockH + pad * 2));
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) bits[y * WIDTH + x] = 0;
    }
    or(inkMask((ctx) => {
      const f = fontInfo(t.font);
      ctx.font = cssFont(f, laid.px);
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = t.stroke;
      laid.lines.forEach((line, i) => {
        const w = ctx.measureText(line).width;
        const x = xFor(w), y = y0 + laid.lineH * (i + 0.5);
        ctx.fillText(line, x, y);
        if (t.stroke > 0) ctx.strokeText(line, x, y);
      });
    }));
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
    const black = unpackBits(base64ToBytes(doc.drawing.black));
    const white = unpackBits(base64ToBytes(doc.drawing.white));
    for (let i = 0; i < bits.length; i++) {
      if (black[i]) bits[i] = 1;
      else if (white[i]) bits[i] = 0;
    }
  }
  return { bits, packed: packBits(bits), fontPx };
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
