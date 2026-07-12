// App settings (runes) — capture destination + options, persisted via the store
// plugin. The backend reads the same `settings.json` for the global hotkey.

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  DEFAULT_SHORTCUT,
  errMsg,
  setHotkey as ipcSetHotkey,
  setShortcut as ipcSetShortcut,
  type ImageFormat,
  type ShortcutSpec,
} from "$lib/ipc";

class SettingsStore {
  saveDir = $state("");
  saveToDisk = $state(false);
  copyToClipboard = $state(false);
  // Capture options — persisted so the global hotkey uses the same choices as
  // the UI. Format is corrected to a supported one on connect (CapturePanel).
  format = $state<ImageFormat>("PNG");
  color = $state(true);
  invert = $state(false);
  hotkeyEnabled = $state(false);
  hotkeyShortcut = $state<ShortcutSpec>({ ...DEFAULT_SHORTCUT });
  /** Last hotkey registration error (e.g. combo already taken by another app). */
  hotkeyError = $state<string | null>(null);

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
      this.hotkeyEnabled = (await store.get<boolean>("hotkeyEnabled")) ?? false;
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
