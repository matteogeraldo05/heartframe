// The pointer must land on the pixel under it everywhere on the preview, not only in the middle
// (it used to drift towards the centre near the edges because of the canvas's white border).
import { expect, test, type Page } from "@playwright/test";

import { fakeApi } from "./fixtures";

const W = 400, H = 300;
const BLACK = [38, 38, 42]; // how paintEpaper shows a black pixel

async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.getByTestId("epaper").evaluate((c: HTMLCanvasElement, [x, y]) => Array.from(c.getContext("2d")!.getImageData(x, y, 1, 1).data.slice(0, 3)), [x, y]);
}

async function blackCount(page: Page): Promise<number> {
  return page.getByTestId("epaper").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 38 && d[i + 1] === 38 && d[i + 2] === 42) n++;
    return n;
  });
}

/** Tap/click the centre of canvas pixel (x, y), going through the real layout. */
async function hit(page: Page, x: number, y: number, isMobile: boolean) {
  await page.getByTestId("epaper").evaluate((c) => c.scrollIntoView({ block: "center" })); // on a phone the tools push it off screen
  const box = (await page.getByTestId("epaper").boundingBox())!;
  const cx = box.x + ((x + 0.5) / W) * box.width, cy = box.y + ((y + 0.5) / H) * box.height;
  if (isMobile) await page.touchscreen.tap(cx, cy);
  else await page.mouse.click(cx, cy);
}

async function oneSquarePixelPen(page: Page) {
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page.getByRole("button", { name: "Black pen" }).click();
  await page.getByLabel(/^Size \d+px/).fill("1");
  await page.getByRole("button", { name: "■ Square" }).click();
}

const TARGETS: [number, number][] = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], [W / 2, H / 2]];

test("drawing lands on the pixel under the pointer: corners and centre", async ({ page, isMobile }) => {
  await fakeApi(page);
  await page.goto("/");
  await oneSquarePixelPen(page);
  expect(await blackCount(page)).toBe(0);
  for (const [x, y] of TARGETS) {
    await hit(page, x, y, isMobile);
    expect(await pixel(page, x, y), `pixel ${x},${y}`).toEqual(BLACK);
  }
  expect(await blackCount(page)).toBe(TARGETS.length); // nothing else turned black
});

test("still exact when the preview is scaled with a CSS transform", async ({ page, isMobile }) => {
  await fakeApi(page);
  await page.goto("/");
  await oneSquarePixelPen(page);
  await page.locator(".bezel").evaluate((el: HTMLElement) => { el.style.transform = "scale(0.75)"; el.style.transformOrigin = "0 0"; });
  for (const [x, y] of TARGETS) await hit(page, x, y, isMobile);
  for (const [x, y] of TARGETS) expect(await pixel(page, x, y), `pixel ${x},${y}`).toEqual(BLACK);
  expect(await blackCount(page)).toBe(TARGETS.length);
});

test("undo and redo with the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcut");
  await fakeApi(page);
  await page.goto("/");
  await oneSquarePixelPen(page);
  await hit(page, 10, 10, false);
  await hit(page, 20, 20, false);
  expect(await blackCount(page)).toBe(2);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await blackCount(page)).toBe(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await blackCount(page)).toBe(2);
});
