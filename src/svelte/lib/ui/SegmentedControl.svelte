<script lang="ts">
  import { ToggleGroup } from "bits-ui";

  interface Option {
    value: string;
    label: string;
  }
  interface Props {
    options: Option[];
    value?: string;
    onValueChange?: (value: string) => void;
  }

  let { options, value = $bindable(""), onValueChange }: Props = $props();
</script>

<ToggleGroup.Root type="single" class="seg" bind:value {onValueChange}>
  {#each options as o (o.value)}
    <ToggleGroup.Item class="seg-item" value={o.value}>{o.label}</ToggleGroup.Item>
  {/each}
</ToggleGroup.Root>
