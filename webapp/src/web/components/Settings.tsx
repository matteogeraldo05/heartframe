// Settings.tsx - frame behaviour, your uploads, publishing status, tokens, firmware (OTA).
import { useEffect, useState } from "react";

import { bytesToBase64 } from "../../shared/format";
import type { DeviceSettings, StatusInfo, UploadKind } from "../../shared/types";
import { TIMEZONES } from "../../shared/types";
import { api, when } from "../api";
import { loadUploads, useUploads, type UploadEntry } from "../render/uploads";

function daysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  const t = Date.parse(expiry.replace(" UTC", "Z").replace(" ", "T"));
  return Number.isNaN(t) ? null : Math.floor((t - Date.now()) / 86400000);
}

function Expiry({ label, expiry }: { label: string; expiry: string | null }) {
  const d = daysLeft(expiry);
  const cls = d !== null && d < 30 ? "warn" : "muted";
  return <p className={cls}>{label}: {expiry ? `expires ${expiry} (${d} days)` : "no expiry reported"}</p>;
}

const KIND_LABEL: Record<UploadKind, string> = { font: "Fonts", stamp: "Stamps", border: "Borders" };
const FALLBACK: Record<UploadKind, string> = {
  font: "they keep their saved image, and switch to the default font when you edit them",
  stamp: "",
  border: "they keep their saved image, and switch to no border when you edit them",
};

function UploadItem({ u, onDeleted, onError }: { u: UploadEntry; onDeleted: (name: string) => void; onError: (msg: string) => void }) {
  const used = u.info.usedBy;
  const remove = () => {
    const who = used.length
      ? `\n\nStill used by ${used.length} saved message${used.length > 1 ? "s" : ""}: ${used.slice(0, 5).map((m) => `"${m.title}"`).join(", ")}${used.length > 5 ? "…" : ""}.\nIf you delete it, ${FALLBACK[u.info.kind]}.`
      : "";
    if (!confirm(`Delete "${u.info.name}"?${who}`)) return;
    api.removeUpload(u.info.id).then(() => loadUploads()).then(() => onDeleted(u.info.name), (e: Error) => onError(e.message));
  };
  return (
    <li className="upload">
      <div className="upload-preview">
        {u.info.kind === "font"
          ? (u.font ? <span style={{ fontFamily: `"${u.font.family}"` }}>Aa Bb ♥</span> : <span className="muted">?</span>)
          : <img src={u.url} alt="" />}
      </div>
      <div className="grow">
        <b>{u.info.name}</b>
        <div className="muted">
          {Math.max(1, Math.round(u.info.size / 1024))} KB{u.info.kind === "border" ? ` · text margin ${u.info.inset}px` : ""}
          {u.broken ? " · couldn't be loaded" : ""}
        </div>
        {used.length > 0 && <div className="warn">Used by {used.length} message{used.length > 1 ? "s" : ""}</div>}
      </div>
      <button type="button" onClick={remove} aria-label={`Delete ${u.info.name}`}>Delete</button>
    </li>
  );
}

function CustomUploads() {
  const all = useUploads();
  const [note, setNote] = useState("");
  useEffect(() => { loadUploads().catch(() => {}); }, []); // fresh "used by" counts
  return (
    <section className="card stack">
      <h2>Custom uploads</h2>
      {!all.length && <p className="muted">Nothing yet. Upload fonts in Write → Text, stamps in Write → Draw, and make borders in Write → Border.</p>}
      {(["font", "stamp", "border"] as UploadKind[]).map((k) => {
        const items = all.filter((u) => u.info.kind === k);
        if (!items.length) return null;
        return (
          <div key={k}>
            <h3 className="section-label">{KIND_LABEL[k]}</h3>
            <ul className="uploads">
              {items.map((u) => <UploadItem key={u.info.id} u={u} onDeleted={(n) => setNote(`Deleted "${n}".`)} onError={setNote} />)}
            </ul>
          </div>
        );
      })}
      {note && <p className="note">{note}</p>}
    </section>
  );
}

