// layer.ts - the editable 1-bit drawing layer: brushes, shapes, bucket fill and a floating
// selection (marquee + move + nearest-neighbour resize + rotate). Pure typed-array code, unit
// tested. Undo/redo lives in the editor (editor/history.ts) so it covers the whole message.
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

// ---- shapes -------------------------------------------------------------------

export type ShapeKind = "ellipse" | "rect" | "line" | "star" | "triangle";

/** Pixels of a line `width` px thick (round ends) from one pixel to another, into `mask`. */
function strokeLine(mask: Uint8Array, x0: number, y0: number, x1: number, y1: number, width: number) {
  const offs = brushOffsets(width, "circle");
  const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps), y = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (const [dx, dy] of offs) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < WIDTH && Y < HEIGHT) mask[Y * WIDTH + X] = 1;
    }
  }
}

/** Even-odd point-in-polygon. */
function inside(poly: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Corners of a triangle / 5-point star filling the box [l, r] x [t, b] (continuous px); `flip` = point down. */
function polygon(kind: "star" | "triangle", l: number, t: number, r: number, b: number, flip: boolean): [number, number][] {
  let pts: [number, number][];
  if (kind === "triangle") pts = [[0.5, 0], [1, 1], [0, 1]];
  else {
    const raw: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? 0.382 : 1;
      raw.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    pts = raw.map(([x, y]) => [(x - x0) / (x1 - x0), (y - y0) / (y1 - y0)]);
  }
  return pts.map(([u, v]) => [l + u * (r - l), t + (flip ? 1 - v : v) * (b - t)]);
}

/**
 * A shape dragged from pixel (x0, y0) to pixel (x1, y1), as a WIDTH x HEIGHT 0/1 mask.
 * The two points are opposite corners of its box (for a line: its ends). Outlines are `width` px.
 */
export function shapeMask(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number, filled: boolean, width: number): Uint8Array {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const w = Math.max(1, Math.round(width));
  if (kind === "line") { strokeLine(mask, x0, y0, x1, y1, w); return mask; }
  const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
  const set = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) mask[y * WIDTH + x] = 1; };
  if (kind === "rect") {
    for (let y = t; y <= b; y++)
      for (let x = l; x <= r; x++)
        if (filled || x - l < w || r - x < w || y - t < w || b - y < w) set(x, y);
    return mask;
  }
  if (kind === "ellipse") {
    const cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2 + 0.5, ry = (b - t) / 2 + 0.5;
    const irx = rx - w, iry = ry - w;
    for (let y = t; y <= b; y++)
      for (let x = l; x <= r; x++) {
        const dx = x - cx, dy = y - cy;
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
        if (filled || irx <= 0 || iry <= 0 || (dx / irx) ** 2 + (dy / iry) ** 2 > 1) set(x, y);
      }
    return mask;
  }
  // Triangle / star: pointing up, or down when dragged upwards.
  const poly = polygon(kind, l, t, r + 1, b + 1, y1 < y0);
  if (filled) {
    for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) if (inside(poly, x + 0.5, y + 0.5)) set(x, y);
  } else {
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      strokeLine(mask, Math.min(r, Math.floor(ax)), Math.min(b, Math.floor(ay)), Math.min(r, Math.floor(bx)), Math.min(b, Math.floor(by)), w);
    }
  }
  return mask;
}

// ---- bucket fill ----------------------------------------------------------------

/** The 4-connected area of same-coloured pixels around (x, y) in a WIDTH x HEIGHT 0/1 image. */
export function floodRegion(bits: Uint8Array, x: number, y: number): Uint8Array {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return mask;
  const target = bits[y * WIDTH + x];
  const stack = [y * WIDTH + x];
  mask[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const px = i % WIDTH;
    for (const j of [px > 0 ? i - 1 : -1, px < WIDTH - 1 ? i + 1 : -1, i - WIDTH, i + WIDTH]) {
      if (j >= 0 && j < bits.length && !mask[j] && bits[j] === target) { mask[j] = 1; stack.push(j); }
    }
  }
  return mask;
}

// ---- the layer ------------------------------------------------------------------

export interface Rect { x: number; y: number; w: number; h: number }

export interface Floating {
  from: Rect;                        // where the pixels were lifted from
  to: Rect;                          // where they are now (moved / resized), before rotation
  angle: number;                     // radians, clockwise, around the centre of `to`
  black: Uint8Array; white: Uint8Array; // from.w x from.h
}

/** Floating pixels as they land on the canvas: a w x h buffer whose top-left is at (x, y). */
export interface Placed { x: number; y: number; w: number; h: number; black: Uint8Array; white: Uint8Array }

