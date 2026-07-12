<script lang="ts">
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  interface Props {
    version?: string | null;
    onUpdate?: () => void;
    onDismiss?: () => void;
  }
  let { version, onUpdate, onDismiss }: Props = $props();
</script>

<div class="update-banner" role="status">
  <span class="dot" aria-hidden="true"></span>
  <span class="msg">
    A new version{#if version}{" "}<span class="mono">{version}</span>{/if} is available.
  </span>
  <span class="spacer"></span>
  <Button variant="primary" size="sm" onclick={() => onUpdate?.()}>Update</Button>
  <Button variant="ghost" size="sm" title="Dismiss" onclick={() => onDismiss?.()}>
    <Icon name="x" size={14} />
  </Button>
</div>

<style>
  .update-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 34px;
    padding: 0 0.5rem 0 0.85rem;
    background: var(--accent-weak);
    border-bottom: 1px solid var(--line);
    color: var(--ink-2);
    font-size: 12px;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--accent);
  }
  .msg .mono {
    color: var(--ink);
  }
  .spacer {
    flex: 1;
  }
</style>
