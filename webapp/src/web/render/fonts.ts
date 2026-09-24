// fonts.ts - self-hosted fonts (bundled by Vite from @fontsource, no Google requests).
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

export interface FontInfo { family: string; label: string; weight: number; minPx: number }

// minPx: below this the letters fall apart at 1 bit per pixel.
export const FONTS: FontInfo[] = [
  { family: "Dancing Script", label: "Dancing Script (script, bold)", weight: 700, minPx: 22 },
  { family: "Great Vibes", label: "Great Vibes (elegant script)", weight: 400, minPx: 34 },
  { family: "Pacifico", label: "Pacifico (round script)", weight: 400, minPx: 22 },
  { family: "Parisienne", label: "Parisienne (script)", weight: 400, minPx: 30 },
  { family: "Allura", label: "Allura (fine script)", weight: 400, minPx: 36 },
  { family: "Sacramento", label: "Sacramento (thin script)", weight: 400, minPx: 40 },
  { family: "Caveat", label: "Caveat (handwriting)", weight: 600, minPx: 22 },
  { family: "Playfair Display", label: "Playfair (serif)", weight: 700, minPx: 16 },
  { family: "Quicksand", label: "Quicksand (clean sans)", weight: 700, minPx: 14 },
  { family: "Nunito", label: "Nunito (rounded sans)", weight: 800, minPx: 14 },
];

export function fontInfo(family: string): FontInfo {
  return FONTS.find((f) => f.family === family) ?? FONTS[0];
}

export function cssFont(f: FontInfo, px: number): string {
  return `${f.weight} ${px}px "${f.family}"`;
}

/** Canvas can't use a web font until it has loaded; wait for all of them once. */
export async function loadFonts(): Promise<void> {
  await Promise.all(FONTS.map((f) => document.fonts.load(cssFont(f, 40), "Aa♥")));
}
