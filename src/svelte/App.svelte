<script lang="ts">
  import { onMount } from "svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import WindowControls from "$lib/ui/WindowControls.svelte";
  import DeviceRail from "$lib/components/DeviceRail.svelte";
  import CapturePanel from "$lib/components/CapturePanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import { connection } from "$lib/stores/connection.svelte";
  import { settings } from "$lib/stores/settings.svelte";

  let settingsOpen = $state(false);
  let theme = $state<"light" | "dark">(
    typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );

  onMount(() => {
    void connection.init();
    void settings.init();
  });

  $effect(() => {
    document.documentElement.dataset.theme = theme;
  });
</script>

<div class="app">
  <header class="titlebar" data-tauri-drag-region>
    <div class="brand" data-tauri-drag-region>
      <svg class="mark" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path
          d="M5 13l2.4-4.5L11 16l2.6-8.5L15.4 13H19"
          fill="none"
          stroke="var(--accent)"
          stroke-width="1.7"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
      <span class="name">ION</span>
      <span class="tag micro-label">screen capture</span>
    </div>
    <div class="drag-spacer" data-tauri-drag-region></div>
    <div class="actions">
      <Button
        variant="ghost"
        size="sm"
        title="Toggle light / dark"
        onclick={() => (theme = theme === "dark" ? "light" : "dark")}
      >
        <Icon name="theme" size={15} />
      </Button>
      <Button variant="ghost" size="sm" title="Settings" onclick={() => (settingsOpen = true)}>
        <Icon name="settings" size={16} />
      </Button>
    </div>
    <WindowControls />
  </header>

  <div class="workspace">
    <aside class="rail-wrap"><DeviceRail /></aside>
    <main class="main-wrap"><CapturePanel /></main>
  </div>

  <StatusBar />
</div>

<SettingsDialog bind:open={settingsOpen} />

<style>
  .app {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
  }
  .titlebar {
    display: flex;
    align-items: center;
    height: 44px;
    padding-left: 0.85rem;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  /* let clicks fall through to the drag region so the whole brand area drags */
  .mark,
  .name,
  .tag {
    pointer-events: none;
  }
  .drag-spacer {
    flex: 1;
    align-self: stretch;
  }
  .mark {
    color: var(--ink);
  }
  .name {
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .tag {
    margin-top: 2px;
  }
  .actions {
    display: flex;
    gap: 0.15rem;
    padding: 0 0.3rem;
  }
  .workspace {
    display: grid;
    grid-template-columns: 264px 1fr;
    min-height: 0;
  }
  .rail-wrap {
    border-right: 1px solid var(--line);
    background: var(--surface);
    min-height: 0;
    overflow: hidden;
  }
  .main-wrap {
    min-height: 0;
    overflow: hidden;
  }
</style>
