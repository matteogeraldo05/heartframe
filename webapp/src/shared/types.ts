// types.ts - shapes shared by the React UI and the server API.

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
// "bayer" is the old name of bayer4 (same matrix); kept so older messages still validate.
export type DitherAlgo = "atkinson" | "floyd" | "stucki" | "bayer2" | "bayer4" | "bayer8" | "threshold" | "bayer";
export type TextBackground = "none" | "box" | "lines" | "outline";

export interface TextLayer {
  content: string;
  font: string;          // one of FONTS[].family, or "upload:<id>" for an uploaded font
  size: number;          // px; 0 = auto-fit
  align: Align;
  valign: VAlign;
  lineHeight: number;    // multiple of font size
  stroke: number;        // 0-4 px faux-bold: thickens thin script fonts so 1-bit pixels don't break up
  whiteBehind?: boolean; // legacy: true = background "box" (messages saved before `background` existed)
  // Added later; all optional so older messages render exactly as before.
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  bullets?: boolean;
  background?: TextBackground;
  outline?: number;      // white outline width in px (background "outline")
  dx?: number;           // text block moved by dragging, in canvas px (0 / missing = where layout puts it)
  dy?: number;
}

export interface PhotoLayer {
  fit: "cover" | "contain";
  zoom: number;          // scale factor, 1 = fit (the slider shows -5..5, see editor/history.ts)
  offsetX?: number;      // legacy -1..1 pan, used only while panX/panY are unset
  offsetY?: number;
  panX?: number;         // photo centre offset from the canvas centre, in canvas px (drag to move)
  panY?: number;
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
  template: string;      // one of TEMPLATES[].id, or "upload:<id>" for a custom border
  photo: PhotoLayer | null;
  drawing: { black: string; white: string } | null; // base64 packed 1-bit masks
  signature: string;     // small line bottom-right, e.g. "- M"
  invert?: boolean;      // invert the final image (white on black)
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
  favourite: boolean;
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
  // The heart LEDs were removed from the hardware. These stay optional so the stored
  // values keep going into the manifest (the firmware treats them as optional).
  ledColor?: string;       // "#ff0848"
  ledMax?: number;         // 0..255
  ledMs?: number;
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

export type UploadKind = "font" | "stamp" | "border";

export interface UploadInfo {
  id: string;
  kind: UploadKind;
  name: string;            // display name you chose (the file on disk has a generated name)
  mime: string;
  size: number;
  createdAt: number;
  inset: number | null;    // borders: text margin in px
  usedBy: { id: string; title: string }[]; // saved messages that use this font/border
}

export interface UploadRequest {
  kind: UploadKind;
  name: string;
  data: string;            // base64 file contents
  inset?: number;
}

export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const uploadRef = (id: string) => `upload:${id}`;

export const TIMEZONES: { name: string; posix: string; label: string }[] = [
  { name: "America/Toronto", posix: "EST5EDT,M3.2.0,M11.1.0", label: "Eastern (Toronto)" },
  { name: "America/Halifax", posix: "AST4ADT,M3.2.0,M11.1.0", label: "Atlantic (Halifax)" },
  { name: "America/St_Johns", posix: "NST3:30NDT,M3.2.0,M11.1.0", label: "Newfoundland" },
  { name: "America/Winnipeg", posix: "CST6CDT,M3.2.0,M11.1.0", label: "Central (Winnipeg)" },
  { name: "America/Edmonton", posix: "MST7MDT,M3.2.0,M11.1.0", label: "Mountain (Edmonton)" },
  { name: "America/Vancouver", posix: "PST8PDT,M3.2.0,M11.1.0", label: "Pacific (Vancouver)" },
];
