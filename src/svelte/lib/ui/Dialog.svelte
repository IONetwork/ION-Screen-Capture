<script lang="ts">
  import { Dialog } from "bits-ui";
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    open?: boolean;
    title: string;
    children: Snippet;
  }
  let { open = $bindable(false), title, children }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="dlg-overlay" />
    <Dialog.Content class="dlg-content">
      <div class="dlg-head">
        <Dialog.Title class="dlg-title">{title}</Dialog.Title>
        <Dialog.Close class="dlg-close" aria-label="Close settings">
          <Icon name="x" size={15} />
        </Dialog.Close>
      </div>
      <div class="dlg-body">{@render children()}</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
