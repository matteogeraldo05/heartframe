// format.ts - the 1-bit bitmap format shared by browser, server and firmware.
// Mirrors firmware/lib/hfcore/src/hf_format.h. Keep the two in sync.
//
// Pixels: 400 x 300, row-major, 8 pixels per byte, most significant bit = leftmost
// pixel, bit value 1 = BLACK. That is exactly what Adafruit GFX drawBitmap() expects.

export const WIDTH = 400;
export const HEIGHT = 300;
export const PIXEL_BYTES = (WIDTH * HEIGHT) / 8; // 15000
export const BITMAP_HEADER = 12;
export const BITMAP_FILE_BYTES = BITMAP_HEADER + PIXEL_BYTES; // 15012

export const ENVELOPE_HEADER = 20; // "HFE1", version, kind, 2 reserved, 12-byte nonce
export const ENVELOPE_TAG = 16;
export const KIND_MANIFEST = 1;
export const KIND_BITMAP = 2;

// Area the firmware draws the battery indicator on (top-right). The editor greys it out.
export const OVERLAY = { x: 318, y: 2, w: 80, h: 22 } as const;

/** Pack a WIDTH*HEIGHT array of 0/1 (1 = black) into 15000 bytes. */
export function packBits(black: Uint8Array): Uint8Array {
  if (black.length !== WIDTH * HEIGHT) throw new Error("wrong pixel count");
  const out = new Uint8Array(PIXEL_BYTES);
  for (let i = 0; i < black.length; i++) {
    if (black[i]) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}

/** Unpack 15000 bytes into WIDTH*HEIGHT values of 0/1 (1 = black). */
export function unpackBits(packed: Uint8Array): Uint8Array {
  if (packed.length !== PIXEL_BYTES) throw new Error("wrong byte count");
  const out = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i < out.length; i++) out[i] = (packed[i >> 3] >> (7 - (i & 7))) & 1;
  return out;
}

/** Wrap packed pixels in the 12-byte HFB1 header the firmware checks. */
export function makeBitmapFile(pixels: Uint8Array): Uint8Array {
  if (pixels.length !== PIXEL_BYTES) throw new Error("wrong byte count");
  const out = new Uint8Array(BITMAP_FILE_BYTES);
  out.set([0x48, 0x46, 0x42, 0x31], 0); // "HFB1"
  out[4] = WIDTH & 0xff;
  out[5] = WIDTH >> 8;
  out[6] = HEIGHT & 0xff;
  out[7] = HEIGHT >> 8;
  out[8] = 1; // 1 bpp
  out.set(pixels, BITMAP_HEADER);
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
