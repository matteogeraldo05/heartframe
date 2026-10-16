// TextTab.tsx - message text, font, formatting, background behind the text, invert.
import { useState } from "react";

import { uploadRef, type MessageDoc, type TextBackground, type TextLayer } from "../../shared/types";
import { api } from "../api";
import { textBackground } from "../render/compose";
import { FONTS, fontInfo } from "../render/fonts";
import { loadUploads, useUploads } from "../render/uploads";
import { readUpload } from "./util";

const BACKGROUNDS: [TextBackground, string][] = [
  ["none", "None"], ["box", "Solid box"], ["lines", "Box per line"], ["outline", "White outline"],
];

export function TextTab({ doc, setDoc, fontPx, onNote }: {
  doc: MessageDoc;
  setDoc: (fn: (d: MessageDoc) => MessageDoc) => void;
  fontPx: number;
  onNote: (s: string) => void;
}) {
  const t = doc.text;
  const setText = (patch: Partial<TextLayer>) => setDoc((d) => ({ ...d, text: { ...d.text, ...patch } }));
  const uploads = useUploads().filter((u) => u.info.kind === "font" && u.font);
  const [busy, setBusy] = useState(false);
  const f = fontInfo(t.font);
  const tooSmall = fontPx > 0 && fontPx < f.minPx;
  const bg = textBackground(t);

  const toggle = (k: "bold" | "italic" | "underline" | "strike" | "bullets", label: React.ReactNode, title: string) => (
    <button type="button" className={t[k] ? "fmt active" : "fmt"} aria-pressed={!!t[k]} aria-label={title} title={title} onClick={() => setText({ [k]: !t[k] })}>{label}</button>
  );

  const uploadFont = async (file: File) => {
    setBusy(true);
    try {
      const { b64, name } = await readUpload(file, ["ttf", "otf", "woff", "woff2"]);
      const info = await api.upload({ kind: "font", name, data: b64 });
      await loadUploads();
      setText({ font: uploadRef(info.id) });
      onNote(`Font "${name}" added.`);
    } catch (e) {
      onNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <textarea rows={5} value={t.content} onChange={(e) => setText({ content: e.target.value })} placeholder="Write your message…" />
      <label>Font
        <select value={t.font} onChange={(e) => setText({ font: e.target.value })}>
          <optgroup label="Clean">
            {FONTS.filter((x) => x.group === "clean").map((x) => <option key={x.family} value={x.family}>{x.label}</option>)}
          </optgroup>
          <optgroup label="Script / handwriting">
            {FONTS.filter((x) => x.group === "script").map((x) => <option key={x.family} value={x.family}>{x.label}</option>)}
          </optgroup>
          {uploads.length > 0 && (
            <optgroup label="Uploaded">
              {uploads.map((u) => <option key={u.info.id} value={u.font!.ref}>{u.info.name}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <label className="file">Upload a font (TTF, OTF, WOFF, WOFF2, up to 2 MB)
        <input type="file" disabled={busy} accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void uploadFont(file);
        }} />
      </label>
      <div className="fmt-bar" role="group" aria-label="Formatting">
        {toggle("bold", <b>B</b>, "Bold")}
        {toggle("italic", <i>I</i>, "Italic")}
        {toggle("underline", <u>U</u>, "Underline")}
        {toggle("strike", <s>S</s>, "Strikethrough")}
        {toggle("bullets", "• List", "Bullet points")}
      </div>
      <label>Size {t.size === 0 ? (fontPx ? `(auto: ${fontPx}px)` : "(auto)") : `${t.size}px`}
        <input type="range" min={0} max={140} value={t.size} onChange={(e) => setText({ size: +e.target.value })} />
      </label>
      {tooSmall && <p className="warn">This font breaks up below ~{f.minPx}px on e-paper. Use fewer words, a bolder font, or thicken it below.</p>}
      <label>Thicken (helps thin script fonts) {t.stroke}px
        <input type="range" min={0} max={4} step={0.5} value={t.stroke} onChange={(e) => setText({ stroke: +e.target.value })} />
      </label>
      <label>Line spacing {t.lineHeight.toFixed(2)}
        <input type="range" min={0.8} max={2} step={0.05} value={t.lineHeight} onChange={(e) => setText({ lineHeight: +e.target.value })} />
      </label>
      <div className="row">
        <label>Align
          <select value={t.align} onChange={(e) => setText({ align: e.target.value as TextLayer["align"] })}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </select>
        </label>
        <label>Position
          <select value={t.valign} onChange={(e) => setText({ valign: e.target.value as TextLayer["valign"] })}>
            <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
          </select>
        </label>
      </div>
      {t.content.trim() && (
        <div className="row">
          <p className="hint grow">Drag the text on the preview to move it.</p>
          {(t.dx || t.dy) ? <button type="button" onClick={() => setText({ dx: undefined, dy: undefined })}>Reset position</button> : null}
        </div>
      )}
      <fieldset className="choices">
        <legend>Text background</legend>
        <div className="seg">
          {BACKGROUNDS.map(([v, label]) => (
            <button key={v} type="button" className={bg === v ? "tab active" : "tab"} aria-pressed={bg === v}
              onClick={() => setText({ background: v, whiteBehind: undefined })}>{label}</button>
          ))}
        </div>
        {bg === "outline" && (
          <label>Outline width {t.outline ?? 3}px
            <input type="range" min={1} max={8} step={1} value={t.outline ?? 3} onChange={(e) => setText({ outline: +e.target.value })} />
          </label>
        )}
      </fieldset>
      <label>Signature (bottom right)
        <input value={doc.signature} maxLength={40} onChange={(e) => { const v = e.target.value; setDoc((d) => ({ ...d, signature: v })); }} placeholder="- M" />
      </label>
      <label className="check">
        <input type="checkbox" checked={!!doc.invert} onChange={(e) => { const v = e.target.checked; setDoc((d) => ({ ...d, invert: v })); }} />
        Invert colours (white on black)
      </label>
    </div>
  );
}
