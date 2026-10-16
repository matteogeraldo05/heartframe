// Shapes, bucket fill, rotating a selection, moving text, undo/redo everywhere, photo zoom and
// transparent photos - driven through the real UI at desktop and phone sizes.
import { expect, test, type Page } from "@playwright/test";

import { fakeApi } from "./fixtures";

const W = 400, H = 300;

/** Black pixels of the preview (as paintEpaper draws them) and their bounding box. */
async function ink(page: Page): Promise<{ n: number; box: number[]; at: (x: number, y: number) => boolean }> {
  const bits = await page.getByTestId("epaper").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4) out.push(d[i] === 38 && d[i + 1] === 38 && d[i + 2] === 42 ? 1 : 0);
    return out;
  });
  let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  bits.forEach((v, i) => { if (v) { n++; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  return { n, box: [x0, y0, x1, y1], at: (x, y) => bits[y * W + x] === 1 };
}

/** Client coordinates of canvas pixel (x, y) (its centre). */
async function client(page: Page, x: number, y: number): Promise<[number, number]> {
  const c = page.getByTestId("epaper");
  const b = (await c.boundingBox())!;
  return [b.x + ((x + 0.5) / W) * b.width, b.y + ((y + 0.5) / H) * b.height];
}

async function show(page: Page) {
  await page.getByTestId("epaper").evaluate((el) => el.scrollIntoView({ block: "center" }));
}

/** Drag between canvas pixels with the mouse (optionally holding Shift). */
async function drag(page: Page, from: [number, number], to: [number, number], shift = false) {
  await show(page);
  const a = await client(page, ...from), b = await client(page, ...to);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move(...b, { steps: 6 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

/** Drag with a finger (real touch events through the DevTools protocol). */
async function touchDrag(page: Page, from: [number, number], to: [number, number]) {
  await show(page);
  const cdp = await page.context().newCDPSession(page);
  const a = await client(page, ...from), b = await client(page, ...to);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a[0], y: a[1] }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a[0] + ((b[0] - a[0]) * i) / 6, y: a[1] + ((b[1] - a[1]) * i) / 6 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function click(page: Page, x: number, y: number) {
  await show(page);
  await page.mouse.click(...(await client(page, x, y)));
}

async function open(page: Page) {
  await fakeApi(page);
  await page.goto("/");
  await page.waitForSelector("canvas");
}

async function drawTab(page: Page) {
  await page.getByRole("button", { name: "Draw", exact: true }).click();
}

async function shapeTool(page: Page, kind: string, opts: { filled?: boolean; width?: number } = {}) {
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByRole("button", { name: kind, exact: true }).click();
  if (opts.filled) await page.getByRole("button", { name: "Filled", exact: true }).click();
  if (opts.width) await page.getByLabel(/^(Line width|Size) \d+px/).fill(String(opts.width));
}

test("shape tool: press and drag, free proportions; Shift makes a square", async ({ page }) => {
  await open(page);
  await drawTab(page);
  await shapeTool(page, "Square / rectangle", { width: 1 });
  await drag(page, [50, 50], [149, 99]);
  let s = await ink(page);
  expect(s.box).toEqual([50, 50, 149, 99]);               // 100 x 50: not locked to a square
  expect(s.n).toBe(2 * (100 + 50) - 4);                    // a 1 px outline
  expect(s.at(100, 75)).toBe(false);

  await shapeTool(page, "Circle / ellipse", { filled: true });
  await drag(page, [200, 40], [260, 140], true);           // Shift: a circle 101 px across
  s = await ink(page);
  expect(s.at(250, 90)).toBe(true);
  expect(s.at(301, 90)).toBe(false);
  expect(s.box[2]).toBe(300);
});

test("bucket fill: black, then undo; dither amount is adjustable", async ({ page, isMobile }) => {
  await open(page);
  await drawTab(page);
  await shapeTool(page, "Square / rectangle", { width: 2 });
  await drag(page, [20, 20], [119, 119]);
  const outline = (await ink(page)).n;
  await page.getByRole("button", { name: "Fill", exact: true }).click();
  await click(page, 60, 60);
  expect((await ink(page)).n).toBe(100 * 100);              // the inside is filled, the outside isn't
  await page.getByRole("button", { name: "↶ Undo" }).click();
  expect((await ink(page)).n).toBe(outline);
  await page.getByRole("button", { name: "Dither", exact: true }).click();
  await page.getByLabel(/^Amount/).fill("16");
  await click(page, 60, 60);
  const quarter = (await ink(page)).n - outline;
  expect(quarter).toBe((96 * 96) / 4);                      // 16/64 of the 96 x 96 inside
  if (!isMobile) {
    await page.keyboard.press("ControlOrMeta+z");
    expect((await ink(page)).n).toBe(outline);
    await page.keyboard.press("ControlOrMeta+y");              // Ctrl+Y redoes too
    expect((await ink(page)).n).toBe(outline + quarter);
  }
});

test("select: the round handle rotates the selection (Shift snaps to 90°)", async ({ page }) => {
  await open(page);
  await drawTab(page);
  await shapeTool(page, "Line", { width: 1 });
  await drag(page, [100, 150], [199, 150]);                 // a 100 px horizontal line
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await drag(page, [95, 140], [205, 160]);                  // box x 95..206, y 140..161
  const k = await page.getByTestId("epaper").evaluate((c: HTMLCanvasElement) => 400 / c.clientWidth);
  const cx = 95 + 111 / 2, cy = 140 + 21 / 2;
  const handle: [number, number] = [cx - 0.5, cy - 21 / 2 - 18 * k - 0.5]; // drag() aims at pixel centres
  await drag(page, handle, [cx + 60, cy - 0.5], true);
  await page.keyboard.press("Enter");
  const s = await ink(page);
  expect(s.n).toBe(100);
  expect(s.box[2] - s.box[0]).toBe(0);                      // now one column...
  expect(s.box[3] - s.box[1]).toBe(99);                     // ...100 px tall
});

test("text can be dragged like a photo, reset, and the move undone", async ({ page, isMobile }) => {
  await open(page);
  await page.getByPlaceholder("Write your message…").fill("Hi");
  await page.waitForTimeout(200);
  const before = await ink(page);
  if (isMobile) await touchDrag(page, [200, 150], [250, 180]);
  else await drag(page, [200, 150], [250, 180]);
  await page.waitForTimeout(200);
  const after = await ink(page);
  expect(after.n).toBe(before.n);
  expect(after.box).toEqual([before.box[0] + 50, before.box[1] + 30, before.box[2] + 50, before.box[3] + 30]);
  await page.getByRole("button", { name: "Reset position" }).click();
  expect((await ink(page)).box).toEqual(before.box);
  await page.getByRole("button", { name: "↶ Undo" }).click();   // undo the reset
  expect((await ink(page)).box).toEqual(after.box);
  await page.getByRole("button", { name: "↶ Undo" }).click();   // undo the move
  expect((await ink(page)).box).toEqual(before.box);
  await page.getByRole("button", { name: "↷ Redo" }).click();
  expect((await ink(page)).box).toEqual(after.box);
});

test("undo works on every tab, including after changing a dropdown", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcut");
  await open(page);
  await page.getByPlaceholder("Write your message…").fill("Undo me");
  const font = page.locator("label").filter({ hasText: /^Font/ }).locator("select").first();
  await font.focus();                                       // as after clicking it
  await font.selectOption("Inter");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(font).toHaveValue("Dancing Script");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(font).toHaveValue("Inter");
  await page.getByRole("button", { name: "Border", exact: true }).click();
  const border = page.locator("label").filter({ hasText: /^Border/ }).locator("select").first();
  await border.focus();
  await border.selectOption("simple");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(border).toHaveValue("none");
});

// 40 x 30 PNG: transparent, with a black 10 x 10 square in the middle.
const TRANSPARENT_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAQAAAD01JRWAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAAmJLR0QA/4ePzL8AAAAHdElNRQfqChAGIjoEkT5aAAAAKUlEQVRIx2NgGAWjYBQQBowE5P+TqoeJ2i4cNXDUwMFg4CgYBaOAGAAAmYYBFJFDu+gAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMTAtMTZUMDY6MzQ6NTgrMDA6MDCE3vw2AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTEwLTE2VDA2OjM0OjU4KzAwOjAw9YNEigAAAABJRU5ErkJggg==", "base64");

test("photos: transparent areas come out white; zoom runs -5..5 from 0", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "square.png", mimeType: "image/png", buffer: TRANSPARENT_PNG });
  await expect(page.getByText("Drag the photo on the preview to move it.")).toBeVisible();
  await page.waitForTimeout(300);
  let s = await ink(page);
  expect(s.at(5, 5)).toBe(false);                           // was black before the fix
  expect(s.at(200, 150)).toBe(true);                        // the black square
  expect(s.n).toBeLessThan(W * H * 0.15);

  const zoom = page.getByLabel(/^Zoom/);
  await expect(zoom).toHaveAttribute("min", "-5");
  await expect(zoom).toHaveAttribute("max", "5");
  await expect(zoom).toHaveValue("0");
  await expect(page.getByText(/^Zoom 0$/)).toBeVisible();
  const atFit = s.n;
  await zoom.fill("-5");
  await expect(page.getByText(/^Zoom -5\.0$/)).toBeVisible();
  await page.waitForTimeout(200);
  s = await ink(page);
  expect(s.n).toBeLessThan(atFit / 20);                     // six times smaller: ~1/36 of the area
  await zoom.fill("5");
  await page.waitForTimeout(200);
  expect((await ink(page)).n).toBeGreaterThan(W * H * 0.9);  // six times bigger: the square fills the frame
});
