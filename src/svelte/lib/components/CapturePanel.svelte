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
  // supports - but only if the current choice isn't valid, so a supported
  // preference (e.g. BMP) survives a reconnect.
  $effect(() => {
    const list = info?.supportedFormats;
    if (!list?.length) return;
    if (!list.includes(settings.format)) {
      settings.setFormat(list.includes("PNG") ? "PNG" : list[0]);
    }
  });

  const formatOptions = $derived(
    (info?.supportedFormats ?? []).map((f) => ({ value: f, label: f })),
  );

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
      saveDir:
        settings.saveToDisk && settings.saveDir ? settings.saveDir : null,
    });
  }
</script>

{#if info}
  <section class="panel">
    <header class="fp">
      <div class="id">
        <div class="model">{shortModel()}</div>
        <div class="sub mono">
          {info.addr}<span class="dim">
            · {info.class} · fw {info.idn.firmware}</span
          >
        </div>
      </div>
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
          <Switch
            checked={settings.color}
            onCheckedChange={(v) => settings.setColor(v)}
          /><span>Color</span>
        </label>
      {/if}
      {#if info.supportsInvert}
        <label class="toggle">
          <Switch
            checked={settings.invert}
            onCheckedChange={(v) => settings.setInvert(v)}
          /><span>Invert</span>
        </label>
      {/if}
      <div class="spacer"></div>
      <Button
        variant="primary"
        disabled={connection.capturing}
        onclick={capture}
      >
        <Icon name="capture" size={14} />
        {connection.capturing ? "Capturing…" : "Capture"}
      </Button>
    </div>

    {#if connection.error}<p class="err">{connection.error}</p>{/if}

    {#if cap}
      <Preview
        src={cap.dataUrl}
        onCopy={() => connection.copyImage()}
        onSave={() => connection.saveImageAs()}
      />
    {:else}
      <!-- Connected, nothing captured yet: name the instrument and prompt the action. -->
      <div class="idle">
        <div class="idle-body">
          <div class="idle-glyph"><Icon name="capture" size={24} /></div>
          <div class="idle-title">Ready to capture</div>
          <div class="idle-model mono">{shortModel()}</div>
          <p class="idle-hint">
            Press <b>Capture</b> to grab the screen.{#if settings.hotkeyEnabled}<br
              />Your global shortcut works too.{/if}
          </p>
        </div>
      </div>
    {/if}

    <div class="meta mono">
      {#if cap}
        {cap.format} · {(cap.bytesLen / 1024).toFixed(0)} KB
        {#if cap.width && cap.height}
          · {cap.width}×{cap.height}{/if}
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
    <div class="idle">
      <div class="idle-body">
        <div class="idle-glyph muted"><Icon name="scan" size={24} /></div>
        <div class="idle-title">No instrument connected</div>
        <p class="idle-hint">
          Choose one from the list on the left.<br />Not listed? Scan the network or enter its IP.
        </p>
      </div>
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
  /* Idle state: same flex-sized screen box as a capture, background matching the
     capture area, with a centered prompt naming the connected instrument. */
  .idle {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    border: 1px solid var(--line-2);
    border-radius: var(--r-sm);
    background: var(--inset);
  }
  .idle-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
  }
  .idle-glyph {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--accent-weak);
    color: var(--accent);
    margin-bottom: 0.15rem;
  }
  .idle-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .idle-model {
    font-size: 12px;
    color: var(--ink-2);
  }
  .idle-hint {
    margin: 0.4rem 0 0;
    max-width: 34ch;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-2);
  }
  .idle-hint b {
    color: var(--ink);
    font-weight: 600;
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
  /* Muted glyph for the disconnected state (vs the accent "ready" glyph). */
  .idle-glyph.muted {
    background: var(--surface);
    color: var(--ink-2);
    border: 1px solid var(--line);
  }
</style>
