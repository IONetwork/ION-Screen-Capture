/**
 * img_reduce — zero-dependency image colour reduction.
 *
 * Takes raw pixel buffers and returns palette indices plus a palette. It does
 * no file I/O and has no dependencies, so it runs unchanged in Node, a browser,
 * a worker, or a Tauri webview. Decoding and encoding are the caller's job
 * (Canvas in a browser; whatever you like elsewhere).
 *
 *   import { quantize, remap, GRID_565 } from './img_reduce/src/index.js';
 *
 *   const { indices, palette } = quantize(
 *     { data, width, height, channels: 4 },
 *     { colors: 256, lattice: 'rgb565', dither: 'floyd-steinberg' },
 *   );
 *
 * Every pixel is assigned to its *exact* nearest palette entry. ImageMagick's
 * -remap does not do this — its octree search is bounded to a local subtree, so
 * it picks a farther colour on 14.8% of pixels against a 251-entry palette and
 * 31.8% against the full RGB565 grid. Measured on a photographic sample, being
 * exact is worth +1.29 dB PSNR and halves the worst-case channel error.
 */

export { reduce, quantize, remap, buildPalette } from './reduce.js';

export {
  LATTICE_565 as GRID_565,
  LATTICE_888 as GRID_888,
  createLattice,
  latticeToPalette,
  EXPANSIONS,
  packRGB565,
  unpackRGB565,
  packIndices565,
  byteSwap565,
  isOnLattice,
  snapToLattice,
  maxLatticeError,
  nearestLevelIndex,
} from './color/rgb565.js';

export { toRGB, toRGBA, toRGB565, paletteToRGB565 } from './pack.js';

export { SPACES, getSpace } from './color/space.js';
export { srgb8ToOklab, srgbfToOklab, oklabToSrgb8 } from './color/oklab.js';

export { createNearest, createBruteNearest, isFullLattice } from './search/nearest.js';

export { bayerMatrix } from './dither/ordered.js';
export { hilbertWalk, hilbertD2XY } from './dither/hilbert.js';

export * as metrics from './metrics.js';
