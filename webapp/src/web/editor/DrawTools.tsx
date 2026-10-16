// DrawTools.tsx - brushes, shapes, bucket fill, stamps, selection. Used by the Draw tab and for
// custom borders. (Undo/redo sit under the preview: they cover the whole editor.)
import { useState } from "react";

import { api } from "../api";
import type { BrushShape, ShapeKind } from "../render/layer";
import { loadUploads, useUploads } from "../render/uploads";
import { readUpload } from "./util";

export type Tool = "pen" | "white" | "erase" | "dither" | "shape" | "fill" | "stamp" | "select";
/** What shapes and the bucket paint with. */
export type Ink = "black" | "white" | "dither";

export interface ToolState {
  tool: Tool;
  size: number;          // brush px, 1..64 (also the shape outline width)
  shape: BrushShape;
  amount: number;        // dither density, 1..63 of 64 (dither pen, and dither ink for shapes/fill)
  stamp: string;         // "heart" or an upload id
  stampSize: number;     // px
  shapeKind: ShapeKind;
  filled: boolean;       // shapes: filled or outline
  ink: Ink;              // shapes and bucket fill
}

export const DEFAULT_TOOLS: ToolState = {
  tool: "pen", size: 4, shape: "circle", amount: 32, stamp: "heart", stampSize: 32, shapeKind: "rect", filled: false, ink: "black",
};

const TOOL_LABELS: [Tool, string][] = [
  ["pen", "Black pen"], ["white", "White pen"], ["erase", "Eraser"], ["dither", "Dither pen"],
  ["shape", "Shape"], ["fill", "Fill"], ["stamp", "Stamp"], ["select", "Select"],
];

const SHAPES: [ShapeKind, string, string][] = [
  ["ellipse", "◯", "Circle / ellipse"], ["rect", "▭", "Square / rectangle"], ["line", "╱", "Line"], ["star", "☆", "Star"], ["triangle", "△", "Triangle"],
];

