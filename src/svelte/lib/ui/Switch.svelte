<script lang="ts">
  import { Switch } from "bits-ui";

  interface Props {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    onCheckedChange?: (checked: boolean) => void;
  }

  let { checked = $bindable(false), disabled = false, id, onCheckedChange }: Props = $props();
</script>

<Switch.Root class="switch" bind:checked {disabled} {id} {onCheckedChange}>
  <Switch.Thumb class="switch-thumb" />
</Switch.Root>
