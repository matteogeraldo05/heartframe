// stamps.ts - stamp shapes as 1-bit masks: the built-in heart and your uploaded images.
import { fillHeart } from "../render/shapes";
import { imageMask, uploadedStamp } from "../render/uploads";

export interface StampMask { mask: Uint8Array; w: number; h: number }

const cache = new Map<string, StampMask>();

/** "heart" or an upload id, `size` px on its longest side. null if the upload is gone. */
export function stampMask(id: string, size: number): StampMask | null {
  const key = `${id}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let out: StampMask | null = null;
  if (id === "heart") {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    fillHeart(ctx, size / 2, size / 2 - (size * 4) / 34, size); // heartPath sits ~4 units low; centre it
    const d = ctx.getImageData(0, 0, size, size).data;
    const mask = new Uint8Array(size * size);
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 128 ? 1 : 0;
    out = { mask, w: size, h: size };
  } else {
    const img = uploadedStamp(id)?.img;
    if (!img) return null;
    const k = size / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    out = { mask: imageMask(img, w, h), w, h }; // dark = ink, light and transparent = nothing
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}
