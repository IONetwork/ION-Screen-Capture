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
    <span class="field-name">{label}</span>
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
    min-height: 34px;
  }
  .field-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /*
   * Deliberately not `.micro-label`, which this used to use. That style is
   * 10px uppercase with 0.09em tracking in --ink-3, which works for a two-word
   * section heading ("Format", "Instruments") but not for a form row: at 10px,
   * "SEARCH FOR UPDATES ON STARTUP" is hard to read, and --ink-3 on --surface
   * measures 3.5:1, under the 4.5:1 WCAG AA asks for small text.
   *
   * Sentence case at 12px in full-strength ink reads as what it is, a label for
   * the control beside it. The other five .micro-label uses are unaffected.
   */
  .field-name {
    font-size: 12px;
    font-weight: 550;
    line-height: 1.3;
    color: var(--ink);
  }
  /* --ink-2 rather than --ink-3: 6.3:1, and it keeps the hint clearly
     subordinate to the label without dropping below AA. */
  .field-hint {
    font-size: 11px;
    line-height: 1.35;
    color: var(--ink-2);
  }
  .field-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
