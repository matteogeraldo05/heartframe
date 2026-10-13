// PhotoTab.tsx - add a photo, choose how it's dithered; drag it on the preview to move it.
import type { MessageDoc, PhotoLayer } from "../../shared/types";

const ALGOS: [PhotoLayer["algo"], string][] = [
  ["atkinson", "Atkinson (best for faces)"],
  ["floyd", "Floyd–Steinberg (smooth)"],
  ["stucki", "Stucki (smoothest)"],
  ["bayer2", "Bayer 2 × 2 (coarse pattern)"],
  ["bayer4", "Bayer 4 × 4 (pattern)"],
  ["bayer8", "Bayer 8 × 8 (fine pattern)"],
  ["threshold", "Threshold (line art)"],
];

export function PhotoTab({ doc, hasPhoto, setPhotoLayer, onPick, onRemove }: {
  doc: MessageDoc;
  hasPhoto: boolean;
  setPhotoLayer: (patch: Partial<PhotoLayer>) => void;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const p = doc.photo;
  return (
    <div className="stack">
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) onPick(file);
      }} />
      {hasPhoto && p && (
        <>
          <p className="hint">Drag the photo on the preview to move it.</p>
          <label>Dithering
            {/* "bayer" (older messages) is the same 4x4 matrix as bayer4 */}
            <select value={p.algo === "bayer" ? "bayer4" : p.algo} onChange={(e) => setPhotoLayer({ algo: e.target.value as PhotoLayer["algo"] })}>
              {ALGOS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          <label>Size
            <select value={p.fit} onChange={(e) => setPhotoLayer({ fit: e.target.value as PhotoLayer["fit"] })}>
              <option value="cover">Fill the frame</option><option value="contain">Fit the whole photo</option>
            </select>
          </label>
          {([
            ["zoom", "Zoom", 1, 4, 0.05], ["brightness", "Brightness", -100, 100, 1], ["contrast", "Contrast", -100, 100, 1], ["gamma", "Gamma", 0.4, 2.5, 0.05],
          ] as const).map(([k, label, min, max, step]) => (
            <label key={k}>{label} {Number(p[k]).toFixed(step < 1 ? 2 : 0)}
              <input type="range" min={min} max={max} step={step} value={p[k]} onChange={(e) => setPhotoLayer({ [k]: +e.target.value })} />
            </label>
          ))}
          {p.algo === "threshold" && (
            <label>Threshold {p.threshold}
              <input type="range" min={0} max={255} value={p.threshold} onChange={(e) => setPhotoLayer({ threshold: +e.target.value })} />
            </label>
          )}
          <label className="check"><input type="checkbox" checked={p.sharpen} onChange={(e) => setPhotoLayer({ sharpen: e.target.checked })} /> Sharpen</label>
          <label className="check"><input type="checkbox" checked={p.invert} onChange={(e) => setPhotoLayer({ invert: e.target.checked })} /> Invert photo</label>
          <div className="row">
            <button type="button" onClick={() => setPhotoLayer({ panX: 0, panY: 0, offsetX: undefined, offsetY: undefined })}>Centre photo</button>
            <button type="button" onClick={onRemove}>Remove photo</button>
          </div>
        </>
      )}
      <p className="muted">Photos are shrunk and re-encoded in your browser (location data stripped) before upload. The server never decodes them.</p>
    </div>
  );
}
