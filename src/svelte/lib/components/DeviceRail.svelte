<script lang="ts">
  import Button from "$lib/ui/Button.svelte";
  import TextField from "$lib/ui/TextField.svelte";
  import IpField from "$lib/ui/IpField.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import { discovery } from "$lib/stores/discovery.svelte";
  import { connection } from "$lib/stores/connection.svelte";
  import type { DiscoveredDevice } from "$lib/ipc";

  let ip = $state("");
  let port = $state("");

  function primary(d: DiscoveredDevice): string {
    if (d.idn) return `${d.idn.manufacturer.split(" ")[0]} ${d.idn.model}`;
    if (d.hostname) return d.hostname.replace(/\.local\.?$/, "");
    return d.ip;
  }
  function active(d: DiscoveredDevice): boolean {
    return connection.info?.addr === `${d.ip}:${d.port}`;
  }
  function connectManual() {
    const addr = ip.trim();
    if (!addr) return;
    // `port` is bound to a number <input>, so at runtime it's a number|null
    // (not the declared string) - parse defensively instead of calling .trim().
    const p = Number(port);
    const validPort = Number.isFinite(p) && p >= 1 && p <= 65535 ? p : undefined;
    void connection.connect(addr, validPort);
  }
</script>

<div class="rail">
  <header class="head">
    <span class="micro-label">Instruments</span>
    {#if discovery.scanning}
      <Button variant="ghost" size="sm" onclick={() => discovery.stop()}>
        <Icon name="stop" size={12} /> Stop
      </Button>
    {:else}
      <Button size="sm" onclick={() => discovery.start()}>
        <Icon name="scan" size={12} /> Scan
      </Button>
    {/if}
  </header>

  {#if discovery.scanning}
    <div class="scanbar" role="status" aria-label="scan progress">
      <div
        class="scanbar-fill"
        style:width={`${discovery.progress.total ? (discovery.progress.scanned / discovery.progress.total) * 100 : 6}%`}
      ></div>
    </div>
  {/if}

  <div class="list">
    {#each discovery.devices as d (d.ip)}
      {@const raw = d.port === 0}
      <!-- bespoke list row: the connect action fills the card, and a disconnect
           control appears on the connected one -->
      <div class="dev" class:active={active(d)} class:raw>
        <button
          class="dev-connect"
          type="button"
          disabled={raw || connection.busy || active(d)}
          title={raw
            ? "VXI-11 only (no raw-socket capture)"
            : active(d)
              ? "Connected"
              : `Connect to ${d.ip}:${d.port}`}
          onclick={() => connection.connect(d.ip, d.port)}
        >
          <span class="dev-name">{primary(d)}</span>
          <span class="dev-addr mono">{d.ip}{d.port ? `:${d.port}` : ""}</span>
          <span class="dev-tags">
            <span class="tag">{d.source}</span>
            {#if d.class !== "other"}
              <span class="tag">{d.class === "oscilloscope" ? "scope" : d.class}</span>
            {/if}
          </span>
        </button>
        {#if active(d)}
          <button
            class="dev-x"
            type="button"
            title="Disconnect"
            disabled={connection.busy}
            onclick={() => connection.disconnect()}
          >
            <Icon name="disconnect" size={14} />
          </button>
        {/if}
      </div>
    {:else}
      <p class="empty">
        {discovery.scanning
          ? "Searching the local network…"
          : "No instruments yet. Scan, or connect manually below."}
      </p>
    {/each}
  </div>

  {#if discovery.lastError}<p class="err">{discovery.lastError}</p>{/if}

  <div class="manual">
    <span class="micro-label">Manual connect</span>
    <div class="manual-row">
      <IpField bind:value={ip} onEnter={connectManual} />
      <TextField bind:value={port} type="number" placeholder="port" class="port" min={1} max={65535} />
    </div>
    <Button size="sm" disabled={connection.busy || !ip.trim()} onclick={connectManual}>
      Connect
    </Button>
    {#if connection.error && !connection.info}<p class="err">{connection.error}</p>{/if}
  </div>
</div>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 0.85rem;
    gap: 0.7rem;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .scanbar {
    height: 2px;
    background: var(--line);
    border-radius: 2px;
    overflow: hidden;
  }
  .scanbar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 140ms linear;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 3px;
    /* Scroll container clips to its padding box; give the card focus/active
       ring (outline + 1px offset) clear room on both sides so its left edge
       isn't clipped. Negative margin keeps cards aligned with the rail. */
    margin: 0 -0.4rem;
    padding: 3px 0.4rem;
  }
  .dev {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--line);
    /* 2px left border reserves space for the active accent bar; keep it a
       visible hairline when inactive so the card's left edge isn't "missing". */
    border-left: 2px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--ink);
    overflow: hidden;
  }
  .dev.raw {
    opacity: 0.5;
  }
  .dev:hover:not(.raw) {
    border-color: var(--line-2);
  }
  .dev.active {
    border-left-color: var(--accent);
    background: var(--accent-weak);
  }
  /* Connect action fills the card; the info stack lives inside it. */
  .dev-connect {
    flex: 1;
    min-width: 0;
    appearance: none;
    text-align: left;
    font: inherit;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 0.5rem 0.6rem;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .dev-connect:disabled {
    cursor: default;
  }
  .dev.raw .dev-connect {
    cursor: not-allowed;
  }
  /* Disconnect control, shown only on the connected card. */
  .dev-x {
    flex: none;
    appearance: none;
    align-self: stretch;
    display: grid;
    place-items: center;
    padding: 0 0.55rem;
    border: 0;
    border-left: 1px solid var(--line);
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
  }
  .dev-x:hover:not(:disabled) {
    color: var(--danger);
  }
  .dev-x:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .dev-name {
    font-weight: 550;
    line-height: 1.25;
  }
  .dev-addr {
    font-size: 11px;
    color: var(--ink-3);
  }
  .dev-tags {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .tag {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
    padding: 1px 5px;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .empty {
    margin: 0.5rem 0.2rem;
    color: var(--ink-3);
    line-height: 1.5;
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }
  .manual {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding-top: 0.7rem;
    border-top: 1px solid var(--line);
  }
  .manual-row {
    display: flex;
    gap: 0.4rem;
  }
  .manual-row :global(.ip) {
    flex: 1;
  }
  .manual-row :global(.field.port) {
    flex: 0 0 4.5rem;
  }
</style>
