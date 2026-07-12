// Startup update check (runes). Frontend-only: reads the running app version and
// asks GitHub for the latest release. Fails silently (offline, rate-limited, no
// releases, plain browser) and never blocks startup. Gated by settings.checkUpdates.

import { settings } from "$lib/stores/settings.svelte";

const RELEASES_API =
  "https://api.github.com/repos/IONetwork/ION-Screen-Capture/releases/latest";

/** Numeric semver compare; tolerates a leading 'v' and pre-release suffixes. */
function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/i, "").split(".").map((p) => parseInt(p, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

class UpdateStore {
  current = $state<string | null>(null);
  latest = $state<string | null>(null);
  url = $state<string | null>(null);
  available = $state(false);
  #started = false;

  async init() {
    if (this.#started) return;
    this.#started = true;
    // Caller awaits settings.init() first, so this reads the persisted value,
    // not the default (see App.svelte onMount chaining).
    if (!settings.checkUpdates) return;
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      this.current = await getVersion(); // throws in a plain browser → caught
      const res = await fetch(RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) return; // 404 = no non-prerelease yet
      const j = await res.json();
      this.latest = String(j.tag_name).replace(/^v/i, "");
      this.url = typeof j.html_url === "string" ? j.html_url : null;
      this.available = !!this.current && isNewer(this.latest, this.current);
    } catch {
      /* offline / rate-limited / no releases / plain browser */
    }
  }

  async open() {
    if (!this.url) return;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(this.url);
    } catch {
      /* opener unavailable */
    }
  }
}

export const update = new UpdateStore();
