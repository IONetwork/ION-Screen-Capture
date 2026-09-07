// App settings (runes) - capture destination + options, persisted via the store
// plugin. The backend reads the same `settings.json` for the global hotkey.

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  DEFAULT_SHORTCUT,
  errMsg,
  setHotkey as ipcSetHotkey,
  setShortcut as ipcSetShortcut,
  type ColorSpace,
  type ImageFormat,
  type ShortcutSpec,
} from "$lib/ipc";

/**
 * Palette sizes offered in Settings. 256 is the ceiling: an indexed PNG has
 * indices 0..255, so 256 entries, and nothing needs reserving because captures
 * are opaque and the reducer runs with alpha ignored.
 */
export const PALETTE_SIZES = [8, 16, 32, 64, 256] as const;

/**
 * Snap a stored or incoming value onto the offered set.
 *
 * A previously persisted size that is no longer offered (the control used to be
 * a free-text field) would otherwise leave the dropdown showing nothing, so pick
 * the nearest legal option instead.
 */
function snapColors(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 64;
  return PALETTE_SIZES.reduce((best, s) =>
    Math.abs(s - n) < Math.abs(best - n) ? s : best,
  );
}

class SettingsStore {
  saveDir = $state("");
  saveToDisk = $state(false);
  copyToClipboard = $state(false);
  // Capture options - persisted so the global hotkey uses the same choices as
  // the UI. Format is corrected to a supported one on connect (CapturePanel).
  format = $state<ImageFormat>("PNG");
  color = $state(true);
  invert = $state(false);
  /**
   * "Reduced Color": quantise the capture to a small palette and write it as an
   * indexed PNG. Persisted like the other capture options so the global hotkey
   * uses the same choice as the UI.
   */
  reducedColor = $state(false);
  /**
   * Palette size, 2..256. 64 is the measured optimum on instrument screens: on
   * the project's own screenshots it is both the smallest indexed PNG (38% of
   * the original) and visually indistinguishable. Fewer colours is bigger, not
   * smaller, because the extra dithering needed to fake the missing colours
   * costs more than the shorter palette saves.
   */
  reduceColors = $state(64);
  /**
   * Error-diffusion dithering during reduction.
   *
   * Measured on a real DS1104Z capture, turning this off is smaller *and*
   * higher quality at every palette size (at 64 colours: 15331 B against
   * 16774 B, 55.5 dB against 53.3 dB), because an adaptive palette already
   * lands almost exactly on flat instrument UI and there is nothing to smooth.
   * It earns its keep on genuine gradients, which some newer scopes render.
   */
  reduceDither = $state(true);
  /** Working space the reducer measures colour distance in. */
  reduceSpace = $state<ColorSpace>("oklab");
  /** Return the instrument to LOCAL after each capture / on disconnect (default off). */
  unlockAfterCapture = $state(false);
  hotkeyEnabled = $state(false);
  checkUpdates = $state(true);
  hotkeyShortcut = $state<ShortcutSpec>({ ...DEFAULT_SHORTCUT });
  /** Last hotkey registration error (e.g. combo already taken by another app). */
  hotkeyError = $state<string | null>(null);
  /** Explicit light/dark choice, or null to follow the OS (prefers-color-scheme). */
  theme = $state<"light" | "dark" | null>(null);

  #store: Store | null = null;
  #ready = false;

  async init() {
    if (this.#ready) return;
    this.#ready = true;
    try {
      const store = await load("settings.json", { autoSave: true, defaults: {} });
      this.#store = store;
      this.saveDir = (await store.get<string>("saveDir")) ?? "";
      this.saveToDisk = (await store.get<boolean>("saveToDisk")) ?? false;
      this.copyToClipboard = (await store.get<boolean>("copyToClipboard")) ?? false;
      this.format = (await store.get<ImageFormat>("format")) ?? "PNG";
      this.color = (await store.get<boolean>("color")) ?? true;
      this.invert = (await store.get<boolean>("invert")) ?? false;
      this.reducedColor = (await store.get<boolean>("reducedColor")) ?? false;
      this.reduceColors = snapColors((await store.get<number>("reduceColors")) ?? 64);
      this.reduceDither = (await store.get<boolean>("reduceDither")) ?? true;
      this.reduceSpace = (await store.get<ColorSpace>("reduceSpace")) ?? "oklab";
      this.unlockAfterCapture = (await store.get<boolean>("unlockAfterCapture")) ?? false;
      this.hotkeyEnabled = (await store.get<boolean>("hotkeyEnabled")) ?? false;
      this.checkUpdates = (await store.get<boolean>("checkUpdates")) ?? true;
      this.theme = (await store.get<"light" | "dark">("theme")) ?? null;
      this.hotkeyShortcut = (await store.get<ShortcutSpec>("hotkeyShortcut")) ?? {
        ...DEFAULT_SHORTCUT,
      };
      if (this.hotkeyEnabled) {
        try {
          await ipcSetHotkey(true);
        } catch (e) {
          this.hotkeyError = errMsg(e);
        }
      }
    } catch {
      /* store/tauri unavailable (e.g. a plain browser) */
    }
  }

  #save(key: string, value: unknown) {
    void this.#store?.set(key, value);
  }

  setSaveToDisk(v: boolean) {
    this.saveToDisk = v;
    this.#save("saveToDisk", v);
  }
  setCopyToClipboard(v: boolean) {
    this.copyToClipboard = v;
    this.#save("copyToClipboard", v);
  }
  setSaveDir(v: string) {
    this.saveDir = v;
    this.#save("saveDir", v);
  }
  setFormat(v: ImageFormat) {
    this.format = v;
    this.#save("format", v);
  }
  setColor(v: boolean) {
    this.color = v;
    this.#save("color", v);
  }
  setInvert(v: boolean) {
    this.invert = v;
    this.#save("invert", v);
  }
  setReducedColor(v: boolean) {
    this.reducedColor = v;
    this.#save("reducedColor", v);
  }
  setReduceColors(v: number) {
    const n = snapColors(v);
    this.reduceColors = n;
    this.#save("reduceColors", n);
  }
  setReduceDither(v: boolean) {
    this.reduceDither = v;
    this.#save("reduceDither", v);
  }
  setReduceSpace(v: ColorSpace) {
    this.reduceSpace = v;
    this.#save("reduceSpace", v);
  }
  setUnlockAfterCapture(v: boolean) {
    this.unlockAfterCapture = v;
    this.#save("unlockAfterCapture", v);
  }
  setCheckUpdates(v: boolean) {
    this.checkUpdates = v;
    this.#save("checkUpdates", v);
  }
  setTheme(v: "light" | "dark") {
    this.theme = v;
    this.#save("theme", v);
  }
  async setHotkey(v: boolean) {
    this.hotkeyEnabled = v;
    this.#save("hotkeyEnabled", v);
    this.hotkeyError = null;
    try {
      await ipcSetHotkey(v);
    } catch (e) {
      this.hotkeyError = errMsg(e);
    }
  }

  async setShortcut(spec: ShortcutSpec) {
    this.hotkeyShortcut = spec;
    this.#save("hotkeyShortcut", spec);
    this.hotkeyError = null;
    try {
      await ipcSetShortcut(spec);
    } catch (e) {
      this.hotkeyError = errMsg(e);
    }
  }

  async chooseDir() {
    try {
      const dir = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose capture folder",
      });
      if (typeof dir === "string") {
        this.setSaveDir(dir);
        this.setSaveToDisk(true);
      }
    } catch {
      /* dialog unavailable */
    }
  }
}

export const settings = new SettingsStore();
