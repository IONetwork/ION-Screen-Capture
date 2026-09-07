/**
 * Shared machinery for the dither implementations.
 */

import { createNearestFromCoords } from '../search/nearest.js';

/** Palette (8-bit RGB) as working-space coordinates. */
export function paletteToWorking(palette, space) {
  const n = palette.length / 3;
  const out = new Float64Array(n * 3);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    space.fromRGB8(palette[o], palette[o + 1], palette[o + 2], out, o);
  }
  return out;
}

/**
 * Mean distance from each palette entry to its nearest neighbour, in working
 * space. This sets the scale for the error clamp: a residual much larger than
 * the typical gap between entries means the pixel's colour is nowhere near
 * anything in the palette, and diffusing it at full strength is what produces
 * the sparkle halo around a thin bright trace on a dark background.
 */
export function meanPaletteSpacing(palWork, n) {
  if (n < 2) return 1;
  const nrst = createNearestFromCoords(palWork, n);
  let total = 0, counted = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    // nearest OTHER entry: brute force over a small palette is fine, but reuse
    // the accelerator where it helps by excluding self after the fact
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const p = j * 3;
      const d0 = palWork[o] - palWork[p];
      const d1 = palWork[o + 1] - palWork[p + 1];
      const d2 = palWork[o + 2] - palWork[p + 2];
      const d = d0 * d0 + d1 * d1 + d2 * d2;
      if (d < bd) bd = d;
    }
    if (bd < Infinity) { total += Math.sqrt(bd); counted++; }
  }
  void nrst;
  return counted > 0 ? total / counted : 1;
}

/**
 * Normalised gradient magnitude, 0..1 per pixel.
 *
 * Used to suppress dithering on edges and thin features. Flat regions and
 * gradients get full dither (so no banding), edges get none (so no speckle).
 * This is the mechanism that protects a one-pixel-wide oscilloscope trace.
 */
export function edgeMap(image) {
  const { data, width, height } = image;
  const channels = image.channels ?? (data.length / (width * height));
  const out = new Float32Array(width * height);
  const lum = (k) => 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xm = x > 0 ? x - 1 : x, xp = x < width - 1 ? x + 1 : x;
      const ym = y > 0 ? y - 1 : y, yp = y < height - 1 ? y + 1 : y;
      const gx = lum((y * width + xp) * channels) - lum((y * width + xm) * channels);
      const gy = lum((yp * width + x) * channels) - lum((ym * width + x) * channels);
      const m = Math.sqrt(gx * gx + gy * gy);
      out[y * width + x] = m;
      if (m > max) max = m;
    }
  }
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

/** Clamp each component of a residual to +/- limit. */
export function clampResidual(e, limit) {
  if (e[0] > limit) e[0] = limit; else if (e[0] < -limit) e[0] = -limit;
  if (e[1] > limit) e[1] = limit; else if (e[1] < -limit) e[1] = -limit;
  if (e[2] > limit) e[2] = limit; else if (e[2] < -limit) e[2] = -limit;
}

/**
 * Per-pixel dither strength, combining the global setting with edge
 * suppression. Returns a function of pixel index.
 */
export function strengthFn(opts, edge) {
  const s = opts.strength ?? 1;
  if (!edge || !(opts.edgeSuppression > 0)) return () => s;
  const k = opts.edgeSuppression;
  return (p) => {
    const e = edge[p] * k;
    return s * (1 - (e > 1 ? 1 : e));
  };
}
