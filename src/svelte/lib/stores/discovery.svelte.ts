// Discovery state (runes). Subscribes to `discovery:*` events while a scan runs.

import type { UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import {
  cancelDiscovery,
  onDiscoveryComplete,
  onDiscoveryDevice,
  onDiscoveryError,
  onDiscoveryProgress,
  onDiscoveryStarted,
  startDiscovery,
  errMsg,
  type DiscoveredDevice,
  type DiscoveryProgress,
} from "$lib/ipc";

class DiscoveryStore {
  devices = $state<DiscoveredDevice[]>([]);
  scanning = $state(false);
  progress = $state<DiscoveryProgress>({ scanned: 0, total: 0 });
  lastError = $state<string | null>(null);

  #unlisten: UnlistenFn[] = [];
  #started = false;

  async init() {
    if (this.#started) return;
    this.#started = true;
    if (!isTauri()) return; // skip plain browser / ?mock (don't wipe seeded devices)
    await this.start(); // start() self-guards via `scanning`
  }

  async start() {
    if (this.scanning) return;
    this.devices = [];
    this.progress = { scanned: 0, total: 0 };
    this.lastError = null;
    this.scanning = true;
    await this.#subscribe();
    try {
      await startDiscovery();
    } catch (e) {
      this.lastError = errMsg(e);
      this.scanning = false;
      this.#teardown();
    }
  }

  async stop() {
    try {
      await cancelDiscovery();
    } catch {
      /* ignore */
    }
    this.scanning = false;
    this.#teardown();
  }

  async #subscribe() {
    this.#teardown();
    this.#unlisten.push(
      await onDiscoveryStarted(() => (this.scanning = true)),
      await onDiscoveryDevice((d) => this.#upsert(d)),
      await onDiscoveryProgress((p) => (this.progress = p)),
      await onDiscoveryError((err) => (this.lastError = `${err.source}: ${err.message}`)),
      await onDiscoveryComplete(() => {
        this.scanning = false;
        this.#teardown();
      }),
    );
  }

  #upsert(d: DiscoveredDevice) {
    const i = this.devices.findIndex((x) => x.ip === d.ip);
    if (i === -1) this.devices.push(d);
    else this.devices[i] = { ...this.devices[i], ...d };
  }

  #teardown() {
    for (const u of this.#unlisten) u();
    this.#unlisten = [];
  }
}

export const discovery = new DiscoveryStore();
