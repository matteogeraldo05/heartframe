// Pure rendering logic: brushes, the selection layer, border positions, text layout.
import { describe, expect, it } from "vitest";

import { HEIGHT, OVERLAY, WIDTH } from "../src/shared/format";
import { brushOffsets, ditherOn, Layer, scaleNearest } from "../src/web/render/layer";
import { bulletIndent, layoutText, wrapLines } from "../src/web/render/layout";
import { heartBorder, scallopArcs, spaced } from "../src/web/render/shapes";

const count = (a: Uint8Array) => a.reduce((n, v) => n + v, 0);

describe("brush", () => {
  it("size 1 is exactly one pixel, for both shapes", () => {
    expect(brushOffsets(1, "square")).toEqual([[0, 0]]);
    expect(brushOffsets(1, "circle")).toEqual([[0, 0]]);
  });

  it("a size-N square covers exactly N x N pixels, as a contiguous block", () => {
    for (const n of [1, 2, 3, 4, 7, 16, 64]) {
      const o = brushOffsets(n, "square");
      expect(o).toHaveLength(n * n);
      const xs = o.map(([x]) => x), ys = o.map(([, y]) => y);
      expect(Math.max(...xs) - Math.min(...xs) + 1).toBe(n);
      expect(Math.max(...ys) - Math.min(...ys) + 1).toBe(n);
    }
  });

  it("a size-N circle spans N pixels across and covers about pi*N^2/4", () => {
    for (const n of [5, 8, 16, 33, 64]) {
      const o = brushOffsets(n, "circle");
      const row0 = o.filter(([, y]) => y === Math.min(...o.map(([, yy]) => yy)));
      expect(Math.max(...o.map(([x]) => x)) - Math.min(...o.map(([x]) => x)) + 1).toBe(n);
      expect(row0.length).toBeLessThan(n); // round, not square
      expect(Math.abs(o.length - (Math.PI * n * n) / 4) / ((Math.PI * n * n) / 4)).toBeLessThan(0.15);
    }
  });

  it("every size step covers more pixels (sizes 1..64 all look different)", () => {
    for (const shape of ["square", "circle"] as const) {
      for (let n = 2; n <= 64; n++) expect(brushOffsets(n, shape).length, `${shape} ${n}`).toBeGreaterThan(brushOffsets(n - 1, shape).length);
    }
  });

  it("a dab paints exactly the stamp's pixels, clipped at the edges", () => {
    const L = new Layer();
    L.dab(10, 10, brushOffsets(4, "square"), "black");
    expect(count(L.black)).toBe(16);
    for (let y = 9; y <= 12; y++) for (let x = 9; x <= 12; x++) expect(L.black[y * WIDTH + x]).toBe(1);
    const C = new Layer();
    C.dab(0, 0, brushOffsets(4, "square"), "black"); // only the 3x3 inside the canvas
    expect(count(C.black)).toBe(9);
  });

  it("dither pen: density follows the amount and the pattern is fixed to the canvas grid", () => {
    const L = new Layer();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) L.set(x, y, "dither", 16);
    expect(count(L.black)).toBe((64 * 64) / 4); // 16 of 64 cells inked = 25 %
    expect(count(L.white)).toBe((64 * 64 * 3) / 4); // the rest painted white (a true grey)
    expect(ditherOn(3, 5, 20)).toBe(ditherOn(3 + 8, 5 + 16, 20)); // repeats every 8 px
    const A = new Layer(), B = new Layer();
    A.dab(20, 20, brushOffsets(9, "square"), "dither", 32);
    B.dab(21, 22, brushOffsets(9, "square"), "dither", 32); // overlapping dab: same pixels, same values
    for (let y = 18; y <= 24; y++) for (let x = 19; x <= 24; x++) expect(A.black[y * WIDTH + x]).toBe(B.black[y * WIDTH + x]);
  });
});

describe("selection", () => {
  it("scales nearest-neighbour (stays crisp)", () => {
    expect(Array.from(scaleNearest(new Uint8Array([1, 0, 0, 1]), 2, 2, 4, 4))).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1]);
    expect(Array.from(scaleNearest(new Uint8Array([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1]), 4, 4, 2, 2))).toEqual([1, 0, 0, 1]);
  });

  it("lift, move, resize and commit; undo puts it back; redo re-applies", () => {
    const L = new Layer();
    L.dab(10, 10, brushOffsets(2, "square"), "black"); // 2x2 at (10..11, 10..11)
    L.lift({ x: 10, y: 10, w: 2, h: 2 });
    expect(count(L.black)).toBe(0);                        // lifted off
    expect(count(L.composite().black)).toBe(4);            // ...but still visible while floating
    L.float!.to = { x: 50, y: 60, w: 4, h: 6 };            // moved and resized
    L.commitFloat();
    expect(count(L.black)).toBe(24);
    expect(L.black[60 * WIDTH + 50]).toBe(1);
    expect(L.black[65 * WIDTH + 53]).toBe(1);
    expect(L.black[10 * WIDTH + 10]).toBe(0);
    L.undo();
    expect(count(L.black)).toBe(4);
    expect(L.black[10 * WIDTH + 10]).toBe(1);
    L.redo();
    expect(count(L.black)).toBe(24);
  });

  it("Esc puts the selection back where it was; transparent pixels don't overwrite", () => {
    const L = new Layer();
    L.set(5, 5, "black");
    L.lift({ x: 4, y: 4, w: 3, h: 3 });
    L.cancelFloat();
    expect(L.black[5 * WIDTH + 5]).toBe(1);
    L.set(30, 30, "black");
    L.lift({ x: 4, y: 4, w: 3, h: 3 });
    L.float!.to = { x: 29, y: 29, w: 3, h: 3 };            // drop it over (30, 30); its own (1,1) pixel lands there
    L.set(29, 29, "black");                                  // not covered by the selection's black pixel
    L.commitFloat();
    expect(L.black[29 * WIDTH + 29]).toBe(1);               // transparent selection pixel kept what was below
  });
});