export class Layer {
  black: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  white: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  float: Floating | null = null;

  load(black: Uint8Array, white: Uint8Array) {
    this.black = black; this.white = white; this.float = null;
  }

  clear() { this.float = null; this.black.fill(0); this.white.fill(0); }
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

  /** Paint every pixel of a WIDTH x HEIGHT mask (shapes, bucket fill). */
  paintMask(mask: Uint8Array, mode: PaintMode, amount?: number) {
    for (let i = 0; i < mask.length; i++) if (mask[i]) this.set(i % WIDTH, (i / WIDTH) | 0, mode, amount);
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
    const black = new Uint8Array(w * h), white = new Uint8Array(w * h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = (y + yy) * WIDTH + x + xx;
        black[yy * w + xx] = this.black[i]; white[yy * w + xx] = this.white[i];
        this.black[i] = 0; this.white[i] = 0;
      }
    const rect = { x, y, w, h };
    this.float = { from: rect, to: { ...rect }, angle: 0, black, white };
    return true;
  }

  /**
   * Floating pixels scaled to their box and rotated around its centre (nearest neighbour, so it
   * stays crisp). Each canvas pixel looks up the source pixel under its centre.
   */
  floatPixels(): Placed | null {
    const f = this.float;
    if (!f) return null;
    const to = { w: Math.max(1, Math.round(f.to.w)), h: Math.max(1, Math.round(f.to.h)), x: Math.round(f.to.x), y: Math.round(f.to.y) };
    const cx = to.x + to.w / 2, cy = to.y + to.h / 2;
    const cos = Math.cos(f.angle), sin = Math.sin(f.angle);
    // Bounding box of the rotated rectangle.
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [cx + (u * to.w * cos) / 2 - (v * to.h * sin) / 2, cy + (u * to.w * sin) / 2 + (v * to.h * cos) / 2]);
    const x0 = Math.floor(Math.min(...corners.map((c) => c[0])) + 1e-9), x1 = Math.ceil(Math.max(...corners.map((c) => c[0])) - 1e-9);
    const y0 = Math.floor(Math.min(...corners.map((c) => c[1])) + 1e-9), y1 = Math.ceil(Math.max(...corners.map((c) => c[1])) - 1e-9);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const black = new Uint8Array(w * h), white = new Uint8Array(w * h);
    const sw = f.from.w, sh = f.from.h;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = x0 + x + 0.5 - cx, dy = y0 + y + 0.5 - cy;
        const lx = dx * cos + dy * sin + to.w / 2, ly = -dx * sin + dy * cos + to.h / 2; // back into the unrotated box
        if (lx < 0 || ly < 0 || lx >= to.w || ly >= to.h) continue;
        const s = Math.min(sh - 1, Math.floor((ly * sh) / to.h)) * sw + Math.min(sw - 1, Math.floor((lx * sw) / to.w));
        black[y * w + x] = f.black[s]; white[y * w + x] = f.white[s];
      }
    return { x: x0, y: y0, w, h, black, white };
  }

  private place(p: Placed, black: Uint8Array, white: Uint8Array) {
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const X = p.x + x, Y = p.y + y;
        if (X < 0 || Y < 0 || X >= WIDTH || Y >= HEIGHT) continue;
        const j = y * p.w + x, i = Y * WIDTH + X;
        if (p.black[j]) { black[i] = 1; white[i] = 0; } else if (p.white[j]) { black[i] = 0; white[i] = 1; }
      }
  }

  /** Drop the selection where it is now. Transparent pixels in it don't overwrite what's below. */
  commitFloat() {
    const p = this.floatPixels();
    if (!p) return;
    this.float = null;
    this.place(p, this.black, this.white);
  }

  /** Put the lifted pixels back exactly where they came from (Esc). */
  cancelFloat() {
    const f = this.float;
    if (!f) return;
    this.float = null;
    for (let y = 0; y < f.from.h; y++)
      for (let x = 0; x < f.from.w; x++) {
        const i = (f.from.y + y) * WIDTH + f.from.x + x;
        this.black[i] = f.black[y * f.from.w + x]; this.white[i] = f.white[y * f.from.w + x];
      }
  }

  /** Delete the floating pixels (the area stays cleared). */
  deleteFloat() { this.float = null; }

  /** The layer as it looks right now, including a floating selection. */
  composite(): { black: Uint8Array; white: Uint8Array } {
    const p = this.floatPixels();
    if (!p) return { black: this.black, white: this.white };
    const black = this.black.slice(), white = this.white.slice();
    this.place(p, black, white);
    return { black, white };
  }
}
