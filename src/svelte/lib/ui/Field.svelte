<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    hint?: string;
    children: Snippet;
  }
  let { label, hint, children }: Props = $props();
</script>

<div class="field-row">
  <div class="field-label">
    <span class="micro-label">{label}</span>
    {#if hint}<span class="field-hint">{hint}</span>{/if}
  </div>
  <div class="field-control">{@render children()}</div>
</div>

<style>
  .field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 32px;
  }
  .field-label {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .field-hint {
    font-size: 11px;
    color: var(--ink-3);
  }
  .field-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
