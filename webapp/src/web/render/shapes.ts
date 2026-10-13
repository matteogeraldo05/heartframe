// shapes.ts - hearts and border templates, drawn with Canvas 2D in black.
// Everything is thresholded to 1 bit afterwards, so keep strokes >= 2 px.
// Positions are computed by pure functions (heartBorder, scallopArcs) so they're unit tested.
import { OVERLAY } from "../../shared/format";

/** Classic parametric heart centred on (cx, cy), `size` = total width in px. */
export function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 34; // the curve is 32 units wide; /34 leaves ~6 % breathing room inside `size`
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const px = cx + x * s, py = cy - y * s - s * 2;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function fillHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  heartPath(ctx, cx, cy, size);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, lw: number) {
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

export interface Template {
  id: string;
  label: string;
  inset: { top: number; right: number; bottom: number; left: number }; // text box margins
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  mask?: Uint8Array;     // custom (uploaded) borders: ready-made 1-bit image instead of draw()
}

export const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

/** n+1 evenly spaced values from a to b inclusive, with n = gaps closest to `step` apart. */
export function spaced(a: number, b: number, step: number): number[] {
  const n = Math.max(1, Math.round((b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

export interface HeartSpot { x: number; y: number; edges: ("top" | "bottom" | "left" | "right")[] }

/**
 * "Border of little hearts": evenly spaced along each edge, a heart on every corner,
 * except where the firmware draws the battery indicator (top-right, OVERLAY).
 */
export function heartBorder(w: number, h: number, size = 13): HeartSpot[] {
  const m = 14, top = 13, bottom = h - 11;
  const xs = spaced(m, w - m, 25), ys = spaced(top, bottom, 25);
  const spots: HeartSpot[] = [];
  for (const x of xs) {
    const corner = (x === xs[0] ? ["left"] : x === xs[xs.length - 1] ? ["right"] : []) as HeartSpot["edges"];
    spots.push({ x, y: top, edges: ["top", ...corner] }, { x, y: bottom, edges: ["bottom", ...corner] });
  }
  for (const y of ys.slice(1, -1)) spots.push({ x: m, y, edges: ["left"] }, { x: w - m, y, edges: ["right"] });
  // A heart of width `size` spans about +-size/2 sideways and -size*0.2 .. +size*0.45 vertically (heartPath).
  const r = size / 2 + 1;
  const hitsOverlay = (p: HeartSpot) =>
    p.x + r > OVERLAY.x && p.x - r < OVERLAY.x + OVERLAY.w && p.y - r < OVERLAY.y + OVERLAY.h && p.y + r > OVERLAY.y;
  return spots.filter((p) => !hitsOverlay(p));
}

export interface Arc { cx: number; cy: number; r: number; start: number; end: number; ccw: boolean }

/** "Scalloped edge": half circles bulging outwards on all four sides, meeting exactly at the corners. */
export function scallopArcs(w: number, h: number, inset = 14, target = 10): Arc[] {
  const arcs: Arc[] = [];
  const along = (len: number) => { const n = Math.max(1, Math.round(len / (2 * target))); return { n, r: len / (2 * n) }; };
  const hz = along(w - 2 * inset), vt = along(h - 2 * inset);
  for (let i = 0; i < hz.n; i++) {
    const cx = inset + hz.r * (2 * i + 1);
    arcs.push({ cx, cy: inset, r: hz.r, start: 0, end: Math.PI, ccw: true });              // top, bulging up
    arcs.push({ cx, cy: h - inset, r: hz.r, start: Math.PI, end: 0, ccw: true });          // bottom, bulging down
  }
  for (let i = 0; i < vt.n; i++) {
    const cy = inset + vt.r * (2 * i + 1);
    arcs.push({ cx: inset, cy, r: vt.r, start: Math.PI / 2, end: -Math.PI / 2, ccw: false }); // left, bulging left
    arcs.push({ cx: w - inset, cy, r: vt.r, start: -Math.PI / 2, end: Math.PI / 2, ccw: false }); // right, bulging right
  }
  return arcs;
}

export const TEMPLATES: Template[] = [
  { id: "none", label: "No border", inset: pad(18), draw() {} },
  {
    id: "simple", label: "Rounded border", inset: pad(26),
    draw(ctx, w, h) { roundRect(ctx, 8, 8, w - 16, h - 16, 18, 3); },
  },
  {
    id: "double", label: "Double border", inset: pad(30),
    draw(ctx, w, h) { roundRect(ctx, 6, 6, w - 12, h - 12, 20, 3); roundRect(ctx, 14, 14, w - 28, h - 28, 14, 1.6); },
  },
  {
    id: "corner-hearts", label: "Hearts in the corners", inset: { top: 34, right: 44, bottom: 30, left: 44 },
    draw(ctx, w, h) {
      roundRect(ctx, 10, 10, w - 20, h - 20, 16, 2);
      // top-right heart sits below the battery indicator (OVERLAY, y <= 24)
      for (const [x, y] of [[28, 30], [w - 28, 42], [28, h - 26], [w - 28, h - 26]]) fillHeart(ctx, x, y, 26);
    },
  },
  {
    id: "heart-border", label: "Border of little hearts", inset: pad(34),
    draw(ctx, w, h) {
      for (const p of heartBorder(w, h, 13)) fillHeart(ctx, p.x, p.y, 13);
    },
  },
  {
    id: "big-heart", label: "Big heart outline", inset: { top: 76, right: 118, bottom: 86, left: 118 },
    draw(ctx, w, h) {
      ctx.lineWidth = 4;
      heartPath(ctx, w / 2, h / 2 + 10, 300);
      ctx.stroke();
    },
  },
  {
    id: "scallop", label: "Scalloped edge", inset: pad(34),
    draw(ctx, w, h) {
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const a of scallopArcs(w, h)) {
        ctx.moveTo(a.cx + a.r * Math.cos(a.start), a.cy + a.r * Math.sin(a.start));
        ctx.arc(a.cx, a.cy, a.r, a.start, a.end, a.ccw);
      }
      ctx.stroke();
      roundRect(ctx, 14, 14, w - 28, h - 28, 0, 2);
    },
  },
];
