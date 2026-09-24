// png.ts - encode our 1-bit bitmap as a tiny 1-bit greyscale PNG for thumbnails.
// The server never decodes images; it only ENCODES data it produced/validated itself.
import { crc32, deflateSync } from "node:zlib";

import { HEIGHT, PIXEL_BYTES, WIDTH } from "../shared/format.js";

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

export function bitmapToPng(pixels: Uint8Array): Buffer {
  if (pixels.length !== PIXEL_BYTES) throw new Error("bad bitmap");
  const rowBytes = WIDTH / 8;
  const raw = Buffer.alloc(HEIGHT * (rowBytes + 1));
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter: none
    for (let x = 0; x < rowBytes; x++) {
      // our 1 = black; PNG greyscale 1 = white -> invert
      raw[y * (rowBytes + 1) + 1 + x] = ~pixels[y * rowBytes + x] & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
