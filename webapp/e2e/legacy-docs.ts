// Messages saved by the previous version of the app (only the fields it knew about).
// e2e/golden/legacy.json holds what the previous renderer (commit 939168f) drew for each of them, in this
// pinned Playwright Chromium; legacy-render.spec.ts checks today's renderer still matches bit for bit.
const text = (o: Record<string, unknown>) => ({ content: "", font: "Dancing Script", size: 0, align: "center", valign: "middle", lineHeight: 1.15, stroke: 0, whiteBehind: false, ...o });
const photo = (o: Record<string, unknown>) => ({ fit: "cover", zoom: 1, offsetX: 0, offsetY: 0, brightness: 0, contrast: 10, gamma: 1, algo: "atkinson", threshold: 128, sharpen: true, invert: false, ...o });
const doc = (o: Record<string, unknown>) => ({ v: 1, template: "none", photo: null, drawing: null, signature: "", text: text({}), ...o });

export const LEGACY_DOCS: Record<string, Record<string, unknown>> = {
  "dancing-corner-hearts": doc({ template: "corner-hearts", signature: "- M", text: text({ content: "Good morning, beautiful" }) }),
  "caveat-simple-top": doc({ template: "simple", text: text({ content: "i want to hug you\nso bad rn", font: "Caveat", size: 62, valign: "top", lineHeight: 0.9 }) }),
  "pacifico-stroke-double": doc({ template: "double", text: text({ content: "GOOD MORNING POOKIE", font: "Pacifico", stroke: 1.5, lineHeight: 1.5 }) }),
  "greatvibes-bigheart": doc({ template: "big-heart", text: text({ content: "Good morning gorgeous", font: "Great Vibes", align: "left", valign: "bottom" }) }),
  "sacramento-allura-parisienne": doc({ text: text({ content: "Sacramento, thin", font: "Sacramento", size: 48, stroke: 1 }), signature: "xo" }),
  "quicksand-right": doc({ text: text({ content: "Coffee at 8?\nLove you", font: "Quicksand", align: "right", valign: "top" }) }),
  "nunito-playfair": doc({ text: text({ content: "Playfair Display for a change", font: "Playfair Display" }) }),
  "photo-offsets-whitebox": doc({ photo: photo({ zoom: 1.4, offsetX: 0.3, offsetY: -0.5 }), text: text({ content: "Hello you", font: "Caveat", whiteBehind: true }) }),
  "photo-bayer-contain": doc({ photo: photo({ fit: "contain", algo: "bayer", offsetX: -1, brightness: 10 }), text: text({ content: "ordered", font: "Nunito", valign: "bottom" }) }),
  "photo-floyd-threshold": doc({ photo: photo({ algo: "floyd", gamma: 1.4, invert: true }), drawing: "LINES" }),
  "photo-threshold": doc({ photo: photo({ algo: "threshold", threshold: 100, sharpen: false, zoom: 2, offsetY: 1 }) }),
};

/** A deterministic stand-in "photo" (radial gradient + stripes), drawn in the page. */
export const PHOTO_SCRIPT = `(() => {
  const c = document.createElement("canvas"); c.width = 640; c.height = 480;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(300, 200, 10, 320, 240, 400);
  g.addColorStop(0, "#fde"); g.addColorStop(0.5, "#a46"); g.addColorStop(1, "#112");
  x.fillStyle = g; x.fillRect(0, 0, 640, 480);
  for (let i = 0; i < 640; i += 24) { x.fillStyle = "rgba(255,255,255," + (i / 1400) + ")"; x.fillRect(i, 0, 10, 480); }
  return c;
})()`;

/** A drawing: diagonal black line + a white bar, as the old editor stored it (base64 packed masks). */
export const DRAWING_SCRIPT = `(() => {
  const b = new Uint8Array(15000), w = new Uint8Array(15000);
  const set = (a, x, y) => { const i = y * 400 + x; a[i >> 3] |= 0x80 >> (i & 7); };
  for (let i = 0; i < 280; i++) { set(b, 60 + i, 10 + i); set(b, 61 + i, 10 + i); }
  for (let y = 140; y < 150; y++) for (let x = 20; x < 380; x++) set(w, x, y);
  const enc = (u) => btoa(String.fromCharCode(...u));
  return { black: enc(b), white: enc(w) };
})()`;
