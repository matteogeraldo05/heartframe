// Also writes cross-language test vectors for the firmware's host tests
// (firmware/test_host/vectors), so the C++ decryptor is checked against THIS encryptor.
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { KIND_BITMAP, KIND_MANIFEST, makeBitmapFile, PIXEL_BYTES } from "../src/shared/format";
import { gitBlobSha, openEnvelope, sealBitmap, sealManifest, sha256Hex, verifyPassword } from "../src/server/crypto";
import { scryptSync } from "node:crypto";

const key = Buffer.alloc(32, 7);

describe("HFE1 envelope", () => {
  it("round-trips and binds the kind", () => {
    const env = sealManifest(key, '{"v":1}');
    expect(env.subarray(0, 4).toString()).toBe("HFE1");
    expect(env[5]).toBe(KIND_MANIFEST);
    expect(openEnvelope(key, env, KIND_MANIFEST).toString()).toBe('{"v":1}');
    expect(() => openEnvelope(key, env, KIND_BITMAP)).toThrow();
  });

  it("rejects tampering and wrong keys", () => {
    const env = sealManifest(key, "hello");
    const bad = Buffer.from(env);
    bad[25] ^= 1;
    expect(() => openEnvelope(key, bad, KIND_MANIFEST)).toThrow();
    expect(() => openEnvelope(Buffer.alloc(32, 8), env, KIND_MANIFEST)).toThrow();
  });

  it("encrypts identical bitmaps identically (stable repo paths) and different ones differently", () => {
    const a = makeBitmapFile(new Uint8Array(PIXEL_BYTES).fill(0x0f));
    const b = makeBitmapFile(new Uint8Array(PIXEL_BYTES).fill(0xf0));
    expect(sha256Hex(sealBitmap(key, a))).toBe(sha256Hex(sealBitmap(key, a)));
    expect(sha256Hex(sealBitmap(key, a))).not.toBe(sha256Hex(sealBitmap(key, b)));
    expect(sealBitmap(key, a).subarray(8, 20).equals(sealBitmap(key, b).subarray(8, 20))).toBe(false);
  });

  it("computes git blob ids like git does", () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(gitBlobSha(Buffer.from("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  it("verifies scrypt password hashes", () => {
    const salt = Buffer.alloc(16, 1);
    const h = scryptSync("correct horse", salt, 32, { N: 1024, r: 8, p: 1 });
    const stored = `scrypt$1024$8$1$${salt.toString("base64")}$${h.toString("base64")}`;
    expect(verifyPassword(stored, "correct horse")).toBe(true);
    expect(verifyPassword(stored, "wrong")).toBe(false);
  });

  it("writes vectors for the firmware host tests", () => {
    const dir = path.resolve(__dirname, "../../firmware/test_host/vectors");
    mkdirSync(dir, { recursive: true });
    const pixels = new Uint8Array(PIXEL_BYTES);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31) & 0xff;
    const bmp = makeBitmapFile(pixels);
    const manifest = JSON.stringify({
      v: 1, seq: 1766500000123, gen: 1766500000,
      cfg: { tz: "EST5EDT,M3.2.0,M11.1.0", chk: 60, chkUsb: 15, qs: 1380, qe: 420, led: [255, 8, 72], ledMax: 160, ledMs: 10000, hb: "", hbH: 6 },
      items: [{ id: "abc123", at: 1766664000, sha: "0".repeat(64), len: 15048, s: 1 }],
    });
    writeFileSync(path.join(dir, "key.bin"), key);
    writeFileSync(path.join(dir, "bitmap_plain.bin"), bmp);
    writeFileSync(path.join(dir, "bitmap.hfe"), sealBitmap(key, bmp));
    writeFileSync(path.join(dir, "manifest_plain.json"), manifest);
    writeFileSync(path.join(dir, "manifest.hfe"), sealManifest(key, manifest));
    // ECDSA P-256 over SHA-256, DER signature - same as tools/ota_keys.py produces.
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const fw = Buffer.from("pretend firmware image HFBUILD:2;HFNAME:1.0.1;");
    writeFileSync(path.join(dir, "fw.bin"), fw);
    writeFileSync(path.join(dir, "fw_sig.der"), sign("sha256", fw, privateKey));
    writeFileSync(path.join(dir, "fw_pub.der"), publicKey.export({ type: "spki", format: "der" }));
    writeFileSync(path.join(dir, "fw_sha.hex"), createHash("sha256").update(fw).digest("hex"));
    expect(bmp.length).toBe(15012);
  });
});
