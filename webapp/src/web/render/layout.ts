// layout.ts - word wrap and auto-size for the text block. Pure (takes a measure function),
// so it is unit tested without a browser.

export type Measure = (s: string) => number;

export interface LaidLine {
  text: string;
  indent: number;   // px from the block's left edge (bullets: hanging indent)
  bullet: boolean;  // draw a bullet in front of this line (first line of a paragraph)
  width: number;    // text width, without the indent
}

export interface Laid {
  lines: LaidLine[];
  px: number;
  lineH: number;
  width: number;    // widest line including its indent
}

/** Space a bullet takes, before the text; continuation lines are indented by the same amount. */
export const bulletIndent = (px: number) => Math.round(px * 0.75);

export function wrapLines(measure: Measure, text: string, maxW: number, indent = 0): LaidLine[] {
  const out: LaidLine[] = [];
  const avail = maxW - indent;
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push({ text: "", indent: 0, bullet: false, width: 0 }); continue; }
    let line = words[0];
    let first = true;
    const push = (s: string) => { out.push({ text: s, indent, bullet: indent > 0 && first, width: measure(s) }); first = false; };
    for (const w of words.slice(1)) {
      if (measure(`${line} ${w}`) <= avail) line += ` ${w}`;
      else { push(line); line = w; }
    }
    push(line);
  }
  return out;
}

/** Word-wrap and, when size = 0, find the largest font size that fits the box. */
export function layoutText(
  measureAt: (px: number) => Measure,
  t: { content: string; size: number; lineHeight: number; bullets?: boolean },
  boxW: number,
  boxH: number,
): Laid {
  const measure = (px: number): Laid => {
    const indent = t.bullets ? bulletIndent(px) : 0;
    const lines = wrapLines(measureAt(px), t.content, boxW, indent);
    const width = Math.max(0, ...lines.map((l) => l.indent + l.width));
    return { lines, px, lineH: px * t.lineHeight, width };
  };
  if (t.size > 0) return measure(t.size);
  let lo = 10, hi = 160, best = measure(lo);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = measure(mid);
    const fits = m.lines.length * m.lineH <= boxH && m.width <= boxW;
    if (fits) { best = m; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}
