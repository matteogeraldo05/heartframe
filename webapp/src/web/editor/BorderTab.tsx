// BorderTab.tsx - pick a border, or make your own (draw it, or upload a 400 x 300 PNG) and save it.
import type { ReactNode } from "react";

import { uploadRef, type MessageDoc } from "../../shared/types";
import { TEMPLATES } from "../render/shapes";
import { useUploads } from "../render/uploads";

export interface BorderDraft { name: string; inset: number }

export function BorderTab({ doc, setTemplate, showOverlay, setShowOverlay, draft, setDraft, onStartDraw, onUploadPng, onSave, busy, tools }: {
  doc: MessageDoc;
  setTemplate: (id: string) => void;
  showOverlay: boolean;
  setShowOverlay: (v: boolean) => void;
  draft: BorderDraft | null;
  setDraft: (d: BorderDraft | null) => void;
  onStartDraw: () => void;
  onUploadPng: (file: File) => void;
  onSave: () => void;
  busy: boolean;
  tools: ReactNode;      // the drawing tools, shown while making a border
}) {
  const mine = useUploads().filter((u) => u.info.kind === "border" && u.mask);
  return (
    <div className="stack">
      {!draft && (
        <label>Border
          <select value={doc.template} onChange={(e) => setTemplate(e.target.value)}>
            <optgroup label="Built in">
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </optgroup>
            {mine.length > 0 && (
              <optgroup label="My borders">
                {mine.map((u) => <option key={u.info.id} value={uploadRef(u.info.id)}>{u.info.name}</option>)}
              </optgroup>
            )}
          </select>
        </label>
      )}
      <label className="check"><input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} /> Show where the battery indicator goes</label>

      <fieldset className="choices">
        <legend>Make your own border</legend>
        {!draft ? (
          <>
            <p className="muted">Draw one with the drawing tools, or start from a 400 × 300 PNG (other sizes get stretched). Black is the border; white is see-through.</p>
            <div className="row">
              <button type="button" onClick={onStartDraw}>Draw a border</button>
            </div>
            <label className="file">Or upload a PNG / JPEG
              <input type="file" accept="image/png,image/jpeg" onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onUploadPng(file);
              }} />
            </label>
          </>
        ) : (
          <>
            <p className="hint">Drawing on the border layer. Your message's own drawing is not touched.</p>
            <label>Name
              <input value={draft.name} maxLength={60} placeholder="e.g. Stars" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label>Text margin {draft.inset}px (keeps the text inside the border)
              <input type="range" min={0} max={100} value={draft.inset} onChange={(e) => setDraft({ ...draft, inset: +e.target.value })} />
            </label>
            {tools}
            <div className="row">
              <button type="button" className="primary" disabled={busy || !draft.name.trim()} onClick={onSave}>Save border</button>
              <button type="button" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
