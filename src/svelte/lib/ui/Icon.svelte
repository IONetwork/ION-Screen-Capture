<script lang="ts" module>
  // Monochrome line icons (24×24, currentColor stroke). No emoji anywhere.
  export const ICONS: Record<string, string> = {
    scan: '<circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />',
    capture:
      '<path d="M4 7h3l1.5-2h7L17 7h3v12H4z" /><circle cx="12" cy="12.5" r="3.4" />',
    settings:
      '<line x1="3" y1="8" x2="21" y2="8" /><line x1="3" y1="16" x2="21" y2="16" /><circle cx="9" cy="8" r="2.3" fill="var(--surface)" /><circle cx="15" cy="16" r="2.3" fill="var(--surface)" />',
    x: '<line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />',
    folder: '<path d="M3 6.5h5.5l2 2H21V19H3z" />',
    disconnect:
      '<path d="M12 3v9" /><path d="M6.5 7a8 8 0 1 0 11 0" />',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" />',
    wave: '<path d="M2 12h3l2.5-6 3.5 12 2.5-9 2 3H22" />',
    chevron: '<path d="M6 9l6 6 6-6" />',
    minimize: '<line x1="5" y1="12" x2="19" y2="12" />',
    maximize: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />',
    restore: '<rect x="8" y="8" width="11" height="11" rx="1.5" /><path d="M5.5 16.5V5.5H16" />',
    theme:
      '<circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />',
  };
</script>

<script lang="ts">
  interface Props {
    name: keyof typeof ICONS;
    size?: number;
  }
  let { name, size = 16 }: Props = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {@html ICONS[name]}
</svg>
