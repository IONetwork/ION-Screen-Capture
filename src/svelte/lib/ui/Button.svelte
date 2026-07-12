<script lang="ts">
  import { Button } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "primary" | "default" | "ghost" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    type?: "button" | "submit";
    title?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let { variant = "default", size = "md", children, ...rest }: Props = $props();
</script>

<Button.Root class={`btn btn-${variant} btn-${size}`} {...rest}>
  {@render children()}
</Button.Root>
