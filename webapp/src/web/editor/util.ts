// util.ts - small browser helpers for the editor: images, files, pointer -> pixel mapping.
import { bytesToBase64, HEIGHT, WIDTH } from "../../shared/format";
import { UPLOAD_MAX_BYTES } from "../../shared/types";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("could not read that image"));
    img.src = src;
  });
}

/** Downscale to <= 1200 px and re-encode as JPEG in the browser (strips EXIF/GPS, HEIC fails here). */
export async function normalisePhoto(file: File): Promise<{ img: HTMLImageElement; b64: string }> {
  const url = URL.createObjectURL(file);
  try {
    const src = await loadImage(url).catch(() => {
      throw new Error("Couldn't read this image. iPhone HEIC photos only open in Safari - export as JPEG or use Safari.");
    });
    const scale = Math.min(1, 1200 / Math.max(src.naturalWidth, src.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(src.naturalWidth * scale);
    c.height = Math.round(src.naturalHeight * scale);
    const ctx = c.getContext("2d")!;
    // JPEG has no transparency: without this, transparent areas of a PNG/GIF/WebP come out black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.88));
    const b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    const img = await loadImage(URL.createObjectURL(blob));
    return { img, b64 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read a file the user picked for upload; checks size and extension (the server re-checks the bytes). */
export async function readUpload(file: File, exts: string[]): Promise<{ b64: string; name: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!exts.includes(ext)) throw new Error(`Choose a ${exts.map((e) => e.toUpperCase()).join(" / ")} file.`);
  if (file.size > UPLOAD_MAX_BYTES) throw new Error("That file is over 2 MB.");
  const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Untitled";
  return { b64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), name };
}

/** A WIDTH x HEIGHT 0/1 mask as a black-on-white PNG (base64), e.g. a custom border. */
export async function maskToPng(mask: Uint8Array): Promise<string> {
  const c = document.createElement("canvas");
  c.width = WIDTH; c.height = HEIGHT;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(WIDTH, HEIGHT);
  for (let i = 0; i < mask.length; i++) { const v = mask[i] ? 0 : 255; img.data.set([v, v, v, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

/**
 * Pointer position -> canvas pixel coordinates (0..WIDTH, 0..HEIGHT, fractional).
 * Uses the canvas's content box (clientLeft/Top, clientWidth/Height), so borders or padding on
 * the element can't skew it, and rescales by rect/offset size so CSS transforms (zoom, scale)
 * are accounted for. The device pixel ratio doesn't matter: everything here is in CSS px.
 */
export function toCanvasPx(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.offsetWidth ? rect.width / canvas.offsetWidth : 1;
  const sy = canvas.offsetHeight ? rect.height / canvas.offsetHeight : 1;
  const x = ((clientX - rect.left - canvas.clientLeft * sx) / (canvas.clientWidth * sx)) * WIDTH;
  const y = ((clientY - rect.top - canvas.clientTop * sy) / (canvas.clientHeight * sy)) * HEIGHT;
  return { x: snapEdge(x, WIDTH), y: snapEdge(y, HEIGHT) };
}

/**
 * A pointer exactly on the canvas's far edge (x = WIDTH) belongs to the last pixel, not to one
 * past it: on a phone a pixel is smaller than a CSS px and touch positions get rounded onto the edge.
 */
const snapEdge = (v: number, max: number) => (v >= max && v < max + 1 ? max - 0.5 : v > -1 && v < 0 ? 0 : v);

/** Canvas px per CSS px (for hit-test tolerances that should feel the same at any size). */
export const canvasPerCssPx = (canvas: HTMLCanvasElement) => WIDTH / Math.max(1, canvas.clientWidth);
