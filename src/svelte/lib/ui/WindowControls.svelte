<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
  import Icon from "./Icon.svelte";

  // Null when not running under Tauri (e.g. a plain-browser design preview).
  let win: Window | null = null;
  try {
    win = getCurrentWindow();
  } catch {
    win = null;
  }

  let maximized = $state(false);

  async function sync() {
    try {
      if (win) maximized = await win.isMaximized();
    } catch {
      /* ignore */
    }
  }

  onMount(() => {
    void sync();
    let unlisten: (() => void) | undefined;
    win
      ?.onResized(() => void sync())
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  });

  const minimize = () => void win?.minimize().catch(() => {});
  const toggleMax = () => void win?.toggleMaximize().then(sync).catch(() => {});
  const close = () => void win?.close().catch(() => {});
</script>

<div class="wc">
  <button class="wc-btn" title="Minimize" aria-label="Minimize" onclick={minimize}>
    <Icon name="minimize" size={15} />
  </button>
  <button
    class="wc-btn"
    title={maximized ? "Restore" : "Maximize"}
    aria-label={maximized ? "Restore" : "Maximize"}
    onclick={toggleMax}
  >
    <Icon name={maximized ? "restore" : "maximize"} size={13} />
  </button>
  <button class="wc-btn wc-close" title="Close" aria-label="Close" onclick={close}>
    <Icon name="x" size={15} />
  </button>
</div>

<style>
  .wc {
    display: flex;
    align-self: stretch;
  }
  .wc-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    border: 0;
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
  }
  .wc-btn:hover {
    background: var(--inset);
    color: var(--ink);
  }
  .wc-close:hover {
    background: var(--danger);
    color: #fff;
  }
</style>
