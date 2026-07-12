<!-- Records a global-hotkey combo. Click to arm, then press the keys. Captures
     on the capture phase so Esc cancels here instead of closing the dialog, and
     listens to keyup too (PrintScreen fires only keyup in Chromium). -->
<script lang="ts">
  import type { ShortcutSpec } from "$lib/ipc";

  interface Props {
    spec: ShortcutSpec;
    onChange: (spec: ShortcutSpec) => void;
  }
  let { spec, onChange }: Props = $props();

  let recording = $state(false);

  const MODIFIER_CODES = new Set([
    "ControlLeft",
    "ControlRight",
    "ShiftLeft",
    "ShiftRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
    "OSLeft",
    "OSRight",
  ]);

  function keyName(code: string): string {
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return "Num" + code.slice(6);
    const map: Record<string, string> = {
      PrintScreen: "PrtSc",
      Escape: "Esc",
      Delete: "Del",
      Insert: "Ins",
      PageUp: "PgUp",
      PageDown: "PgDn",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      Backslash: "\\",
      Slash: "/",
      Backquote: "`",
      Minus: "−",
      Equal: "=",
      BracketLeft: "[",
      BracketRight: "]",
      Semicolon: ";",
      Quote: "'",
      Comma: ",",
      Period: ".",
      CapsLock: "Caps",
      ContextMenu: "Menu",
    };
    return map[code] ?? code;
  }

  function label(s: ShortcutSpec): string {
    const parts: string[] = [];
    if (s.ctrl) parts.push("Ctrl");
    if (s.alt) parts.push("Alt");
    if (s.shift) parts.push("Shift");
    if (s.meta) parts.push("Win");
    parts.push(keyName(s.code));
    return parts.join(" + ");
  }

  // While recording, grab keys on the capture phase (runs before the dialog's
  // own Esc handler) so Esc cancels recording rather than closing the dialog.
  $effect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "keydown" && e.key === "Escape") {
        recording = false;
        return;
      }
      if (MODIFIER_CODES.has(e.code)) return; // wait for a real key
      onChange({
        code: e.code,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      });
      recording = false;
    };
    window.addEventListener("keydown", handler, true);
    window.addEventListener("keyup", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("keyup", handler, true);
    };
  });
</script>

<button
  type="button"
  class="rec mono"
  class:recording
  onclick={() => (recording = !recording)}
  onblur={() => (recording = false)}
>
  {#if recording}
    <span class="prompt">Press keys…</span><span class="dim">Esc</span>
  {:else}
    {label(spec)}
  {/if}
</button>

<style>
  .rec {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 150px;
    height: 30px;
    padding: 0 0.7rem;
    border: 1px solid var(--line-2);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--ink);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 90ms ease, box-shadow 90ms ease;
  }
  .rec:hover {
    border-color: var(--ink-3);
  }
  .rec.recording {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-weak);
  }
  .prompt {
    color: var(--accent);
  }
  .dim {
    color: var(--ink-3);
    font-size: 10px;
    letter-spacing: 0.04em;
  }
</style>
