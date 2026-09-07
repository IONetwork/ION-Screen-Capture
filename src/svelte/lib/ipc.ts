// Typed wrappers over the Tauri command/event surface.
// Types mirror the serde DTOs in `src-tauri/src/{events,commands,instrument,discovery}`.
// The app's sole feature is screen capture - no measurement/readout.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Human message from a Tauri command rejection (our errors serialize to { kind, message }). */
export function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

export type Vendor = "rigol" | "siglent" | "keysight" | "tektronix" | "unknown";
export type InstrumentClass = "oscilloscope" | "dmm" | "awg" | "other";
export type ImageFormat = "PNG" | "BMP24" | "BMP8" | "JPEG" | "TIFF";
export type DiscoverySource = "mdns" | "sweep" | "vxi11";
/** Working space the colour reducer measures distance in. */
export type ColorSpace = "oklab" | "srgb" | "linear";

export interface Idn {
  manufacturer: string;
  model: string;
  serial: string;
  firmware: string;
  raw: string;
}

export interface ConnectionInfo {
  addr: string;
  vendor: Vendor;
  class: InstrumentClass;
  idn: Idn;
  supportedFormats: ImageFormat[];
  supportsColor: boolean;
  supportsInvert: boolean;
}

export interface CaptureRequest {
  /** What we ask the instrument to produce. */
  format: ImageFormat;
  color: boolean;
  invert: boolean;
  saveDir?: string | null;
  copyToClipboard: boolean;
  /**
   * "Reduced Color". The backend defers the save and the clipboard copy so they
   * get the reduced image; the frontend owes it a `finalizeReducedCapture` or an
   * `abandonReduction`.
   */
  reduce?: boolean;
}

export interface CaptureResponse {
  format: ImageFormat;
  width: number | null;
  height: number | null;
  bytesLen: number;
  dataUrl: string;
  savedPath: string | null;
  copiedToClipboard: boolean;
  /** Nothing has been saved or copied yet; the reduction is still owed. */
  pendingReduction: boolean;
  /** Pair this with finalizeReducedCapture / abandonReduction. */
  captureToken: number | null;
  /** These bytes are the reduction, not the instrument's own. */
  reduced: boolean;
  /** Reduction was requested but could not be delivered; the original was saved. */
  reduceError: string | null;
}

export interface DiscoveredDevice {
  ip: string;
  port: number;
  source: DiscoverySource;
  vendor: Vendor;
  class: InstrumentClass;
  idn: Idn | null;
  hostname: string | null;
  serviceType: string | null;
}

export interface DiscoveryProgress {
  scanned: number;
  total: number;
}

/** All fields optional; the backend fills the rest from its defaults. */
export interface DiscoveryOptions {
  mdns?: boolean;
  sweep?: boolean;
  vxi11?: boolean;
  ports?: number[];
  connectTimeoutMs?: number;
  maxConcurrency?: number;
  overallTimeoutMs?: number;
  subnetMaxPrefix?: number;
}

// --- commands: connection / capture ---

/** Connect to an instrument; the backend auto-detects vendor + class via `*IDN?`. */
export function connect(ip: string, port?: number): Promise<ConnectionInfo> {
  return invoke<ConnectionInfo>("connect", { ip, port });
}
export function disconnect(): Promise<void> {
  return invoke<void>("disconnect");
}
export function connectionStatus(): Promise<ConnectionInfo | null> {
  return invoke<ConnectionInfo | null>("connection_status");
}
/** Capture the connected instrument's screen. */
export function capture(req: CaptureRequest): Promise<CaptureResponse> {
  return invoke<CaptureResponse>("capture", { req });
}
/** Copy the most recent capture to the system clipboard. */
export function copyLastCapture(): Promise<void> {
  return invoke<void>("copy_last_capture");
}
/** Write the most recent capture to `path` (retained bytes, verbatim). */
export function saveLastCapture(path: string): Promise<string> {
  return invoke<string>("save_last_capture", { path });
}

