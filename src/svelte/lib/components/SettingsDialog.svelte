<script lang="ts">
  import Dialog from "$lib/ui/Dialog.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Switch from "$lib/ui/Switch.svelte";
  import TextField from "$lib/ui/TextField.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ShortcutRecorder from "./ShortcutRecorder.svelte";
  import { settings } from "$lib/stores/settings.svelte";

  interface Props {
    open?: boolean;
  }
  let { open = $bindable(false) }: Props = $props();
</script>

<Dialog bind:open title="Settings">
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
  .hk-err {
    margin: 0.1rem 0 0;
    color: var(--danger);
    font-size: 11px;
  }
</style>
