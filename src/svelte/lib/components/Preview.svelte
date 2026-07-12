<!-- Signature element: an oscilloscope-style graticule screen. Shows the
     captured image, or a flat-baseline "no signal" trace when empty.
     When a capture is shown and copy/save handlers are provided, right-clicking
     the image opens a small custom menu (the WebView's default menu is
     suppressed app-wide). -->
<script lang="ts">
  interface Props {
    src?: string | null;
    onCopy?: () => void;
    onSave?: () => void;
  }
  let { src = null, onCopy, onSave }: Props = $props();

  const vLines = [40, 80, 120, 160, 240, 280, 320, 360];
  const hLines = [30, 60, 90, 120, 180, 210, 240, 270];

  let menu = $state<{ x: number; y: number } | null>(null);
  let firstItem = $state<HTMLButtonElement | null>(null);

  const hasMenu = $derived(!!src && (!!onCopy || !!onSave));

  function openMenu(e: MouseEvent) {
    if (!hasMenu) return;
    e.preventDefault();
    // Clamp so the menu never spills past the window edges.
    const mw = 200;
    const mh = 84;
    const pad = 8;
    const x = Math.max(pad, Math.min(e.clientX, window.innerWidth - mw - pad));
    const y = Math.max(pad, Math.min(e.clientY, window.innerHeight - mh - pad));
    menu = { x, y };
  }
  function closeMenu() {
    menu = null;
  }
  function doCopy() {
    onCopy?.();
    closeMenu();
  }
  function doSave() {
    onSave?.();
    closeMenu();
  }

  // Move keyboard focus into the menu when it opens (Escape/Enter then work).
  $effect(() => {
    if (menu && firstItem) firstItem.focus();
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (menu && e.key === "Escape") closeMenu();
  }}
/>

<div class="screen" class:empty={!src} oncontextmenu={openMenu} role="presentation">
  {#if src}
    <img {src} alt="captured instrument screen" />
  {:else}
    <svg class="grat" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
      {#each vLines as x}<line x1={x} y1="0" x2={x} y2="300" class="div" />{/each}
      {#each hLines as y}<line x1="0" y1={y} x2="400" y2={y} class="div" />{/each}
      <line x1="200" y1="0" x2="200" y2="300" class="axis" />
      <line x1="0" y1="150" x2="400" y2="150" class="axis" />
      <polyline points="16,150 384,150" class="trace" />
    </svg>
    <span class="await micro-label">awaiting capture</span>
    <span class="corner tl"></span>
    <span class="corner tr"></span>
    <span class="corner bl"></span>
    <span class="corner br"></span>
  {/if}
</div>

{#if menu}
  <!-- transparent full-window catcher: any click/right-click outside closes -->
  <div
    class="cm-scrim"
    role="presentation"
    onpointerdown={closeMenu}
    oncontextmenu={(e) => {
      e.preventDefault();
      closeMenu();
    }}
  ></div>
  <div class="cm" style="left: {menu.x}px; top: {menu.y}px" role="menu" tabindex="-1">
    <button bind:this={firstItem} type="button" role="menuitem" class="cm-item" onclick={doCopy}>
      Copy image
    </button>
    <button type="button" role="menuitem" class="cm-item" onclick={doSave}> Save image as… </button>
  </div>
{/if}

<style>
  .screen {
    position: relative;
    width: 100%;
    border: 1px solid var(--line-2);
    border-radius: var(--r-sm);
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  /* Empty placeholder keeps the oscilloscope-graticule signature look. */
  .screen.empty {
    aspect-ratio: 4 / 3;
    background: #0d1012;
  }
  /* A real capture fills the panel's remaining space and scales to fit
     whichever dimension is limiting (object-fit: contain) - never cropped,
     never scrolled. min-height:0 lets the box shrink so nothing overflows. */
  .screen:not(.empty) {
    flex: 1;
    min-height: 0;
    background: var(--inset);
  }
  img {
    /* Absolutely fill the (flex-sized) .screen so the image never feeds its
       intrinsic height back into the layout; contain scales it to fit. */
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .grat {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .div {
    stroke: #23292c;
    stroke-width: 1;
  }
  .axis {
    stroke: #333b3f;
    stroke-width: 1;
    stroke-dasharray: 1 5;
  }
  .trace {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    opacity: 0.8;
  }
  .await {
    position: absolute;
    color: #48525880;
    letter-spacing: 0.16em;
  }
  .corner {
    position: absolute;
    width: 9px;
    height: 9px;
    border: 1.5px solid #4a5459;
  }
  .tl {
    top: 6px;
    left: 6px;
    border-right: 0;
    border-bottom: 0;
  }
  .tr {
    top: 6px;
    right: 6px;
    border-left: 0;
    border-bottom: 0;
  }
  .bl {
    bottom: 6px;
    left: 6px;
    border-right: 0;
    border-top: 0;
  }
  .br {
    bottom: 6px;
    right: 6px;
    border-left: 0;
    border-top: 0;
  }

  /* custom right-click menu */
  .cm-scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
  }
  .cm {
    position: fixed;
    z-index: 61;
    min-width: 172px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--line-2);
    border-radius: var(--r-sm);
    box-shadow: 0 8px 28px rgba(16, 19, 23, 0.22);
  }
  .cm-item {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 12px;
    line-height: 1;
    padding: 7px 10px;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    white-space: nowrap;
  }
  .cm-item:hover {
    background: var(--inset);
  }
</style>