/**
 * Hand the reduced pixels back so the backend can encode an indexed PNG and run
 * the save and clipboard copy it deferred.
 *
 * The payload is one flat buffer, `[token u32 LE][indices][palette]`, and that
 * shape is load-bearing: Tauri only skips JSON encoding when the byte buffer is
 * the *entire* argument. Nested in an object, a Uint8Array is serialised as a
 * JSON number array instead. Measured on a 1024x600 screen, that is 2.6 MB and
 * hundreds of milliseconds against 749 KB and under one.
 */
export function finalizeReducedCapture(
  token: number,
  indices: Uint8Array,
  palette: Uint8Array,
): Promise<CaptureResponse> {
  const body = new Uint8Array(4 + indices.length + palette.length);
  new DataView(body.buffer).setUint32(0, token, true);
  body.set(indices, 4);
  body.set(palette, 4 + indices.length);
  return invoke<CaptureResponse>("finalize_reduced_capture", body);
}

/**
 * Give up on reducing this capture and have the backend deliver the original.
 * Called from the failure and timeout paths so a reduction that goes wrong
 * cannot silently swallow a save the user asked for.
 */
export function abandonReduction(token: number, reason: string): Promise<CaptureResponse> {
  return invoke<CaptureResponse>("abandon_reduction", { token, reason });
}

// --- commands: discovery ---

export function startDiscovery(opts?: DiscoveryOptions): Promise<void> {
  return invoke<void>("start_discovery", opts ? { opts } : {});
}
export function cancelDiscovery(): Promise<void> {
  return invoke<void>("cancel_discovery");
}
export function listInterfaces(): Promise<string[]> {
  return invoke<string[]>("list_interfaces");
}

// --- commands: hotkey ---

/** A global-hotkey binding. `code` is a W3C `KeyboardEvent.code` (e.g. "PrintScreen", "KeyS", "F9"). */
export interface ShortcutSpec {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export const DEFAULT_SHORTCUT: ShortcutSpec = {
  code: "PrintScreen",
  ctrl: true,
  alt: false,
  shift: false,
  meta: false,
};

/** Arm/disarm the global capture hotkey. */
export function setHotkey(enabled: boolean): Promise<void> {
  return invoke<void>("set_hotkey", { enabled });
}
/** Change the global capture hotkey binding. Rejects if the combo can't be registered. */
export function setShortcut(spec: ShortcutSpec): Promise<void> {
  return invoke<void>("set_shortcut", { spec });
}

// --- events ---

export function onConnectionChanged(cb: (info: ConnectionInfo | null) => void): Promise<UnlistenFn> {
  return listen<ConnectionInfo | null>("connection:changed", (e) => cb(e.payload));
}
export function onDiscoveryDevice(cb: (d: DiscoveredDevice) => void): Promise<UnlistenFn> {
  return listen<DiscoveredDevice>("discovery:device", (e) => cb(e.payload));
}
export function onDiscoveryProgress(cb: (p: DiscoveryProgress) => void): Promise<UnlistenFn> {
  return listen<DiscoveryProgress>("discovery:progress", (e) => cb(e.payload));
}
export function onDiscoveryStarted(cb: () => void): Promise<UnlistenFn> {
  return listen("discovery:started", () => cb());
}
export function onDiscoveryComplete(cb: (totalFound: number) => void): Promise<UnlistenFn> {
  return listen<{ totalFound: number }>("discovery:complete", (e) => cb(e.payload.totalFound));
}
export function onDiscoveryError(
  cb: (err: { source: DiscoverySource; message: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ source: DiscoverySource; message: string }>("discovery:error", (e) => cb(e.payload));
}
export function onCaptureDone(cb: (r: CaptureResponse) => void): Promise<UnlistenFn> {
  return listen<CaptureResponse>("capture:done", (e) => cb(e.payload));
}
export function onCaptureError(cb: (err: { kind: string; message: string }) => void): Promise<UnlistenFn> {
  return listen<{ kind: string; message: string }>("capture:error", (e) => cb(e.payload));
}
