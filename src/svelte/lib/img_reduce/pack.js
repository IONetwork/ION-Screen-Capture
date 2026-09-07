/**
 * Output packing helpers.
 *
 * The library's own result is indices + palette, which is what an indexed
 * encoder wants. These turn it back into pixels, or into the packed 16-bit
 * form a display actually consumes.
 */

import { packRGB565, LATTICE_565, byteSwap565 } from './color/rgb565.js';

/** Expand indices + palette back to interleaved RGB. */
export function toRGB(indices, palette, out = null) {
  const px = indices.length;
  const dst = out ?? new Uint8Array(px * 3);
  for (let p = 0; p < px; p++) {
    const s = indices[p] * 3, d = p * 3;
    dst[d] = palette[s]; dst[d + 1] = palette[s + 1]; dst[d + 2] = palette[s + 2];
  }
  return dst;
}

/**
 * Expand to interleaved RGBA. Pixels whose index is `transparentIndex` get
 * alpha 0; everything else 255.
 */
export function toRGBA(indices, palette, transparentIndex = null, out = null) {
  const px = indices.length;
  const dst = out ?? new Uint8Array(px * 4);
  for (let p = 0; p < px; p++) {
    const i = indices[p], s = i * 3, d = p * 4;
    dst[d] = palette[s]; dst[d + 1] = palette[s + 1]; dst[d + 2] = palette[s + 2];
    dst[d + 3] = (transparentIndex !== null && i === transparentIndex) ? 0 : 255;
  }
  return dst;
}

/**
 * Pack indices + palette into uint16 RGB565, one entry per pixel.
 *
 * @param {Uint8Array} indices
 * @param {Uint8Array} palette
 * @param {Object} [opts]
 * @param {Object} [opts.lattice=LATTICE_565]
 * @param {'le'|'be'} [opts.byteOrder='le'] 'be' byte-swaps, which is what most
 *        SPI panels (ST7789 and friends) expect
 */
export function toRGB565(indices, palette, opts = {}) {
  const lat = opts.lattice ?? LATTICE_565;
  const n = palette.length / 3;
  // palette entries are few; precompute their packed values once
  const packed = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    packed[i] = packRGB565(palette[o], palette[o + 1], palette[o + 2], lat);
  }
  const out = new Uint16Array(indices.length);
  for (let p = 0; p < indices.length; p++) out[p] = packed[indices[p]];
  if (opts.byteOrder === 'be') byteSwap565(out);
  return out;
}

/** Palette as packed RGB565 entries, for uploading a hardware LUT. */
export function paletteToRGB565(palette, opts = {}) {
  const lat = opts.lattice ?? LATTICE_565;
  const n = palette.length / 3;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    out[i] = packRGB565(palette[o], palette[o + 1], palette[o + 2], lat);
  }
  if (opts.byteOrder === 'be') byteSwap565(out);
  return out;
}
