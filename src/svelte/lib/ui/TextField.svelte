<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    type?: "text" | "number";
    disabled?: boolean;
    class?: string;
    min?: number;
    max?: number;
    onkeydown?: (e: KeyboardEvent) => void;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(""),
    placeholder,
    type = "text",
    disabled = false,
    class: klass = "",
    min,
    max,
    onkeydown,
    onchange,
  }: Props = $props();

  // Native number inputs only step on the wheel while focused; make scrolling
  // over the field step it directly (and don't scroll the page underneath).
  function onwheel(e: WheelEvent) {
    if (type !== "number" || disabled) return;
    e.preventDefault();
    const cur = Number(value);
    let next = (Number.isFinite(cur) ? cur : 0) + (e.deltaY < 0 ? 1 : -1);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    value = String(next);
  }
</script>

<input
  class={`field ${klass}`}
  {type}
  {placeholder}
  {disabled}
  {min}
  {max}
  {onkeydown}
  {onwheel}
  onchange={(e) => onchange?.((e.currentTarget as HTMLInputElement).value)}
  bind:value
/>
