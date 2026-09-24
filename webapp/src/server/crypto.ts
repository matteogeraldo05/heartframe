// crypto.ts - the HFE1 envelope (AES-256-GCM), mirrored in firmware/lib/hfcore/src/hf_crypto.cpp.
//
//   [0..3] "HFE1" [4] version=1 [5] kind [6..7] 0 [8..19] nonce | ciphertext | 16-byte tag
//   AAD = bytes 0..19.
//
// Bitmaps use a *deterministic* nonce = HMAC-SHA256(nonceKey, header || plaintext)[:12].
// Identical bitmaps therefore encrypt to identical files (same sha256, same repo path),
// so re-publishing never makes the frame download a message it already has. The nonce
// only repeats when the plaintext is identical, which is safe for GCM. The manifest,
// which changes every publish, uses a random nonce.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { ENVELOPE_HEADER, ENVELOPE_TAG, KIND_BITMAP, KIND_MANIFEST } from "../shared/format.js";

function header(kind: number, nonce: Buffer): Buffer {
  const h = Buffer.alloc(ENVELOPE_HEADER);
  h.write("HFE1", 0, "ascii");
  h[4] = 1;
  h[5] = kind;
  nonce.copy(h, 8);
  return h;
}

function seal(key: Buffer, kind: number, nonce: Buffer, plaintext: Uint8Array): Buffer {
  const h = header(kind, nonce);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(h);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([h, ct, c.getAuthTag()]);
}

function nonceKey(key: Buffer): Buffer {
  return createHmac("sha256", key).update("heartframe nonce key v1").digest();
}

export function sealManifest(key: Buffer, json: string): Buffer {
  return seal(key, KIND_MANIFEST, randomBytes(12), Buffer.from(json, "utf8"));
}

export function sealBitmap(key: Buffer, bitmapFile: Uint8Array): Buffer {
  const mac = createHmac("sha256", nonceKey(key));
  mac.update(Buffer.from([KIND_BITMAP]));
  mac.update(bitmapFile);
  const nonce = mac.digest().subarray(0, 12);
  return seal(key, KIND_BITMAP, nonce, bitmapFile);
}

export function openEnvelope(key: Buffer, env: Uint8Array, kind: number): Buffer {
  const b = Buffer.from(env);
  if (b.length < ENVELOPE_HEADER + ENVELOPE_TAG + 1) throw new Error("envelope too short");
  if (b.toString("ascii", 0, 4) !== "HFE1" || b[4] !== 1 || b[5] !== kind) throw new Error("bad envelope header");
  const h = b.subarray(0, ENVELOPE_HEADER);
  const d = createDecipheriv("aes-256-gcm", key, h.subarray(8, 20));
  d.setAAD(h);
  d.setAuthTag(b.subarray(b.length - ENVELOPE_TAG));
  return Buffer.concat([d.update(b.subarray(ENVELOPE_HEADER, b.length - ENVELOPE_TAG)), d.final()]);
}

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Git's blob id, so we can tell whether a file is already in the repo tree. */
export function gitBlobSha(data: Uint8Array): string {
  return createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
}

// ---- admin password (scrypt) ------------------------------------------------
// Format: scrypt$N$r$p$saltB64$hashB64   (created by scripts/init-secrets.mjs)
export function verifyPassword(stored: string, password: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const got = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}
