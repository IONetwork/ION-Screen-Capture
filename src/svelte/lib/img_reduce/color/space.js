/**
 * Working-space strategies.
 *
 * Wu, Lloyd's, the nearest-colour search and the dither loop are all written
 * once against this interface, so switching space changes the geometry without
 * touching any algorithm. It is also what lets the benchmark harness run the
 * sRGB and OkLab configurations through identical code paths.
 *
 * All three spaces carry roughly 0..255 magnitudes so error clamps and
 * thresholds share units.
 */

import { SRGB8_TO_LINEAR, linearToSrgb8, srgbToLinear, toByte } from './srgb.js';
import { srgb8ToOklab, srgbfToOklab, oklabToSrgb8 } from './oklab.js';

/**
 * @typedef {Object} Space
 * @property {string} name
 * @property {(r:number,g:number,b:number,out:Float64Array,o?:number)=>void} fromRGB8
 *   fast path; r/g/b must be INTEGERS 0..255 (table-driven)
 * @property {(r:number,g:number,b:number,out:Float64Array,o?:number)=>void} fromRGBf
 *   real-valued input, possibly fractional or out of range
 * @property {(c0:number,c1:number,c2:number,out:Uint8Array|number[],o?:number)=>void} toRGB8
 * @property {boolean} isIdentity  true when the space is 8-bit sRGB itself
 */

/** Gamma-encoded sRGB, used directly. Matches what ImageMagick does by default. */
export const srgb = {
  name: 'srgb',
  isIdentity: true,
  fromRGB8(r, g, b, out, o = 0) {
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  },
  fromRGBf(r, g, b, out, o = 0) {
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  },
  toRGB8(c0, c1, c2, out, o = 0) {
    out[o] = toByte(c0); out[o + 1] = toByte(c1); out[o + 2] = toByte(c2);
  },
};

/**
 * Linear light, scaled to 0..255.
 *
 * Diffusing dither error here preserves mean *luminance*, which is the right
 * invariant only when the result will be optically averaged (downscaling, LED
 * matrices). For direct screen viewing it under-dithers shadows and
 * over-dithers highlights, so it is offered but not the default.
 */
export const linear = {
  name: 'linear',
  isIdentity: false,
  fromRGB8(r, g, b, out, o = 0) {
    out[o] = SRGB8_TO_LINEAR[r] * 255;
    out[o + 1] = SRGB8_TO_LINEAR[g] * 255;
    out[o + 2] = SRGB8_TO_LINEAR[b] * 255;
  },
  fromRGBf(r, g, b, out, o = 0) {
    out[o] = srgbToLinear(r / 255) * 255;
    out[o + 1] = srgbToLinear(g / 255) * 255;
    out[o + 2] = srgbToLinear(b / 255) * 255;
  },
  toRGB8(c0, c1, c2, out, o = 0) {
    out[o] = linearToSrgb8(c0 / 255);
    out[o + 1] = linearToSrgb8(c1 / 255);
    out[o + 2] = linearToSrgb8(c2 / 255);
  },
};

/** Perceptually uniform. The default: best palette allocation and best search. */
export const oklab = {
  name: 'oklab',
  isIdentity: false,
  fromRGB8: srgb8ToOklab,
  fromRGBf: srgbfToOklab,
  toRGB8(c0, c1, c2, out, o = 0) {
    oklabToSrgb8(c0, c1, c2, out, o);
  },
};

export const SPACES = { srgb, linear, oklab };

/** @param {string} name */
export function getSpace(name) {
  const s = SPACES[name];
  if (!s) throw new Error(`unknown space "${name}" (expected one of ${Object.keys(SPACES).join(', ')})`);
  return s;
}
