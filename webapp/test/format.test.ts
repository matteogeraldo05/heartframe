import { describe, expect, it } from "vitest";

import { BITMAP_FILE_BYTES, makeBitmapFile, packBits, PIXEL_BYTES, unpackBits, WIDTH, HEIGHT, bytesToBase64, base64ToBytes } from "../src/shared/format";
import { adjust, dither, toGray } from "../src/web/render/dither";

describe("bitmap format", () => {
  it("packs MSB-first with 1 = black and round-trips", () => {
    const px = new Uint8Array(WIDTH * HEIGHT);
    px[0] = 1;          // top-left pixel -> bit 7 of byte 0
    px[9] = 1;          // pixel 9 -> byte 1, bit 6
    px[WIDTH] = 1;      // first pixel of row 2 -> byte 50, bit 7
    const packed = packBits(px);
    expect(packed.length).toBe(PIXEL_BYTES);
    expect(packed[0]).toBe(0x80);
    expect(packed[1]).toBe(0x40);
    expect(packed[WIDTH / 8]).toBe(0x80);
    expect(Array.from(unpackBits(packed))).toEqual(Array.from(px));
  });

  it("wraps pixels in the HFB1 header the firmware checks", () => {
    const f = makeBitmapFile(new Uint8Array(PIXEL_BYTES));
    expect(f.length).toBe(BITMAP_FILE_BYTES);
    expect(String.fromCharCode(...f.subarray(0, 4))).toBe("HFB1");
    expect(f[4] | (f[5] << 8)).toBe(400);
    expect(f[6] | (f[7] << 8)).toBe(300);
    expect(f[8]).toBe(1);
  });

  it("base64 helpers round-trip large buffers", () => {
    const b = new Uint8Array(70000).map((_, i) => i * 7);
    expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
  });
});

describe("dithering", () => {
  const w = 64, h = 16;
  const gradient = new Float32Array(w * h).map((_, i) => ((i % w) / (w - 1)) * 255);

  for (const algo of ["atkinson", "floyd", "bayer"] as const) {
    it(`${algo}: dark left, light right, ~half black in the middle`, () => {
      const out = dither(gradient, w, h, algo);
      const col = (x: number) => Array.from({ length: h }, (_, y) => out[y * w + x]).reduce((a, b) => a + b, 0) / h;
      expect(col(0)).toBe(1);        // black
      expect(col(w - 1)).toBe(0);    // white
      const mid = (col(30) + col(31) + col(32) + col(33)) / 4;
      expect(mid).toBeGreaterThan(0.2);
      expect(mid).toBeLessThan(0.8);
    });
  }

  it("threshold and invert behave", () => {
    const g = adjust(new Float32Array([0, 255]), 0, 0, 1, true);
    expect(dither(g, 2, 1, "threshold", 128)).toEqual(new Uint8Array([0, 1]));
  });

  it("toGray composites transparency onto white", () => {
    expect(Array.from(toGray(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255])))).toEqual([255, 0]);
  });
});
