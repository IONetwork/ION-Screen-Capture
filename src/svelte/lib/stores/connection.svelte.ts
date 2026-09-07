// Connection + capture state (runes). Screen capture is the only operation.

import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  abandonReduction,
  capture as ipcCapture,
  connect as ipcConnect,
  connectionStatus,
  copyLastCapture,
  disconnect as ipcDisconnect,
  errMsg,
  finalizeReducedCapture,
  onCaptureDone,
  onCaptureError,
  onConnectionChanged,
  saveLastCapture,
  type CaptureResponse,
  type ConnectionInfo,
  type ImageFormat,
} from "$lib/ipc";
import { reduceDataUrl } from "$lib/reduce";
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
  /** Colour reduction is running in the worker after a capture. */
  reducing = $state(false);
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
    // Captures triggered by the global hotkey arrive as events. They go through
    // the same settle path, so a hotkey capture reduces exactly like a clicked
    // one - which matters, because taking a run of screenshots from the hotkey
    // is the workflow reduction is most useful for.
    await onCaptureDone((resp) => {
      void this.#settle(resp);
    });
    await onCaptureError((err) => {
      this.error = err.message;
    });
  }

  async connect(ip: string, port?: number) {
    this.busy = true;
    this.error = null;
    try {
      const info = await ipcConnect(ip, port);
      this.lastCapture = null; // switched instruments → drop the old preview
      this.info = info;
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
    reduce?: boolean;
  }) {
    const info = this.info;
    if (!info) return;
    const format: ImageFormat =
      opts?.format ?? (info.supportedFormats.includes("PNG") ? "PNG" : (info.supportedFormats[0] ?? "PNG"));
    this.capturing = true;
    this.error = null;
    let resp: CaptureResponse | null = null;
    try {
      resp = await ipcCapture({
        format,
        color: opts?.color ?? true,
        invert: opts?.invert ?? false,
        saveDir: opts?.saveDir ?? null,
        copyToClipboard: opts?.copyToClipboard ?? false,
        reduce: opts?.reduce ?? false,
      });
    } catch (e) {
      this.error = errMsg(e);
    } finally {
      this.capturing = false;
    }
    // Settle outside the `capturing` window on purpose: it owns the `reducing`
    // flag, and the two phases drive different button labels. Awaiting it inside
    // the try above would leave `capturing` true for the whole reduction, so
    // "Reducing…" would never actually appear.
    if (resp) await this.#settle(resp);
  }

  /**
   * Install a capture response, then finish the reduction if one is owed.
   *
   * The preview is assigned first and shows the unreduced image straight away,
   * so perceived capture latency does not change. When the reduction lands, the
   * whole response is replaced rather than patched: the new one carries the
   * reduced bytes' format, size and data URL together, which is what keeps the
   * preview, the meta line and right-click Save consistent. Patching fields
   * individually is how you end up offering a .bmp filename for a PNG.
   */
  async #settle(resp: CaptureResponse) {
    // Nothing owed: publish straight away, exactly as before.
    if (!resp.pendingReduction || resp.captureToken == null) {
      this.lastCapture = resp;
      return;
    }

    // A reduction is owed, so hold this response back. Publishing it first
    // would render the unreduced capture for the 100-450 ms the reducer takes,
    // which reads as a flash of the wrong image. `reducing` drives the spinner
    // over the preview for that window instead.
    const token = resp.captureToken;
    this.reducing = true;
    try {
      const reduced = await reduceDataUrl(resp.dataUrl, {
        colors: settings.reduceColors,
        space: settings.reduceSpace,
        dither: settings.reduceDither,
      });
      this.lastCapture = await finalizeReducedCapture(token, reduced.indices, reduced.palette);
    } catch (e) {
      // The backend is still holding a capture whose save and clipboard copy it
      // deferred for us. Without this the file would silently never be written,
      // and the UI would look like an ordinary successful capture.
      const why = errMsg(e);
      try {
        this.lastCapture = await abandonReduction(token, why);
        this.error = `Colour reduction failed, saved the original instead: ${why}`;
      } catch (inner) {
        // Abandon failed too, so nothing has been published. Fall back to the
        // held response: the capture exists and must not vanish from the UI
        // just because reducing and un-reducing both went wrong.
        this.lastCapture = resp;
        this.error = errMsg(inner);
      }
    } finally {
      this.reducing = false;
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
