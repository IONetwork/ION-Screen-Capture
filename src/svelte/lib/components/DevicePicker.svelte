<!--
  Device discovery + connect. Interim plain markup — the bits-ui redesign and
  $lib/ui primitives land in M5. Functional focus: exercise the discovery
  pipeline (scan → live list → connect) and manual host:port fallback.
-->
<script lang="ts">
  import { connection } from "$lib/stores/connection.svelte";
  import { discovery } from "$lib/stores/discovery.svelte";
  import type { DiscoveredDevice } from "$lib/ipc";

  let manualHost = $state("");
  let manualPort = $state<number | undefined>(undefined);

  function primary(d: DiscoveredDevice): string {
    if (d.idn) return `${d.idn.manufacturer.split(" ")[0]} ${d.idn.model}`;
    if (d.hostname) return d.hostname.replace(/\.local\.?$/, "");
    return d.ip;
  }

  async function connectManual() {
    const host = manualHost.trim();
    if (!host) return;
    await connection.connect(host, manualPort);
  }
</script>

<section class="picker">
  <div class="bar">
    <h2>Instruments</h2>
    {#if discovery.scanning}
      <button class="btn" onclick={() => discovery.stop()}>Stop</button>
    {:else}
      <button class="btn primary" onclick={() => discovery.start()}>Scan network</button>
    {/if}
  </div>

  {#if discovery.scanning}
    <p class="muted">
      Scanning… {discovery.progress.scanned}/{discovery.progress.total} probed
    </p>
  {/if}
  {#if discovery.lastError}
    <p class="err">{discovery.lastError}</p>
  {/if}

  <ul class="list">
    {#each discovery.devices as d (d.ip)}
      {@const raw = d.port === 0}
      <li>
        <button
          class="device"
          disabled={raw || connection.busy}
          title={raw ? "VXI-11 only — raw-socket connect not supported yet" : `Connect to ${d.ip}:${d.port}`}
          onclick={() => connection.connect(d.ip, d.port)}
        >
          <span class="name">{primary(d)}</span>
          <span class="meta">
            <code>{d.ip}{d.port ? `:${d.port}` : ""}</code>
            <span class="badge">{d.source}</span>
            {#if d.class !== "other"}<span class="badge">{d.class}</span>{/if}
          </span>
        </button>
      </li>
    {:else}
      <li class="empty muted">
        {discovery.scanning ? "Looking for instruments…" : "No instruments yet. Scan, or connect manually below."}
      </li>
    {/each}
  </ul>

  <div class="manual">
    <input
      class="in"
      type="text"
      placeholder="host / IP"
      bind:value={manualHost}
      onkeydown={(e) => e.key === "Enter" && connectManual()}
    />
    <input class="in port" type="number" placeholder="port" bind:value={manualPort} min="1" max="65535" />
    <button class="btn" disabled={connection.busy || !manualHost.trim()} onclick={connectManual}>
      Connect
    </button>
  </div>
</section>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .muted {
    margin: 0;
    color: var(--fg-muted);
    font-size: 0.85rem;
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .empty {
    padding: 0.5rem 0;
  }
  .device {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    text-align: left;
    font: inherit;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    cursor: pointer;
  }
  .device:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .device:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .name {
    font-weight: 600;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--fg-muted);
  }
  .badge {
    padding: 0.05rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    text-transform: uppercase;
    font-size: 0.68rem;
    letter-spacing: 0.03em;
  }
  code {
    font-family: var(--font-mono);
  }
  .manual {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.25rem;
    border-top: 1px dashed var(--border);
  }
  .in {
    font: inherit;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    flex: 1;
    min-width: 0;
  }
  .in.port {
    flex: 0 0 6rem;
  }
  .btn {
    font: inherit;
    padding: 0.4rem 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--fg);
    cursor: pointer;
  }
  .btn.primary {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: transparent;
  }
  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
