// uploads.ts - your uploaded fonts, stamps and borders, ready for synchronous rendering.
// Fonts are registered with the FontFace API; borders are decoded once into 1-bit masks.
import { useSyncExternalStore } from "react";

import { HEIGHT, WIDTH } from "../../shared/format";
import { uploadRef, type UploadInfo } from "../../shared/types";
import { api } from "../api";
import type { FontInfo } from "./fonts";

export interface UploadEntry {
  info: UploadInfo;
  url: string;
  font?: FontInfo;              // fonts
  img?: HTMLImageElement;       // stamps
  mask?: Uint8Array;            // borders: WIDTH*HEIGHT, 1 = black
  broken?: boolean;             // file failed to load (corrupt font/image)
}

let entries = new Map<string, UploadEntry>();
let version = 0;
const listeners = new Set<() => void>();
const changed = () => { version++; listeners.forEach((l) => l()); };

export const fileUrl = (id: string) => `/api/uploads/${id}/file`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("could not read that image"));
    img.src = src;
  });
}

/** 1-bit mask of an image stretched to w x h: luminance < 50 % = black, transparency = white. */
export function imageMask(img: CanvasImageSource, w: number, h: number): Uint8Array {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2] < 128 ? 1 : 0;
  return out;
}

async function prepare(info: UploadInfo): Promise<UploadEntry> {
  const e: UploadEntry = { info, url: fileUrl(info.id) };
  try {
    if (info.kind === "font") {
      const family = `HF Upload ${info.id}`;
      const buf = await (await fetch(e.url, { credentials: "same-origin" })).arrayBuffer();
      const face = new FontFace(family, buf);
      await face.load();
      document.fonts.add(face);
      e.font = { family, label: info.name, weight: 400, minPx: 16, group: "uploaded", ref: uploadRef(info.id) };
    } else {
      e.img = await loadImage(e.url);
      if (info.kind === "border") e.mask = imageMask(e.img, WIDTH, HEIGHT);
    }
  } catch {
    e.broken = true;
  }
  return e;
}

/** Fetch the list and load anything new. Safe to call again after an upload or delete. */
export async function loadUploads(): Promise<void> {
  const list = await api.uploads();
  const next = new Map<string, UploadEntry>();
  await Promise.all(list.map(async (info) => {
    const old = entries.get(info.id);
    next.set(info.id, old && !old.broken ? { ...old, info } : await prepare(info));
  }));
  entries = next;
  changed();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Changes whenever the set of uploads changes (use as a memo dependency). */
export function useUploadsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

export function useUploads(): UploadEntry[] {
  useUploadsVersion();
  return [...entries.values()];
}

const byRef = (ref: string) => (ref.startsWith("upload:") ? entries.get(ref.slice(7)) : undefined);

export function uploadedFont(ref: string): FontInfo | undefined { return byRef(ref)?.font; }
export function uploadedBorder(ref: string): UploadEntry | undefined { const e = byRef(ref); return e?.mask ? e : undefined; }
export function uploadedStamp(id: string): UploadEntry | undefined { return entries.get(id); }
