// Connection + capture state (runes). Screen capture is the only operation.

import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  capture as ipcCapture,
  connect as ipcConnect,
  connectionStatus,
  copyLastCapture,
  disconnect as ipcDisconnect,
  errMsg,
  onCaptureDone,
  onCaptureError,
  onConnectionChanged,
  saveLastCapture,
  type CaptureResponse,
  type ConnectionInfo,
  type ImageFormat,
} from "$lib/ipc";
import { settings } from "$lib/stores/settings.svelte";

/** File extension for a captured image format (JPEG→jpg, TIFF→tif). */
function formatExt(f: ImageFormat): string {
  switch (f) {
    case "PNG":
      return "png";
    case "BMP24":
    case "BMP8":
      return "bmp";
    case "JPEG":
      return "jpg";
    case "TIFF":
      return "tif";
  }
}

/** Locale-independent, filename-safe timestamp: `YYYYMMDD-HHMMSS`. */
function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

class ConnectionStore {
  info = $state<ConnectionInfo | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);
  lastCapture = $state<CaptureResponse | null>(null);
  capturing = $state(false);
  /** Transient one-line confirmation ("Copied", "Saved"); clears itself. */
  flash = $state<string | null>(null);

  #started = false;
  #flashTimer: ReturnType<typeof setTimeout> | null = null;

  async init() {
    if (this.#started) return;
    this.#started = true;
    try {
      this.info = await connectionStatus();
    } catch {
      /* backend not ready yet */
    }
    await onConnectionChanged((info) => {
      this.info = info;
      if (!info) this.lastCapture = null;
    });
    // Captures triggered by the global hotkey arrive as events.
    await onCaptureDone((resp) => {
      this.lastCapture = resp;
    });
    await onCaptureError((err) => {
      this.error = err.message;
    });
  }

  async connect(ip: string, port?: number) {
    this.busy = true;
    this.error = null;
    try {
      this.info = await ipcConnect(ip, port);
    } catch (e) {
      this.error = errMsg(e);
    } finally {
      this.busy = false;
    }
  }

  async disconnect() {
    try {
      await ipcDisconnect();
    } catch {
      /* ignore */
    }
    this.info = null;
    this.lastCapture = null;
  }

  async capture(opts?: {
    format?: ImageFormat;
    color?: boolean;
    invert?: boolean;
    saveDir?: string | null;
    copyToClipboard?: boolean;
  }) {
    const info = this.info;
    if (!info) return;
    const format: ImageFormat =
      opts?.format ?? (info.supportedFormats.includes("PNG") ? "PNG" : (info.supportedFormats[0] ?? "PNG"));
    this.capturing = true;
    this.error = null;
    try {
      this.lastCapture = await ipcCapture({
        format,
        color: opts?.color ?? true,
        invert: opts?.invert ?? false,
        saveDir: opts?.saveDir ?? null,
        copyToClipboard: opts?.copyToClipboard ?? false,
      });
    } catch (e) {
      this.error = errMsg(e);
    } finally {
      this.capturing = false;
    }
  }

  /** Copy the current capture to the system clipboard (preview right-click). */
  async copyImage() {
    if (!this.lastCapture) return;
    this.error = null;
    try {
      await copyLastCapture();
      this.#showFlash("Copied to clipboard");
    } catch (e) {
      this.error = errMsg(e);
    }
  }

  /** Save the current capture via a native file dialog (preview right-click). */
  async saveImageAs() {
    const cap = this.lastCapture;
    if (!cap) return;
    this.error = null;
    const ext = formatExt(cap.format);
    const name = `capture_${fileStamp()}.${ext}`;
    const dir = settings.saveDir;
    try {
      const path = await saveDialog({
        title: "Save capture",
        defaultPath: dir ? `${dir}/${name}` : name,
        filters: [{ name: cap.format, extensions: [ext] }],
      });
      if (!path) return; // user cancelled
      await saveLastCapture(path);
      this.#showFlash("Saved");
    } catch (e) {
      this.error = errMsg(e);
    }
  }

  #showFlash(msg: string) {
    this.flash = msg;
    if (this.#flashTimer) clearTimeout(this.#flashTimer);
    this.#flashTimer = setTimeout(() => {
      this.flash = null;
    }, 1800);
  }
}

export const connection = new ConnectionStore();
