<script lang="ts">
  // Dropdown for a short list of values. Use this rather than a raw <select>,
  // and rather than SegmentedControl when the options do not fit on one row
  // (a settings dialog row is much narrower than the capture toolbar).
  import { Select } from "bits-ui";
  import Icon from "./Icon.svelte";

  interface Option {
    value: string;
    label: string;
  }
  interface Props {
    options: Option[];
    value?: string;
    disabled?: boolean;
    /** Shown on the trigger when nothing matches `value`. */
    placeholder?: string;
    onValueChange?: (value: string) => void;
  }

  let {
    options,
    value = $bindable(""),
    disabled = false,
    placeholder = "",
    onValueChange,
  }: Props = $props();

  const label = $derived(options.find((o) => o.value === value)?.label ?? placeholder);
</script>

<Select.Root type="single" items={options} bind:value {onValueChange} {disabled}>
  <Select.Trigger class="sel-trigger" aria-label={placeholder || undefined}>
    <span class="sel-label">{label}</span>
    <Icon name="chevron" size={12} />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class="sel-content" sideOffset={4}>
      <Select.Viewport>
        {#each options as o (o.value)}
          <Select.Item class="sel-item" value={o.value} label={o.label}>
            {o.label}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
