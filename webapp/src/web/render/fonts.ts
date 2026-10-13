// fonts.ts - self-hosted fonts (bundled by Vite from @fontsource, no Google requests).
// Script fonts: one weight each (bold/italic are drawn faux, see compose.ts).
import "@fontsource/allura";
import "@fontsource/caveat/600.css";
import "@fontsource/dancing-script/700.css";
import "@fontsource/great-vibes";
import "@fontsource/nunito/800.css";
import "@fontsource/pacifico";
import "@fontsource/parisienne";
import "@fontsource/playfair-display/700.css";
import "@fontsource/quicksand/700.css";
import "@fontsource/sacramento";
// Clean fonts: regular + bold, upright + italic (Outfit has no italic).
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/700-italic.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto/400-italic.css";
import "@fontsource/roboto/700-italic.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/open-sans/400-italic.css";
import "@fontsource/open-sans/700-italic.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700-italic.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/400-italic.css";
import "@fontsource/montserrat/700-italic.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/400-italic.css";
import "@fontsource/poppins/700-italic.css";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/400-italic.css";
import "@fontsource/nunito-sans/700-italic.css";
import "@fontsource/raleway/400.css";
import "@fontsource/raleway/700.css";
import "@fontsource/raleway/400-italic.css";
import "@fontsource/raleway/700-italic.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/700.css";
import "@fontsource/work-sans/400-italic.css";
import "@fontsource/work-sans/700-italic.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/400-italic.css";
import "@fontsource/dm-sans/700-italic.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/source-sans-3/400-italic.css";
import "@fontsource/source-sans-3/700-italic.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/700.css";
import "@fontsource/merriweather/400.css";
import "@fontsource/merriweather/700.css";
import "@fontsource/merriweather/400-italic.css";
import "@fontsource/merriweather/700-italic.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/700.css";
import "@fontsource/lora/400-italic.css";
import "@fontsource/lora/700-italic.css";

import { uploadedFont } from "./uploads";

export type FontGroup = "clean" | "script" | "uploaded";

export interface FontInfo {
  family: string;        // CSS family name (what MessageDoc.text.font stores, except uploads)
  label: string;
  weight: number;        // normal weight
  minPx: number;         // below this the letters fall apart at 1 bit per pixel
  group: FontGroup;
  bold?: number;         // real bold weight, if bundled (otherwise bold is drawn faux)
  italic?: boolean;      // real italic bundled (otherwise italic is drawn faux)
  ref?: string;          // uploads: the "upload:<id>" value stored in the doc
}

const clean = (family: string, minPx: number, italic = true): FontInfo =>
  ({ family, label: family, weight: 400, minPx, group: "clean", bold: 700, italic });

export const FONTS: FontInfo[] = [
  { family: "Dancing Script", label: "Dancing Script (script, bold)", weight: 700, minPx: 22, group: "script" },
  { family: "Great Vibes", label: "Great Vibes (elegant script)", weight: 400, minPx: 34, group: "script" },
  { family: "Pacifico", label: "Pacifico (round script)", weight: 400, minPx: 22, group: "script" },
  { family: "Parisienne", label: "Parisienne (script)", weight: 400, minPx: 30, group: "script" },
  { family: "Allura", label: "Allura (fine script)", weight: 400, minPx: 36, group: "script" },
  { family: "Sacramento", label: "Sacramento (thin script)", weight: 400, minPx: 40, group: "script" },
  { family: "Caveat", label: "Caveat (handwriting)", weight: 600, minPx: 22, group: "script" },
  { family: "Quicksand", label: "Quicksand (rounded, bold)", weight: 700, minPx: 14, group: "clean" },
  { family: "Nunito", label: "Nunito (rounded, extra bold)", weight: 800, minPx: 14, group: "clean" },
  clean("Inter", 13),
  clean("Roboto", 13),
  clean("Open Sans", 13),
  clean("Lato", 13),
  clean("Montserrat", 13),
  clean("Poppins", 13),
  clean("Nunito Sans", 13),
  clean("Raleway", 15),
  clean("Work Sans", 13),
  clean("DM Sans", 13),
  clean("Source Sans 3", 14),
  clean("Outfit", 13, false),
  { family: "Playfair Display", label: "Playfair Display (serif, bold)", weight: 700, minPx: 16, group: "clean" },
  clean("Merriweather", 13),
  clean("Lora", 14),
];

/** Built-in font by family, an uploaded font by "upload:<id>", else the default (e.g. a deleted upload). */
export function fontInfo(family: string): FontInfo {
  return FONTS.find((f) => f.family === family) ?? uploadedFont(family) ?? FONTS[0];
}

export function cssFont(f: FontInfo, px: number, bold = false, italic = false): string {
  const weight = bold && f.bold ? f.bold : f.weight;
  return `${italic && f.italic ? "italic " : ""}${weight} ${px}px "${f.family}"`;
}

/** Canvas can't use a web font until it has loaded; wait for the regular styles once. */
export async function loadFonts(): Promise<void> {
  await Promise.all(FONTS.map((f) => document.fonts.load(cssFont(f, 40), "Aa♥")));
}

/** Make sure the exact face (bold/italic) is loaded before measuring with it. */
export function ensureFont(f: FontInfo, bold: boolean, italic: boolean): Promise<unknown> {
  return document.fonts.load(cssFont(f, 40, bold, italic), "Aa");
}
