/**
 * OkLab (Björn Ottosson, 2020).
 *
 * Used as the working space for palette generation and nearest-colour search.
 * sRGB Euclidean distance gives blue roughly a third of the distance budget
 * while blue carries about 7% of luminance, so an sRGB-MSE palette spends
 * entries on blue variation and starves greys and greens. OkLab fixes the
 * allocation.
 *
 * Values are scaled by OKLAB_SCALE so all three working spaces carry roughly
 * 0..255 magnitudes. A uniform scale cannot change which entry is nearest, so
 * this is purely so error clamps and thresholds share units across spaces.
 */

import { SRGB8_TO_LINEAR, linearToSrgb8, srgbToLinear } from './srgb.js';

/** Uniform scale applied to L, a and b. Does not affect argmin ordering. */
export const OKLAB_SCALE = 255;

const cbrt = Math.cbrt;

/**
 * Linear-light RGB (0..1) -> OkLab, scaled. Writes 3 values into `out`.
 * @param {number} r @param {number} g @param {number} b
 * @param {Float64Array|number[]} out
 * @param {number} [o] offset into out
 */
export function linearToOklab(r, g, b, out, o = 0) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = cbrt(l), m_ = cbrt(m), s_ = cbrt(s);

  out[o]     = OKLAB_SCALE * (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_);
  out[o + 1] = OKLAB_SCALE * (1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_);
  out[o + 2] = OKLAB_SCALE * (0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_);
}

/** Scaled OkLab -> linear-light RGB (0..1, unclamped). Writes into `out`. */
export function oklabToLinear(L, A, B, out, o = 0) {
  const li = L / OKLAB_SCALE, ai = A / OKLAB_SCALE, bi = B / OKLAB_SCALE;

  const l_ = li + 0.3963377774 * ai + 0.2158037573 * bi;
  const m_ = li - 0.1055613458 * ai - 0.0638541728 * bi;
  const s_ = li - 0.0894841775 * ai - 1.2914855480 * bi;

  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;

  out[o]     =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[o + 1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[o + 2] = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
}

/**
 * 8-bit sRGB -> scaled OkLab. Fast path: r, g, b MUST be integers 0..255,
 * because the linearisation is a table lookup. A fractional index would return
 * undefined and poison everything downstream with NaN — use srgbfToOklab for
 * continuous input (centroids, diffused pixels, cell means).
 */
export function srgb8ToOklab(r, g, b, out, o = 0) {
  linearToOklab(SRGB8_TO_LINEAR[r], SRGB8_TO_LINEAR[g], SRGB8_TO_LINEAR[b], out, o);
}

/**
 * Real-valued sRGB (0..255, may be fractional or out of range) -> scaled OkLab.
 * Computes the transfer function directly instead of using the table.
 */
export function srgbfToOklab(r, g, b, out, o = 0) {
  linearToOklab(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255), out, o);
}

const _tmp = new Float64Array(3);

/** Scaled OkLab -> 8-bit sRGB, clamped. */
export function oklabToSrgb8(L, A, B, out, o = 0) {
  oklabToLinear(L, A, B, _tmp, 0);
  out[o]     = linearToSrgb8(_tmp[0]);
  out[o + 1] = linearToSrgb8(_tmp[1]);
  out[o + 2] = linearToSrgb8(_tmp[2]);
}

/**
 * Perceptual distance between two 8-bit sRGB colours, in OkLab.
 * Returns squared distance in scaled OkLab units.
 */
const _a = new Float64Array(3), _b = new Float64Array(3);
export function deltaE2(r1, g1, b1, r2, g2, b2) {
  srgb8ToOklab(r1, g1, b1, _a, 0);
  srgb8ToOklab(r2, g2, b2, _b, 0);
  const dL = _a[0] - _b[0], da = _a[1] - _b[1], db = _a[2] - _b[2];
  return dL * dL + da * da + db * db;
}
