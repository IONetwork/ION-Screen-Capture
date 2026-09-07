<script lang="ts">
  // Busy indicator. Pair it with a `label` wherever the state is not otherwise
  // spelled out: app.css forces `animation-duration: 0.001ms` under
  // prefers-reduced-motion, so the ring stops turning and the text is then the
  // only thing saying anything is happening.
  interface Props {
    size?: number;
    /** Visible text beside the ring. Also used as the accessible name. */
    label?: string;
  }
  let { size = 14, label }: Props = $props();
</script>

<span class="spin-wrap" role="status" aria-label={label ? undefined : "Working"}>
  <span class="spin" style="--spin-size: {size}px" aria-hidden="true"></span>
  {#if label}<span class="spin-label">{label}</span>{/if}
</span>

<style>
  .spin-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .spin {
    flex: none;
    width: var(--spin-size);
    height: var(--spin-size);
    border: 2px solid var(--line-2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  .spin-label {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--ink-2);
    white-space: nowrap;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
