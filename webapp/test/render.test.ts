// Pure rendering logic: brushes, the selection layer, border positions, text layout.
import { describe, expect, it } from "vitest";

import { HEIGHT, OVERLAY, WIDTH } from "../src/shared/format";
import { History, levelToZoom, zoomToLevel } from "../src/web/editor/history";
import { brushOffsets, ditherOn, floodRegion, Layer, scaleNearest, shapeMask } from "../src/web/render/layer";
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

  it("lift, move, resize and commit", () => {
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
  });

  it("rotation 0 places pixels exactly like plain nearest-neighbour scaling", () => {
    const L = new Layer();
    for (const [x, y] of [[100, 100], [101, 100], [103, 102], [100, 104]]) L.set(x, y, "black");
    L.lift({ x: 100, y: 100, w: 4, h: 5 });
    L.float!.to = { x: 20, y: 30, w: 9, h: 7 };
    const p = L.floatPixels()!;
    expect([p.x, p.y, p.w, p.h]).toEqual([20, 30, 9, 7]);
    expect(Array.from(p.black)).toEqual(Array.from(scaleNearest(L.float!.black, 4, 5, 9, 7)));
  });

  it("rotates around the centre: 90 degrees clockwise turns a top row into a right column", () => {
    const L = new Layer();
    for (let x = 200; x < 210; x++) L.set(x, 100, "black");   // 10 x 1 bar = top row of a 10 x 10 box
    L.lift({ x: 200, y: 100, w: 10, h: 10 });
    L.float!.angle = Math.PI / 2;
    L.commitFloat();
    expect(count(L.black)).toBe(10);
    for (let y = 100; y < 110; y++) expect(L.black[y * WIDTH + 209], `y=${y}`).toBe(1); // right-hand column
  });

  it("rotating by 180 degrees twice gives back the same pixels", () => {
    const L = new Layer();
    for (const [x, y] of [[60, 60], [61, 60], [62, 63], [64, 61], [60, 64]]) L.set(x, y, "black");
    const before = L.black.slice();
    L.lift({ x: 60, y: 60, w: 5, h: 5 }); L.float!.angle = Math.PI; L.commitFloat();
    expect(L.black[64 * WIDTH + 64]).toBe(1); // (60, 60) went to the opposite corner
    L.lift({ x: 60, y: 60, w: 5, h: 5 }); L.float!.angle = Math.PI; L.commitFloat();
    expect(Array.from(L.black)).toEqual(Array.from(before));
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

describe("shapes", () => {
  const bbox = (m: Uint8Array) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    m.forEach((v, i) => { if (v) { const x = i % WIDTH, y = (i / WIDTH) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    return [x0, y0, x1, y1];
  };
  const at = (m: Uint8Array, x: number, y: number) => m[y * WIDTH + x];

  it("rectangle: filled covers the whole box, outline only its edges (any drag direction)", () => {
    const f = shapeMask("rect", 30, 40, 10, 20, true, 1); // dragged up-left
    expect(count(f)).toBe(21 * 21);
    expect(bbox(f)).toEqual([10, 20, 30, 40]);
    const o = shapeMask("rect", 10, 20, 49, 29, false, 2);
    expect(count(o)).toBe(40 * 10 - 36 * 6);
    expect(at(o, 25, 25)).toBe(0);
  });

  it("ellipse fills its box (not a locked circle) and the outline is hollow", () => {
    const e = shapeMask("ellipse", 100, 100, 179, 139, true, 1);    // 80 x 40
    expect(bbox(e)).toEqual([100, 100, 179, 139]);
    expect(Math.abs(count(e) - (Math.PI * 80 * 40) / 4) / ((Math.PI * 80 * 40) / 4)).toBeLessThan(0.05);
    const o = shapeMask("ellipse", 100, 100, 179, 139, false, 3);
    expect(at(o, 140, 120)).toBe(0);
    expect(at(o, 100, 120)).toBe(1);
    expect(at(o, 140, 100)).toBe(1);
  });

  it("line goes from end to end with the given width", () => {
    const l = shapeMask("line", 10, 10, 110, 60, false, 1);
    expect(at(l, 10, 10)).toBe(1);
    expect(at(l, 110, 60)).toBe(1);
    expect(bbox(l)).toEqual([10, 10, 110, 60]);
    expect(count(shapeMask("line", 10, 10, 110, 10, false, 5))).toBeGreaterThan(5 * 100);
  });

  it("triangle and star point up, and down when dragged upwards", () => {
    for (const kind of ["triangle", "star"] as const) {
      const up = shapeMask(kind, 50, 50, 149, 149, true, 1);
      const down = shapeMask(kind, 50, 149, 149, 50, true, 1);
      expect(at(up, 100, 56), kind).toBe(1);   // just under the tip at the top-centre
      expect(at(up, 100, 148), kind).toBe(kind === "triangle" ? 1 : 0); // star: notch between the legs
      expect(at(down, 100, 143), kind).toBe(1);
      expect(at(down, 100, 51), kind).toBe(kind === "triangle" ? 1 : 0);
      expect(bbox(up)[0]).toBeGreaterThanOrEqual(50);
      expect(bbox(up)[2]).toBeLessThanOrEqual(149);
    }
    const outline = shapeMask("star", 50, 50, 149, 149, false, 2);
    expect(at(outline, 100, 100)).toBe(0); // hollow
  });
});

describe("bucket fill", () => {
  it("fills the connected area of the clicked colour, not across lines, not diagonally", () => {
    const img = new Uint8Array(WIDTH * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) img[y * WIDTH + 200] = 1;   // a vertical wall
    const left = floodRegion(img, 10, 10);
    expect(count(left)).toBe(200 * HEIGHT);
    expect(left[10 * WIDTH + 250]).toBe(0);
    const wall = floodRegion(img, 200, 5);
    expect(count(wall)).toBe(HEIGHT);
    const diag = new Uint8Array(WIDTH * HEIGHT);
    diag[0] = 1; diag[WIDTH + 1] = 1;                           // touching only at a corner
    expect(count(floodRegion(diag, 0, 0))).toBe(1);
  });

  it("paints the area in black, white or an adjustable dither", () => {
    const area = floodRegion(new Uint8Array(WIDTH * HEIGHT), 0, 0);
    const L = new Layer();
    L.paintMask(area, "dither", 16);
    expect(count(L.black)).toBe((WIDTH * HEIGHT) / 4);
    L.paintMask(area, "dither", 48);
    expect(count(L.black)).toBe((WIDTH * HEIGHT * 3) / 4);
    L.paintMask(area, "white");
    expect(count(L.white)).toBe(WIDTH * HEIGHT);
  });
});

describe("undo history", () => {
  it("undo goes back, redo forward, a new change clears redo", () => {
    const h = new History<number>();
    h.push(0); // 0 -> 1
    h.push(1); // 1 -> 2
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBe(0);
    expect(h.undo(0)).toBe(null);
    expect(h.redo(0)).toBe(1);
    h.push(1); // a new change from 1
    expect(h.canRedo).toBe(false);
  });

  it("quick edits of the same thing are one step; a different thing or a pause starts a new one", () => {
    const h = new History<string>(60, 800);
    h.pushMerged("a", "text.content", 1000);
    h.pushMerged("ab", "text.content", 1300);
    h.pushMerged("abc", "text.content", 1900);
    h.pushMerged("abcd", "text.bold", 2000);
    h.pushMerged("abcde", "text.bold", 5000);
    expect(h.undo("now")).toBe("abcde");
    expect(h.undo("x")).toBe("abcd");
    expect(h.undo("x")).toBe("a");
    expect(h.canUndo).toBe(false);
  });

  it("keeps a bounded number of steps", () => {
    const h = new History<number>(3);
    for (let i = 0; i < 10; i++) h.push(i);
    expect([h.undo(10), h.undo(9), h.undo(8), h.undo(7)]).toEqual([9, 8, 7, null]);
  });
});

describe("photo zoom slider", () => {
  it("0 = fit, +5 = 6x, -5 = 1/6, and older zoom values map back to the same scale", () => {
    expect(levelToZoom(0)).toBe(1);
    expect(levelToZoom(5)).toBe(6);
    expect(levelToZoom(-5)).toBeCloseTo(1 / 6, 12);
    for (const z of [1, 1.4, 2.75, 4, 0.5, 0.2]) expect(levelToZoom(zoomToLevel(z))).toBeCloseTo(z, 12);
    expect(zoomToLevel(2)).toBe(1);
    expect(zoomToLevel(0.5)).toBe(-1);
  });
});
