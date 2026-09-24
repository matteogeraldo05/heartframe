// Settings.tsx - frame behaviour, tokens, publishing status, firmware (OTA).
import { useEffect, useState } from "react";

import { bytesToBase64 } from "../../shared/format";
import type { DeviceSettings, StatusInfo } from "../../shared/types";
import { TIMEZONES } from "../../shared/types";
import { api, when } from "../api";

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
        <p className="muted">No Wi-Fi checks and no glowing heart during quiet hours.</p>
        <div className="row">
          <label>Heart colour <input type="color" value={s.ledColor} onChange={(e) => set({ ledColor: e.target.value })} /></label>
          <label>Brightness <input type="range" min={20} max={200} value={s.ledMax} onChange={num("ledMax")} /></label>
          <label>Pulse (ms) <input type="number" min={1000} max={30000} step={500} value={s.ledMs} onChange={num("ledMs")} /></label>
        </div>
        <p className="muted">LEDs render colour differently from screens: keep green near 0 for hot pink. Tune it with the frame's <code>led r g b</code> console command, then copy the values here.</p>
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
  );
}
