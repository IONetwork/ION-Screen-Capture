<script lang="ts">
  import { Dialog } from "bits-ui";
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    open?: boolean;
    title: string;
    children: Snippet;
    /**
     * Header close affordance. Turn it off for a dialog that finishes with a
     * footer action instead, where an X would read as "discard".
     */
    showClose?: boolean;
    /** Bottom bar, right-aligned. */
    footer?: Snippet;
  }
  let { open = $bindable(false), title, children, showClose = true, footer }: Props = $props();

  let footEl = $state<HTMLElement | null>(null);
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="dlg-overlay" />
    <Dialog.Content
      class="dlg-content"
      onOpenAutoFocus={(e) => {
        // bits-ui focuses the first focusable child on open. With no header X
        // that is the first control in the body, which for Settings is a Switch,
        // so a stray Space right after opening would flip a setting. Send focus
        // to the footer action instead, where Enter just closes the dialog.
        const btn = footEl?.querySelector("button");
        if (!btn) return;
        e.preventDefault();
        btn.focus();
      }}
    >
      <div class="dlg-head">
        <Dialog.Title class="dlg-title">{title}</Dialog.Title>
        {#if showClose}
          <Dialog.Close class="dlg-close" aria-label="Close">
            <Icon name="x" size={15} />
          </Dialog.Close>
        {/if}
      </div>
      <div class="dlg-body">{@render children()}</div>
      {#if footer}
        <div class="dlg-foot" bind:this={footEl}>{@render footer()}</div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
