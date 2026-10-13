// DrawTools.tsx - brushes, stamps, selection, undo/redo. Used by the Draw tab and for custom borders.
import { useState } from "react";

import { api } from "../api";
import type { BrushShape } from "../render/layer";
import { loadUploads, useUploads } from "../render/uploads";
import { readUpload } from "./util";

export type Tool = "pen" | "white" | "erase" | "dither" | "stamp" | "select";

export interface ToolState {
  tool: Tool;
  size: number;          // brush px, 1..64
  shape: BrushShape;
  amount: number;        // dither pen density, 1..63 of 64
  stamp: string;         // "heart" or an upload id
  stampSize: number;     // px
}

export const DEFAULT_TOOLS: ToolState = { tool: "pen", size: 4, shape: "circle", amount: 32, stamp: "heart", stampSize: 32 };

const TOOL_LABELS: [Tool, string][] = [
  ["pen", "Black pen"], ["white", "White pen"], ["erase", "Eraser"], ["dither", "Dither pen"], ["stamp", "Stamp"], ["select", "Select"],
];

export function DrawTools({ tools, setTools, canUndo, canRedo, onUndo, onRedo, onClear, clearLabel, floating, onApply, onCancel, onDelete, borderMode, onNote }: {
  tools: ToolState;
  setTools: (patch: Partial<ToolState>) => void;
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void; onClear: () => void;
  clearLabel: string;
  floating: boolean;
  onApply: () => void; onCancel: () => void; onDelete: () => void;
  borderMode?: boolean;  // borders are black ink only: no white pen
  onNote: (s: string) => void;
}) {
  const stamps = useUploads().filter((u) => u.info.kind === "stamp" && u.img);
  const [busy, setBusy] = useState(false);
  const t = tools.tool;
  const isBrush = t === "pen" || t === "white" || t === "erase" || t === "dither";

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

      {isBrush && (
        <>
          <label>Size {tools.size}px
            <input type="range" min={1} max={64} value={tools.size} onChange={(e) => setTools({ size: +e.target.value })} />
          </label>
          <div className="seg" role="group" aria-label="Brush shape">
            {(["square", "circle"] as BrushShape[]).map((s) => (
              <button key={s} type="button" className={tools.shape === s ? "tab active" : "tab"} aria-pressed={tools.shape === s} onClick={() => setTools({ shape: s })}>
                {s === "square" ? "■ Square" : "● Circle"}
              </button>
            ))}
          </div>
        </>
      )}
      {t === "dither" && (
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
          <p className="hint">Drag a box around part of your drawing, then drag it to move it or pull the handles to resize. Enter applies, Esc puts it back.</p>
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
        <button type="button" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl/Cmd+Z)">↶ Undo</button>
        <button type="button" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button>
        <button type="button" onClick={onClear}>{clearLabel}</button>
      </div>
    </div>
  );
}
