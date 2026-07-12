<script lang="ts">
  import { connection } from "$lib/stores/connection.svelte";
  import { discovery } from "$lib/stores/discovery.svelte";
  import { update } from "$lib/stores/update.svelte";
</script>

<footer class="statusbar">
  <span class="left">
    <span
      class="dot"
      class:live={connection.info}
      class:scan={discovery.scanning && !connection.info}
    ></span>
    <span class="mono">
      {#if connection.info}
        {connection.info.addr}
      {:else if discovery.scanning}
        scanning {discovery.progress.scanned}/{discovery.progress.total}
      {:else}
        disconnected
      {/if}
    </span>
  </span>
  <span class="right mono">
    <span>{discovery.devices.length} found</span>
    {#if update.current}<span class="ver">v{update.current}</span>{/if}
  </span>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    padding: 0 0.75rem;
    border-top: 1px solid var(--line);
    background: var(--surface);
    font-size: 11px;
    color: var(--ink-2);
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .ver {
    color: var(--ink-3);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--ink-3);
    flex: none;
  }
  .dot.live {
    background: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-weak);
  }
  .dot.scan {
    background: var(--accent);
    animation: pulse 1.1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 1;
    }
  }
</style>