export function DrawTools({ tools, setTools, onClear, clearLabel, floating, onApply, onCancel, onDelete, borderMode, onNote }: {
  tools: ToolState;
  setTools: (patch: Partial<ToolState>) => void;
  onClear: () => void;
  clearLabel: string;
  floating: boolean;
  onApply: () => void; onCancel: () => void; onDelete: () => void;
  borderMode?: boolean;  // borders are black ink only: no white pen / white ink
  onNote: (s: string) => void;
}) {
  const stamps = useUploads().filter((u) => u.info.kind === "stamp" && u.img);
  const [busy, setBusy] = useState(false);
  const t = tools.tool;
  const isBrush = t === "pen" || t === "white" || t === "erase" || t === "dither";
  const usesInk = t === "shape" || t === "fill";
  const showAmount = t === "dither" || (usesInk && tools.ink === "dither");
  const inks: Ink[] = borderMode ? ["black", "dither"] : ["black", "white", "dither"];

  const uploadStamp = async (file: File) => {
    setBusy(true);
    try {
      const { b64, name } = await readUpload(file, ["png", "jpg", "jpeg"]);
      const info = await api.upload({ kind: "stamp", name, data: b64 });
      await loadUploads();
      setTools({ tool: "stamp", stamp: info.id });
      onNote(`Stamp "${name}" added.`);
    } catch (e) {
      onNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h3 className="section-label">Brushes</h3>
      <div className="row tools">
        {TOOL_LABELS.filter(([k]) => !(borderMode && k === "white")).map(([k, label]) => (
          <button key={k} type="button" className={t === k ? "tab active" : "tab"} aria-pressed={t === k} onClick={() => setTools({ tool: k })}>{label}</button>
        ))}
      </div>

      {t === "shape" && (
        <>
          <div className="seg" role="group" aria-label="Shape">
            {SHAPES.map(([k, icon, label]) => (
              <button key={k} type="button" className={tools.shapeKind === k ? "tab active shape-btn" : "tab shape-btn"} aria-pressed={tools.shapeKind === k}
                aria-label={label} title={label} onClick={() => setTools({ shapeKind: k })}>{icon}</button>
            ))}
          </div>
          {tools.shapeKind !== "line" && (
            <div className="seg" role="group" aria-label="Outline or filled">
              <button type="button" className={!tools.filled ? "tab active" : "tab"} aria-pressed={!tools.filled} onClick={() => setTools({ filled: false })}>Outline</button>
              <button type="button" className={tools.filled ? "tab active" : "tab"} aria-pressed={tools.filled} onClick={() => setTools({ filled: true })}>Filled</button>
            </div>
          )}
          <p className="hint">Press and drag on the preview. Hold Shift for a perfect circle / square (or a straight 45° line).</p>
        </>
      )}
      {t === "fill" && <p className="hint">Click an area to fill it (everything connected that is the same colour).</p>}
      {usesInk && (
        <div className="seg" role="group" aria-label="Paint with">
          {inks.map((k) => (
            <button key={k} type="button" className={tools.ink === k ? "tab active" : "tab"} aria-pressed={tools.ink === k} onClick={() => setTools({ ink: k })}>
              {k === "black" ? "Black" : k === "white" ? "White" : "Dither"}
            </button>
          ))}
        </div>
      )}

      {(isBrush || (t === "shape" && (!tools.filled || tools.shapeKind === "line"))) && (
        <label>{t === "shape" ? "Line width" : "Size"} {tools.size}px
          <input type="range" min={1} max={64} value={tools.size} onChange={(e) => setTools({ size: +e.target.value })} />
        </label>
      )}
      {isBrush && (
        <div className="seg" role="group" aria-label="Brush shape">
          {(["square", "circle"] as BrushShape[]).map((s) => (
            <button key={s} type="button" className={tools.shape === s ? "tab active" : "tab"} aria-pressed={tools.shape === s} onClick={() => setTools({ shape: s })}>
              {s === "square" ? "■ Square" : "● Circle"}
            </button>
          ))}
        </div>
      )}
      {showAmount && (
        <label>Amount {Math.round((tools.amount / 64) * 100)}%
          <input type="range" min={1} max={63} value={tools.amount} onChange={(e) => setTools({ amount: +e.target.value })} />
        </label>
      )}
      {t === "stamp" && (
        <>
          <div className="stamps" role="group" aria-label="Stamp shape">
            <button type="button" className={tools.stamp === "heart" ? "stamp active" : "stamp"} aria-pressed={tools.stamp === "heart"} onClick={() => setTools({ stamp: "heart" })} title="Heart">♥</button>
            {stamps.map((s) => (
              <button key={s.info.id} type="button" className={tools.stamp === s.info.id ? "stamp active" : "stamp"} aria-pressed={tools.stamp === s.info.id}
                onClick={() => setTools({ stamp: s.info.id })} title={s.info.name}>
                <img src={s.url} alt={s.info.name} />
              </button>
            ))}
          </div>
          <label>Stamp size {tools.stampSize}px
            <input type="range" min={8} max={200} value={tools.stampSize} onChange={(e) => setTools({ stampSize: +e.target.value })} />
          </label>
          <label className="file">Upload a stamp (PNG or JPEG, up to 2 MB; dark = ink, light or transparent = nothing)
            <input type="file" disabled={busy} accept="image/png,image/jpeg" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadStamp(file);
            }} />
          </label>
        </>
      )}
      {t === "select" && (
        <>
          <p className="hint">Drag a box around part of your drawing. Then drag it to move it, pull the square handles to resize, or the round handle on top to rotate (Shift snaps to 15°). Enter applies, Esc puts it back.</p>
          {floating && (
            <div className="row">
              <button type="button" className="primary" onClick={onApply}>Apply</button>
              <button type="button" onClick={onCancel}>Cancel</button>
              <button type="button" onClick={onDelete}>Delete</button>
            </div>
          )}
        </>
      )}

      <div className="row">
        <button type="button" onClick={onClear}>{clearLabel}</button>
      </div>
    </div>
  );
}
