<script lang="ts">
  import Button from "$lib/ui/Button.svelte";
  import SegmentedControl from "$lib/ui/SegmentedControl.svelte";
  import Switch from "$lib/ui/Switch.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Preview from "./Preview.svelte";
  import { connection } from "$lib/stores/connection.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import type { ImageFormat } from "$lib/ipc";

  const info = $derived(connection.info);
  const cap = $derived(connection.lastCapture);

  // Format/color/invert live in settings (persisted) so the global hotkey uses
  // the same choices as this panel. Correct the format to one this instrument
  // supports — but only if the current choice isn't valid, so a supported
  // preference (e.g. BMP) survives a reconnect.
  $effect(() => {
    const list = info?.supportedFormats;
    if (!list?.length) return;
    if (!list.includes(settings.format)) {
      settings.setFormat(list.includes("PNG") ? "PNG" : list[0]);
    }
  });

  const formatOptions = $derived((info?.supportedFormats ?? []).map((f) => ({ value: f, label: f })));

  function shortModel(): string {
    if (!info) return "";
    return `${info.idn.manufacturer.split(" ")[0]} ${info.idn.model}`;
  }

  async function capture() {
    await connection.capture({
      format: settings.format,
      color: settings.color,
      invert: settings.invert,
      copyToClipboard: settings.copyToClipboard,
      saveDir: settings.saveToDisk && settings.saveDir ? settings.saveDir : null,
    });
  }
</script>

{#if info}
  <section class="panel">
    <header class="fp">
      <div class="id">
        <div class="model">{shortModel()}</div>
        <div class="sub mono">
          {info.addr}<span class="dim"> · {info.class} · fw {info.idn.firmware}</span>
        </div>
      </div>
      <Button variant="ghost" size="sm" onclick={() => connection.disconnect()}>
        <Icon name="disconnect" size={13} /> Disconnect
      </Button>
    </header>

    <div class="toolbar">
      {#if formatOptions.length > 1}
        <div class="ctl">
          <span class="micro-label">Format</span>
          <SegmentedControl
            options={formatOptions}
            value={settings.format}
            onValueChange={(v) => settings.setFormat(v as ImageFormat)}
          />
        </div>
      {/if}
      {#if info.supportsColor}
        <label class="toggle">
          <Switch checked={settings.color} onCheckedChange={(v) => settings.setColor(v)} /><span>Color</span>
        </label>
      {/if}
      {#if info.supportsInvert}
        <label class="toggle">
          <Switch checked={settings.invert} onCheckedChange={(v) => settings.setInvert(v)} /><span>Invert</span>
        </label>
      {/if}
      <div class="spacer"></div>
      <Button variant="primary" disabled={connection.capturing} onclick={capture}>
        <Icon name="capture" size={14} />
        {connection.capturing ? "Capturing…" : "Capture"}
      </Button>
    </div>

    {#if connection.error}<p class="err">{connection.error}</p>{/if}

    <Preview
      src={cap?.dataUrl}
      onCopy={() => connection.copyImage()}
      onSave={() => connection.saveImageAs()}
    />

    <div class="meta mono">
      {#if cap}
        {cap.format} · {(cap.bytesLen / 1024).toFixed(0)} KB
        {#if cap.width && cap.height} · {cap.width}×{cap.height}{/if}
        {#if cap.savedPath}<span class="saved"> · saved</span>{/if}
        {#if connection.flash}
          <span class="flash"> · {connection.flash}</span>
        {:else}
          <span class="rc-hint"> · right-click to copy or save</span>
        {/if}
      {:else}
        ready
      {/if}
    </div>
  </section>
{:else}
  <section class="panel disconnected">
    <div class="hint">
      <div class="hint-screen"><Preview /></div>
      <p>Connect an instrument from the left to capture its screen.</p>
    </div>
  </section>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem 1.1rem;
    gap: 0.85rem;
    overflow-y: auto;
  }
  .fp {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--line);
  }
  .model {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .sub {
    font-size: 12px;
    color: var(--ink-2);
    margin-top: 2px;
  }
  .dim {
    color: var(--ink-3);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 12px;
    color: var(--ink-2);
    cursor: pointer;
  }
  .spacer {
    flex: 1;
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }
  .meta {
    font-size: 11px;
    color: var(--ink-3);
  }
  .saved {
    color: var(--ok);
  }
  .flash {
    color: var(--ok);
  }
  .rc-hint {
    color: var(--ink-3);
  }
  .disconnected {
    align-items: center;
    justify-content: center;
  }
  .hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    max-width: 360px;
    text-align: center;
    color: var(--ink-3);
  }
  .hint-screen {
    width: 240px;
    opacity: 0.6;
  }
</style>
