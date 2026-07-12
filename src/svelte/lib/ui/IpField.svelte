<script lang="ts">
  interface Props {
    value?: string;
    onEnter?: () => void;
  }
  let { value = $bindable(""), onEnter }: Props = $props();

  let octets = $state<string[]>(["", "", "", ""]);
  let inputs = $state<HTMLInputElement[]>([]);

  function emit() {
    value = octets.some((o) => o !== "") ? octets.map((o) => o || "0").join(".") : "";
  }

  function sanitize(s: string): string {
    const digits = s.replace(/\D/g, "").slice(0, 3);
    if (digits === "") return "";
    return String(Math.min(255, Number(digits)));
  }

  function onInput(i: number, e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const clean = sanitize(el.value);
    if (el.value !== clean) el.value = clean; // strip non-digits / clamp in the DOM
    octets[i] = clean;
    emit();
    if (i < 3 && clean.length === 3) {
      inputs[i + 1]?.focus();
      inputs[i + 1]?.select();
    }
  }

  function onKeydown(i: number, e: KeyboardEvent) {
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "." || e.key === " ") {
      e.preventDefault();
      if (i < 3) {
        inputs[i + 1]?.focus();
        inputs[i + 1]?.select();
      }
    } else if (e.key === "Backspace" && el.value === "" && i > 0) {
      e.preventDefault();
      inputs[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && el.selectionStart === 0 && i > 0) {
      e.preventDefault();
      inputs[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && el.selectionStart === el.value.length && i < 3) {
      e.preventDefault();
      inputs[i + 1]?.focus();
    } else if (e.key === "Enter") {
      onEnter?.();
    }
  }

  function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text")?.trim() ?? "";
    const parts = text.split(".");
    if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
      e.preventDefault();
      octets = parts.map((p) => String(Math.min(255, Number(p))));
      emit();
      inputs[3]?.focus();
    }
  }
</script>

<div class="ip" role="group" aria-label="IP address">
  {#each octets as _oct, i (i)}
    {#if i > 0}<span class="dot" aria-hidden="true">.</span>{/if}
    <input
      class="oct"
      bind:this={inputs[i]}
      value={octets[i]}
      inputmode="numeric"
      maxlength="3"
      aria-label={`octet ${i + 1}`}
      oninput={(e) => onInput(i, e)}
      onkeydown={(e) => onKeydown(i, e)}
      onpaste={onPaste}
      onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
    />
  {/each}
</div>

<style>
  .ip {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 0.35rem;
    border: 1px solid var(--line-2);
    border-radius: var(--r-sm);
    background: var(--surface);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .ip:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-weak);
  }
  .oct {
    flex: 1;
    min-width: 0;
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: center;
    padding: 0;
    outline: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .dot {
    color: var(--ink-3);
    padding-bottom: 2px;
  }
</style>