export function Settings() {
  const [s, setS] = useState<DeviceSettings | null>(null);
  const [st, setSt] = useState<StatusInfo | null>(null);
  const [msg, setMsg] = useState("");
  const [token, setToken] = useState("");
  const [fwBin, setFwBin] = useState<File | null>(null);
  const [fwJson, setFwJson] = useState<File | null>(null);

  const load = () => {
    api.settings().then(setS).catch((e: Error) => setMsg(e.message));
    api.status().then(setSt).catch(() => {});
  };
  useEffect(load, []);
  if (!s) return <p className="muted">loading…</p>;
  const set = (patch: Partial<DeviceSettings>) => setS({ ...s, ...patch });
  const num = (k: keyof DeviceSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: +e.target.value } as Partial<DeviceSettings>);

  return (
    <div className="settings">
      <div className="settings-col">
        <section className="card stack">
          <h2>Frame behaviour</h2>
          <label>Time zone
            <select value={s.tzName} onChange={(e) => set({ tzName: e.target.value })}>
              {TIMEZONES.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
            </select>
          </label>
          <label>Check for messages every (minutes, on battery) <input type="number" min={15} max={720} value={s.checkMin} onChange={num("checkMin")} /></label>
          <label>…and when plugged in <input type="number" min={5} max={720} value={s.checkUsbMin} onChange={num("checkUsbMin")} /></label>
          <div className="row">
            <label>Quiet from <input type="time" value={s.quietStart} onChange={(e) => set({ quietStart: e.target.value })} /></label>
            <label>until <input type="time" value={s.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} /></label>
          </div>
          <p className="muted">No Wi-Fi checks during quiet hours.</p>
          <div className="row">
            <label>Queue: one message every <input type="number" min={1} max={14} value={s.queueEveryDays} onChange={num("queueEveryDays")} /> day(s)</label>
            <label>at <input type="time" value={s.queueTime} onChange={(e) => set({ queueTime: e.target.value })} /></label>
          </div>
          <label>Heartbeat URL (healthchecks.io, optional) <input value={s.heartbeatUrl} placeholder="https://hc-ping.com/…" onChange={(e) => set({ heartbeatUrl: e.target.value.trim() })} /></label>
          <label>Heartbeat every (hours) <input type="number" min={1} max={48} value={s.heartbeatHours} onChange={num("heartbeatHours")} /></label>
          <button className="primary" onClick={() => api.saveSettings(s).then((x) => { setS(x); setMsg("Saved - the frame picks it up at its next check."); }).catch((e: Error) => setMsg(e.message))}>Save settings</button>
          {msg && <p className="note">{msg}</p>}
        </section>

        <section className="card stack">
          <h2>Replace the frame's token</h2>
          <p className="muted">Create a new fine-grained token (read-only, messages repo only), paste it here. It travels to the frame inside the encrypted manifest; the frame tests it before switching. Do this before the old one expires, then revoke the old one on GitHub a few days later.</p>
          <input type="password" value={token} placeholder="github_pat_…" onChange={(e) => setToken(e.target.value.trim())} autoComplete="off" />
          <button disabled={!token} onClick={() => api.rotateToken(token).then((r) => { setToken(""); setMsg(`Token queued for the frame (expires ${r.expiry ?? "never"}).`); load(); }).catch((e: Error) => setMsg(e.message))}>Send new token to the frame</button>
        </section>

        <section className="card stack">
          <h2>Firmware update (optional)</h2>
          <p className="muted">Upload <code>firmware.bin</code> and the <code>firmware.bin.json</code> made by <code>tools/ota_keys.py sign</code>. The frame installs it only if the signature checks out, with at least 40 % battery or on USB.</p>
          {st?.firmware && <p>Published: build {st.firmware.ver} ({st.firmware.name}) <button onClick={() => api.removeFirmware().then(load)}>Withdraw</button></p>}
          <input type="file" accept=".bin" onChange={(e) => setFwBin(e.target.files?.[0] ?? null)} />
          <input type="file" accept=".json" onChange={(e) => setFwJson(e.target.files?.[0] ?? null)} />
          <button disabled={!fwBin || !fwJson} onClick={async () => {
            try {
              const info = JSON.parse(await fwJson!.text());
              const bin = bytesToBase64(new Uint8Array(await fwBin!.arrayBuffer()));
              await api.uploadFirmware(bin, info);
              setMsg("Firmware published.");
              load();
            } catch (e) { setMsg((e as Error).message); }
          }}>Publish firmware</button>
        </section>
      </div>
      <div className="settings-col">
        <CustomUploads />
        <section className="card stack">
          <h2>Publishing</h2>
          {st && (
            <>
              <p className="muted">Repo: {st.repo}{st.pending ? " · publish pending…" : ""}</p>
              <Expiry label="Server (write) token" expiry={st.serverTokenExpiry} />
              <Expiry label={`Frame (read) token, generation ${st.deviceTokenGen}`} expiry={st.deviceTokenExpiry} />
              <button onClick={() => api.publish().then(load).catch((e: Error) => setMsg(e.message))}>Publish now</button>
              <ul className="log">
                {st.log.map((l, i) => <li key={i} className={l.ok ? "" : "error"}>{when(l.at)} - {l.detail}</li>)}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
