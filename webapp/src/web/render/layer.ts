// layer.ts - the editable 1-bit drawing layer: brushes, undo/redo and a floating selection
// (marquee + move + nearest-neighbour resize). Pure typed-array code, unit tested.
import { HEIGHT, WIDTH } from "../../shared/format";
import { BAYER8 } from "./dither";

export type BrushShape = "square" | "circle";
/** black/white paint; erase = back to transparent (shows the design underneath); dither = pattern. */
export type PaintMode = "black" | "white" | "erase" | "dither";

/**
 * Pixel offsets covered by a brush of `size` px. Size 1 = exactly one pixel; a square of size N
 * covers N x N pixels, a circle the pixels whose centres fall inside a disc N px across.
 */
export function brushOffsets(size: number, shape: BrushShape): [number, number][] {
  const n = Math.max(1, Math.round(size));
  const lo = 0 - Math.floor((n - 1) / 2);
  const c = (n - 1) / 2 + lo; // disc centre relative to the anchor pixel (0 or 0.5)
  const out: [number, number][] = [];
  for (let dy = lo; dy < lo + n; dy++)
    for (let dx = lo; dx < lo + n; dx++)
      if (shape === "square" || (dx - c) ** 2 + (dy - c) ** 2 <= (n / 2) ** 2) out.push([dx, dy]);
  return out;
}

/** Dither pen: is pixel (x, y) inked at this density (0..64 of the 8x8 cells)? Fixed to the canvas grid. */
export const ditherOn = (x: number, y: number, amount: number) => BAYER8[(y & 7) * 8 + (x & 7)] < amount;

/** Nearest-neighbour scale of a w x h 0/1 buffer: stays crisp at 1 bit. */
export function scaleNearest(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x++) out[y * dw + x] = src[sy * sw + Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw))];
  }
  return out;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface Floating {
  from: Rect;                        // where the pixels were lifted from
  to: Rect;                          // where they are now (moved / resized)
  black: Uint8Array; white: Uint8Array; // from.w x from.h
}

interface Snap { b: Uint8Array; w: Uint8Array }

export class Layer {
  black: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  white: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  float: Floating | null = null;
  private undos: Snap[] = [];
  private redos: Snap[] = [];

  load(black: Uint8Array, white: Uint8Array) {
    this.black = black; this.white = white; this.float = null; this.undos = []; this.redos = [];
  }

  /** Call before every change (start of a stroke, a stamp, a lift...). */
  checkpoint() {
    this.undos.push({ b: this.black.slice(), w: this.white.slice() });
    if (this.undos.length > 40) this.undos.shift();
    this.redos = [];
  }
  get canUndo() { return this.undos.length > 0 || !!this.float; }
  get canRedo() { return this.redos.length > 0; }
  undo(): boolean {
    if (this.float) { this.cancelFloat(); return true; }
    const s = this.undos.pop();
    if (!s) return false;
    this.redos.push({ b: this.black, w: this.white });
    this.black = s.b; this.white = s.w;
    return true;
  }
  redo(): boolean {
    this.commitFloat();
    const s = this.redos.pop();
    if (!s) return false;
    this.undos.push({ b: this.black, w: this.white });
    this.black = s.b; this.white = s.w;
    return true;
  }
  clear() { this.commitFloat(); this.checkpoint(); this.black.fill(0); this.white.fill(0); }
  isEmpty() { return !this.float && !this.black.some((v) => v) && !this.white.some((v) => v); }

  set(x: number, y: number, mode: PaintMode, amount = 32) {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const i = y * WIDTH + x;
    const ink = mode === "black" || (mode === "dither" && ditherOn(x, y, amount));
    this.black[i] = ink ? 1 : 0;
    this.white[i] = !ink && (mode === "white" || mode === "dither") ? 1 : 0;
  }

  dab(px: number, py: number, offsets: [number, number][], mode: PaintMode, amount?: number) {
    for (const [dx, dy] of offsets) this.set(px + dx, py + dy, mode, amount);
  }

