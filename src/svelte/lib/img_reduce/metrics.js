/**
 * Image comparison metrics, computed on raw 8-bit buffers.
 *
 * These are cross-checked against `magick compare` in the harness so every
 * number the benchmark reports is trustworthy. Two ImageMagick quirks worth
 * knowing when comparing: `compare -metric` writes to stderr, not stdout, and
 * identical images return 120 dB rather than infinity.
 */

import { srgb8ToOklab } from './color/oklab.js';

/** Mean squared error per channel-sample. */
export function mse(a, b) {
  if (a.length !== b.length) throw new Error('buffers differ in length');
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / a.length;
}

/** Root mean squared error, in 8-bit counts. */
export function rmse(a, b) {
  return Math.sqrt(mse(a, b));
}

/**
 * Peak signal-to-noise ratio in dB.
 * Identical buffers return Infinity; the harness maps that to ImageMagick's
 * 120 dB cap when comparing.
 */
export function psnr(a, b) {
  const m = mse(a, b);
  return m === 0 ? Infinity : 10 * Math.log10((255 * 255) / m);
}

/** Largest absolute per-channel error. */
export function maxAbsError(a, b) {
  if (a.length !== b.length) throw new Error('buffers differ in length');
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

/** Count of samples that differ at all. */
export function differingSamples(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

/** Count of pixels (RGB triples) that differ in any channel. */
export function differingPixels(a, b, channels = 3) {
  let n = 0;
  for (let i = 0; i < a.length; i += channels) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  }
  return n;
}

const _p = new Float64Array(3), _q = new Float64Array(3);

/**
 * Mean perceptual error in OkLab, in scaled OkLab units.
 *
 * This is the metric to grade a perceptually-optimised configuration by.
 * Grading it with PSNR instead is self-defeating: optimising in OkLab costs
 * around 4 dB of sRGB PSNR by construction.
 */
export function meanDeltaE(a, b, channels = 3) {
  if (a.length !== b.length) throw new Error('buffers differ in length');
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i += channels) {
    srgb8ToOklab(a[i], a[i + 1], a[i + 2], _p, 0);
    srgb8ToOklab(b[i], b[i + 1], b[i + 2], _q, 0);
    const dL = _p[0] - _q[0], da = _p[1] - _q[1], db = _p[2] - _q[2];
    s += Math.sqrt(dL * dL + da * da + db * db);
    n++;
  }
  return n === 0 ? 0 : s / n;
}

/** Distinct colour count of an interleaved buffer. */
export function countDistinct(buf, channels = 3) {
  const seen = new Set();
  for (let i = 0; i < buf.length; i += channels) {
    seen.add((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]);
  }
  return seen.size;
}

/** Everything at once, for report tables. */
export function compare(a, b, channels = 3) {
  return {
    psnr: psnr(a, b),
    rmse: rmse(a, b),
    maxAbsError: maxAbsError(a, b),
    meanDeltaE: meanDeltaE(a, b, channels),
    differingPixels: differingPixels(a, b, channels),
  };
}
