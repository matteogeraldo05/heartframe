// Messages saved by the previous version must render exactly as before (bit for bit).
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { fakeApi } from "./fixtures";
import { DRAWING_SCRIPT, LEGACY_DOCS, PHOTO_SCRIPT } from "./legacy-docs";

const GOLDEN: Record<string, string> = JSON.parse(readFileSync(new URL("./golden/legacy.json", import.meta.url), "utf8"));

test("older messages render exactly as the previous version drew them", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "pure rendering; once is enough");
  await fakeApi(page);
  await page.goto("/");
  await page.waitForSelector("canvas");
  const diffs = await page.evaluate(async ([docs, golden, photoJs, drawJs]) => {
    const { renderMessage } = await import("/render/compose.ts");
    const photo = eval(photoJs), drawing = eval(drawJs);
    const out: Record<string, number> = {};
    for (const [name, d] of Object.entries(docs as Record<string, any>)) {
      const doc = { ...d, drawing: d.drawing ? drawing : null };
      const got = renderMessage(doc, doc.photo ? photo : null).packed;
      const want = Uint8Array.from(atob((golden as Record<string, string>)[name]), (c) => c.charCodeAt(0));
      let bits = 0;
      for (let i = 0; i < want.length; i++) { let x = got[i] ^ want[i]; while (x) { bits += x & 1; x >>= 1; } }
      out[name] = bits;
    }
    return out;
  }, [LEGACY_DOCS, GOLDEN, PHOTO_SCRIPT, DRAWING_SCRIPT] as const);
  expect(Object.keys(diffs).sort()).toEqual(Object.keys(GOLDEN).sort());
  for (const [name, n] of Object.entries(diffs)) expect(n, `${name}: pixels that differ`).toBe(0);
});
