// api.ts - tiny fetch wrapper. Every mutating call sends X-HF-CSRF (see server/auth.ts).
import type { DeviceSettings, MessageFull, MessageSummary, SaveMessageRequest, StatusInfo } from "../shared/types";

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "X-HF-CSRF": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && url !== "/api/login") window.dispatchEvent(new Event("hf-logout"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status);
  return data as T;
}

export const api = {
  login: (password: string) => call<{ ok: true }>("POST", "/api/login", { password }),
  logout: () => call<{ ok: true }>("POST", "/api/logout", {}),
  me: () => call<{ ok: true }>("GET", "/api/me"),
  list: () => call<MessageSummary[]>("GET", "/api/messages"),
  get: (id: string) => call<MessageFull>("GET", `/api/messages/${id}`),
  create: (m: SaveMessageRequest) => call<MessageSummary>("POST", "/api/messages", m),
  update: (id: string, m: SaveMessageRequest) => call<MessageSummary>("PUT", `/api/messages/${id}`, m),
  duplicate: (id: string) => call<MessageSummary>("POST", `/api/messages/${id}/duplicate`, {}),
  queue: (id: string) => call<MessageSummary>("POST", `/api/messages/${id}/queue`, {}),
  schedule: (id: string, showAt: number) => call<MessageSummary>("POST", `/api/messages/${id}/schedule`, { showAt }),
  sendNow: (id: string) => call<MessageSummary>("POST", `/api/messages/${id}/send-now`, {}),
  unschedule: (id: string) => call<MessageSummary>("POST", `/api/messages/${id}/unschedule`, {}),
  remove: (id: string) => call<{ ok: true }>("DELETE", `/api/messages/${id}`),
  reorder: (ids: string[]) => call<{ ok: true }>("POST", "/api/queue/order", { ids }),
  settings: () => call<DeviceSettings>("GET", "/api/settings"),
  saveSettings: (s: DeviceSettings) => call<DeviceSettings>("PUT", "/api/settings", s),
  rotateToken: (token: string) => call<{ ok: true; expiry: string | null }>("POST", "/api/device-token", { token }),
  status: () => call<StatusInfo>("GET", "/api/status"),
  publish: () => call<{ ok: true }>("POST", "/api/publish", {}),
  uploadFirmware: (bin: string, info: unknown) => call<{ ok: true }>("POST", "/api/firmware", { bin, info }),
  removeFirmware: () => call<{ ok: true }>("DELETE", "/api/firmware"),
};

export function when(ts: number | null): string {
  if (ts === null) return "-";
  return new Date(ts * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
