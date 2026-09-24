// types.ts - shapes shared by the React UI and the server API.

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type DitherAlgo = "atkinson" | "floyd" | "bayer" | "threshold";

export interface TextLayer {
  content: string;
  font: string;          // one of FONTS[].family
  size: number;          // px; 0 = auto-fit
  align: Align;
  valign: VAlign;
  lineHeight: number;    // multiple of font size
  stroke: number;        // 0-4 px faux-bold: thickens thin script fonts so 1-bit pixels don't break up
  whiteBehind: boolean;  // white box behind text (useful over photos)
}

export interface PhotoLayer {
  fit: "cover" | "contain";
  zoom: number;          // 1 = fit
  offsetX: number;       // -1..1 pan
  offsetY: number;
  brightness: number;    // -100..100
  contrast: number;      // -100..100
  gamma: number;         // 0.5..2.5
  algo: DitherAlgo;
  threshold: number;     // 0..255 (threshold algo)
  sharpen: boolean;
  invert: boolean;
}

export interface MessageDoc {
  v: 1;
  text: TextLayer;
  template: string;      // one of TEMPLATES[].id
  photo: PhotoLayer | null;
  drawing: { black: string; white: string } | null; // base64 packed 1-bit masks
  signature: string;     // small line bottom-right, e.g. "- M"
}

export type MessageStatus = "draft" | "queued" | "scheduled" | "shown";

export interface MessageSummary {
  id: string;
  title: string;
  status: MessageStatus;
  showAt: number | null;   // unix seconds
  surprise: boolean;
  queuePos: number | null;
  hasPhoto: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MessageFull extends MessageSummary {
  doc: MessageDoc;
}

export interface SaveMessageRequest {
  title: string;
  doc: MessageDoc;
  bitmap: string;          // base64 of 15000 packed bytes
  photo?: string | null;   // base64 JPEG (browser-normalised), null = remove, undefined = keep
}

export interface DeviceSettings {
  tzName: string;          // IANA, e.g. America/Toronto (server-side scheduling)
  checkMin: number;
  checkUsbMin: number;
  quietStart: string;      // "23:00"
  quietEnd: string;        // "07:00"
  ledColor: string;        // "#ff0848"
  ledMax: number;          // 0..255
  ledMs: number;
  heartbeatUrl: string;    // https://hc-ping.com/<uuid> or ""
  heartbeatHours: number;
  queueTime: string;       // "07:30" daily slot for queued messages
  queueEveryDays: number;
}

export interface StatusInfo {
  lastPublish: { at: number; ok: boolean; detail: string } | null;
  log: { at: number; ok: boolean; detail: string }[];
  serverTokenExpiry: string | null;
  deviceTokenGen: number;
  deviceTokenExpiry: string | null;
  firmware: { ver: number; name: string } | null;
  repo: string;
  pending: boolean;
}

export const TIMEZONES: { name: string; posix: string; label: string }[] = [
  { name: "America/Toronto", posix: "EST5EDT,M3.2.0,M11.1.0", label: "Eastern (Toronto)" },
  { name: "America/Halifax", posix: "AST4ADT,M3.2.0,M11.1.0", label: "Atlantic (Halifax)" },
  { name: "America/St_Johns", posix: "NST3:30NDT,M3.2.0,M11.1.0", label: "Newfoundland" },
  { name: "America/Winnipeg", posix: "CST6CDT,M3.2.0,M11.1.0", label: "Central (Winnipeg)" },
  { name: "America/Edmonton", posix: "MST7MDT,M3.2.0,M11.1.0", label: "Mountain (Edmonton)" },
  { name: "America/Vancouver", posix: "PST8PDT,M3.2.0,M11.1.0", label: "Pacific (Vancouver)" },
];
