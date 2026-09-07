<script lang="ts">
  import Dialog from "$lib/ui/Dialog.svelte";
  import Field from "$lib/ui/Field.svelte";
  import SegmentedControl from "$lib/ui/SegmentedControl.svelte";
  import Select from "$lib/ui/Select.svelte";
  import Switch from "$lib/ui/Switch.svelte";
  import TextField from "$lib/ui/TextField.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ShortcutRecorder from "./ShortcutRecorder.svelte";
  import { PALETTE_SIZES, settings } from "$lib/stores/settings.svelte";
  import type { ColorSpace } from "$lib/ipc";

  const sizeOptions = PALETTE_SIZES.map((n) => ({ value: String(n), label: String(n) }));

  const spaceOptions = [
    { value: "oklab", label: "OkLab" },
    { value: "srgb", label: "sRGB" },
    { value: "linear", label: "Linear" },
  ];

  interface Props {
    open?: boolean;
  }
  let { open = $bindable(false) }: Props = $props();
</script>

<Dialog bind:open title="Settings" showClose={false}>
  {#snippet footer()}
    <!-- Every setting here persists the moment it changes, so there is nothing
         to cancel. "Done" says what closing actually means; an X would read as
         discarding the changes. -->
    <Button variant="primary" onclick={() => (open = false)}>Done</Button>
  {/snippet}
  <div class="settings">
    <Field label="Save to disk" hint="write each capture to a folder">
      <Switch checked={settings.saveToDisk} onCheckedChange={(v) => settings.setSaveToDisk(v)} />
    </Field>
    <Field label="Folder">
      <TextField
        value={settings.saveDir}
        placeholder="no folder chosen"
        onchange={(v) => settings.setSaveDir(v)}
      />
      <Button size="sm" onclick={() => settings.chooseDir()}>Browse</Button>
    </Field>
    <div class="rule"></div>
    <Field label="Copy to clipboard" hint="copy the image after capture">
      <Switch checked={settings.copyToClipboard} onCheckedChange={(v) => settings.setCopyToClipboard(v)} />
    </Field>
    <Field label="Unlock after capture" hint="return the instrument's front panel to local">
      <Switch checked={settings.unlockAfterCapture} onCheckedChange={(v) => settings.setUnlockAfterCapture(v)} />
    </Field>
    <div class="rule"></div>
    {#if !settings.reducedColor}
      <p class="dependent">
        These apply only while <strong>Reduced Color</strong> is switched on, which is done
        in the capture toolbar next to Color and Invert. It is off right now.
      </p>
    {/if}
    <Field label="Palette size" hint="colors to reduce to (256 is the indexed-PNG maximum)">
      <Select
        options={sizeOptions}
        value={String(settings.reduceColors)}
        placeholder="size"
        onValueChange={(v) => settings.setReduceColors(Number(v))}
      />
    </Field>
    <Field label="Dither" hint="diffuse error; off is smaller and sharper on flat screens">
      <Switch
        checked={settings.reduceDither}
        onCheckedChange={(v) => settings.setReduceDither(v)}
      />
    </Field>
    <Field label="Color space" hint="how Reduced Color compares colors">
      <SegmentedControl
        options={spaceOptions}
        value={settings.reduceSpace}
        onValueChange={(v) => settings.setReduceSpace(v as ColorSpace)}
      />
    </Field>
    <div class="rule"></div>
    <Field label="Search for updates on startup" hint="notify me when a new version is available">
      <Switch checked={settings.checkUpdates} onCheckedChange={(v) => settings.setCheckUpdates(v)} />
    </Field>
    <Field label="Global hotkey" hint="capture from anywhere, even unfocused">
      <Switch checked={settings.hotkeyEnabled} onCheckedChange={(v) => settings.setHotkey(v)} />
    </Field>
    <Field label="Shortcut" hint="click, then press your combo">
      <ShortcutRecorder spec={settings.hotkeyShortcut} onChange={(s) => settings.setShortcut(s)} />
    </Field>
    {#if settings.hotkeyError}
      <p class="hk-err">{settings.hotkeyError}</p>
    {/if}
  </div>
</Dialog>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .settings :global(.field) {
    flex: 1;
    min-width: 0;
  }
  .rule {
    height: 1px;
    background: var(--line);
    margin: 0.5rem 0;
  }
  .dependent {
    margin: 0 0 0.2rem;
    padding-left: 0.5rem;
    border-left: 2px solid var(--accent);
    color: var(--ink-2);
    font-size: 11px;
    line-height: 1.45;
  }
  .hk-err {
    margin: 0.1rem 0 0;
    color: var(--danger);
    font-size: 11px;
  }
</style>
