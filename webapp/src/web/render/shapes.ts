// shapes.ts - hearts and border templates, drawn with Canvas 2D in black.
// Everything is thresholded to 1 bit afterwards, so keep strokes >= 2 px.

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
}

const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

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
      const step = 25;
      for (let x = 14; x <= w - 14; x += step) {
        if (x < 310) fillHeart(ctx, x, 13, 13); // leave the battery indicator's corner clear
        fillHeart(ctx, x, h - 11, 13);
      }
      for (let y = 14 + step; y <= h - 14 - step; y += step) { fillHeart(ctx, 12, y, 13); fillHeart(ctx, w - 12, y, 13); }
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
      const r = 10;
      ctx.beginPath();
      for (let x = r + 4; x < w - r; x += 2 * r) { ctx.moveTo(x + r, 14); ctx.arc(x, 14, r, 0, Math.PI, true); }
      for (let x = r + 4; x < w - r; x += 2 * r) { ctx.moveTo(x - r, h - 14); ctx.arc(x, h - 14, r, Math.PI, 0, true); }
      ctx.stroke();
      roundRect(ctx, 14, 14, w - 28, h - 28, 4, 2);
    },
  },
];