describe("border of little hearts", () => {
  const spots = heartBorder(WIDTH, HEIGHT);
  const on = (edge: string) => spots.filter((s) => s.edges.includes(edge as never));
  const gaps = (v: number[]) => v.slice(1).map((x, i) => x - v[i]);

  it("has a heart on the corners, including the bottom-right one", () => {
    const xs = on("bottom").map((s) => s.x), ys = on("left").map((s) => s.y);
    expect(on("bottom").some((s) => s.edges.includes("left"))).toBe(true);
    expect(on("bottom").some((s) => s.edges.includes("right"))).toBe(true);
    expect(on("top").some((s) => s.edges.includes("left"))).toBe(true);
    expect(Math.min(...xs)).toBe(14);
    expect(Math.max(...xs)).toBe(WIDTH - 14);
    expect(Math.min(...ys)).toBe(13);
    expect(Math.max(...ys)).toBe(HEIGHT - 11);
  });

  it("counts the hearts on each edge (corners count for both edges)", () => {
    expect(on("bottom")).toHaveLength(16);
    expect(on("left")).toHaveLength(12);
    expect(on("right")).toHaveLength(11); // top-right corner is the battery indicator's
    expect(on("top")).toHaveLength(12);   // the last 4 would sit under the battery indicator
  });

  it("spaces them evenly along each edge", () => {
    for (const edge of ["top", "bottom"]) for (const g of gaps(on(edge).map((s) => s.x).sort((a, b) => a - b))) expect(g).toBeCloseTo(24.8, 5);
    for (const edge of ["left", "right"]) {
      const g = gaps(on(edge).map((s) => s.y).sort((a, b) => a - b));
      for (const x of g) expect(x).toBeCloseTo(g[0], 5);
      expect(g[0]).toBeGreaterThan(23);
      expect(g[0]).toBeLessThan(27);
    }
  });

  it("keeps the battery indicator's area clear", () => {
    for (const s of spots) {
      const clear = s.x + 8 <= OVERLAY.x || s.x - 8 >= OVERLAY.x + OVERLAY.w || s.y - 8 >= OVERLAY.y + OVERLAY.h || s.y + 8 <= OVERLAY.y;
      expect(clear, `${s.x},${s.y}`).toBe(true);
    }
  });

  it("spaced() includes both ends", () => {
    expect(spaced(0, 100, 25)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("scalloped edge", () => {
  const arcs = scallopArcs(WIDTH, HEIGHT);
  const side = (pred: (a: (typeof arcs)[0]) => boolean) => arcs.filter(pred);

  it("has scallops on all four sides", () => {
    expect(side((a) => a.cy === 14 && a.start === 0).length).toBeGreaterThan(10);           // top
    expect(side((a) => a.cy === HEIGHT - 14).length).toBeGreaterThan(10);                    // bottom
    expect(side((a) => a.cx === 14 && a.start === Math.PI / 2).length).toBeGreaterThan(8);  // left
    expect(side((a) => a.cx === WIDTH - 14).length).toBeGreaterThan(8);                      // right
  });

  it("runs exactly corner to corner on each side, so they meet cleanly", () => {
    const top = side((a) => a.cy === 14 && a.start === 0).sort((a, b) => a.cx - b.cx);
    expect(top[0].cx - top[0].r).toBeCloseTo(14, 9);
    expect(top[top.length - 1].cx + top[top.length - 1].r).toBeCloseTo(WIDTH - 14, 9);
    const left = side((a) => a.cx === 14 && a.start === Math.PI / 2).sort((a, b) => a.cy - b.cy);
    expect(left[0].cy - left[0].r).toBeCloseTo(14, 9);
    expect(left[left.length - 1].cy + left[left.length - 1].r).toBeCloseTo(HEIGHT - 14, 9);
  });
});

describe("text layout", () => {
  const mono: (px: number) => (s: string) => number = (px) => (s) => s.length * px * 0.5; // fake monospace font

  it("wraps like before when bullets are off", () => {
    const lines = wrapLines(mono(10), "one two three four", 50);
    expect(lines.map((l) => l.text)).toEqual(["one two", "three four"]);
    expect(lines.every((l) => l.indent === 0 && !l.bullet)).toBe(true);
  });

  it("bullets: one per paragraph, wrapped lines hang under the text, not the bullet", () => {
    const indent = bulletIndent(10);
    const lines = wrapLines(mono(10), "one two three\nfour", 50 + indent, indent);
    expect(lines.map((l) => [l.text, l.bullet, l.indent])).toEqual([
      ["one two", true, indent],
      ["three", false, indent],
      ["four", true, indent],
    ]);
  });

  it("auto-size accounts for the bullet indent", () => {
    const plain = layoutText(mono, { content: "hello there", size: 0, lineHeight: 1.2 }, 200, 200);
    const bullet = layoutText(mono, { content: "hello there", size: 0, lineHeight: 1.2, bullets: true }, 200, 200);
    expect(bullet.px).toBeLessThan(plain.px);
    expect(bullet.width).toBeLessThanOrEqual(200);
  });
});
