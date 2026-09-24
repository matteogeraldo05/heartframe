// dither.ts - photo -> 1-bit for e-paper. Pure functions on typed arrays (unit tested).
// Grey values are 0 (black) .. 255 (white). Output arrays use 1 = black.
import type { DitherAlgo } from "../../shared/types";

/** sRGB luma of RGBA pixels (alpha composited onto white). */
export function toGray(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const y = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
    out[i] = y * a + 255 * (1 - a);
  }
  return out;
}

/** Brightness/contrast in -100..100, gamma 0.3..3 (>1 = brighter mid-tones). */
export function adjust(g: Float32Array, brightness: number, contrast: number, gamma: number, invert: boolean): Float32Array {
  const out = new Float32Array(g.length);
  const c = (100 + contrast) / 100;
  const cf = c * c; // gentle curve, 0 = unchanged
  for (let i = 0; i < g.length; i++) {
    let v = g[i] / 255;
    v = Math.pow(Math.min(1, Math.max(0, v)), 1 / gamma);
    v = (v - 0.5) * cf + 0.5 + brightness / 200;
    v = Math.min(1, Math.max(0, v));
    out[i] = (invert ? 1 - v : v) * 255;
  }
  return out;
}

/** Light 3x3 unsharp mask: e-paper photos look much crisper with it. */
export function sharpen(g: Float32Array, w: number, h: number, amount = 0.6): Float32Array {
  const out = new Float32Array(g.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) { sum += g[yy * w + xx]; n++; }
        }
      }
      const i = y * w + x;
      out[i] = Math.min(255, Math.max(0, g[i] + amount * (g[i] - sum / n)));
    }
  }
  return out;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function dither(gray: Float32Array, w: number, h: number, algo: DitherAlgo, threshold = 128): Uint8Array {
  const out = new Uint8Array(w * h);
  if (algo === "threshold") {
    for (let i = 0; i < out.length; i++) out[i] = gray[i] < threshold ? 1 : 0;
    return out;
  }
  if (algo === "bayer") {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const t = ((BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16) * 255;
        out[y * w + x] = gray[y * w + x] < t ? 1 : 0;
      }
    return out;
  }
  const g = Float32Array.from(gray);
  const push = (x: number, y: number, e: number) => {
    if (x >= 0 && x < w && y < h) g[y * w + x] += e;
  };
  for (let y = 0; y < h; y++) {
    // Serpentine scan avoids the diagonal "worm" artefacts of plain left-to-right.
    const ltr = algo === "atkinson" || y % 2 === 0;
    for (let k = 0; k < w; k++) {
      const x = ltr ? k : w - 1 - k;
      const d = ltr ? 1 : -1;
      const i = y * w + x;
      const old = g[i];
      const nv = old < 128 ? 0 : 255;
      out[i] = nv === 0 ? 1 : 0;
      const err = old - nv;
      if (algo === "atkinson") {
        // Atkinson (classic Mac): spreads only 3/4 of the error -> punchier contrast,
        // which suits the stark black/white of e-paper.
        const e = err / 8;
        push(x + 1, y, e); push(x + 2, y, e);
        push(x - 1, y + 1, e); push(x, y + 1, e); push(x + 1, y + 1, e);
        push(x, y + 2, e);
      } else {
        push(x + d, y, (err * 7) / 16);
        push(x - d, y + 1, (err * 3) / 16);
        push(x, y + 1, (err * 5) / 16);
        push(x + d, y + 1, (err * 1) / 16);
      }
    }
  }
  return out;
}