  /** Paint a straight line of dabs from one pixel to another (no gaps when the pointer moves fast). */
  line(x0: number, y0: number, x1: number, y1: number, offsets: [number, number][], mode: PaintMode, amount?: number) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 1; s <= steps; s++) this.dab(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), offsets, mode, amount);
  }

  /** Stamp black pixels of a w x h mask centred on (cx, cy). */
  stamp(mask: Uint8Array, w: number, h: number, cx: number, cy: number) {
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) this.set(x0 + x, y0 + y, "black");
  }

  // ---- selection ---------------------------------------------------------
  /** Lift a rectangle off the layer into a floating selection (the area left behind is transparent). */
  lift(r: Rect): boolean {
    this.commitFloat();
    const x = Math.max(0, r.x), y = Math.max(0, r.y);
    const w = Math.min(WIDTH, r.x + r.w) - x, h = Math.min(HEIGHT, r.y + r.h) - y;
    if (w < 1 || h < 1) return false;
    this.checkpoint();
    const black = new Uint8Array(w * h), white = new Uint8Array(w * h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = (y + yy) * WIDTH + x + xx;
        black[yy * w + xx] = this.black[i]; white[yy * w + xx] = this.white[i];
        this.black[i] = 0; this.white[i] = 0;
      }
    const rect = { x, y, w, h };
    this.float = { from: rect, to: { ...rect }, black, white };
    return true;
  }

  /** Floating pixels scaled to their current box. */
  floatPixels(): { black: Uint8Array; white: Uint8Array; to: Rect } | null {
    const f = this.float;
    if (!f) return null;
    const to = { ...f.to, w: Math.max(1, Math.round(f.to.w)), h: Math.max(1, Math.round(f.to.h)), x: Math.round(f.to.x), y: Math.round(f.to.y) };
    return { to, black: scaleNearest(f.black, f.from.w, f.from.h, to.w, to.h), white: scaleNearest(f.white, f.from.w, f.from.h, to.w, to.h) };
  }

  /** Drop the selection where it is now. Transparent pixels in it don't overwrite what's below. */
  commitFloat() {
    const p = this.floatPixels();
    if (!p) return;
    this.float = null;
    for (let y = 0; y < p.to.h; y++)
      for (let x = 0; x < p.to.w; x++) {
        const X = p.to.x + x, Y = p.to.y + y;
        if (X < 0 || Y < 0 || X >= WIDTH || Y >= HEIGHT) continue;
        const j = y * p.to.w + x, i = Y * WIDTH + X;
        if (p.black[j]) { this.black[i] = 1; this.white[i] = 0; } else if (p.white[j]) { this.black[i] = 0; this.white[i] = 1; }
      }
  }

  /** Put the lifted pixels back where they came from (Esc). */
  cancelFloat() {
    if (!this.float) return;
    this.float = null;
    const s = this.undos.pop();
    if (s) { this.black = s.b; this.white = s.w; }
  }

  /** Delete the floating pixels (the area stays cleared). */
  deleteFloat() { this.float = null; }

  /** The layer as it looks right now, including a floating selection. */
  composite(): { black: Uint8Array; white: Uint8Array } {
    const p = this.floatPixels();
    if (!p) return { black: this.black, white: this.white };
    const black = this.black.slice(), white = this.white.slice();
    for (let y = 0; y < p.to.h; y++)
      for (let x = 0; x < p.to.w; x++) {
        const X = p.to.x + x, Y = p.to.y + y;
        if (X < 0 || Y < 0 || X >= WIDTH || Y >= HEIGHT) continue;
        const j = y * p.to.w + x, i = Y * WIDTH + X;
        if (p.black[j]) { black[i] = 1; white[i] = 0; } else if (p.white[j]) { black[i] = 0; white[i] = 1; }
      }
    return { black, white };
  }
}
