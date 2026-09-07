/**
 * Riemersma dithering: error diffusion along a Hilbert curve.
 *
 * Instead of pushing error to spatial neighbours, it keeps a short history of
 * recent errors along a space-filling curve and adds a decaying weighted sum of
 * them to the current pixel. Because the curve is locality-preserving, error
 * stays spatially contained without the directional worming that raster error
 * diffusion produces.
 *
 * The queue length and decay are the parameters everyone picks differently.
 * ImageMagick uses a 16-entry queue; we default to the same so the comparison
 * against it is meaningful, with a 1/16 decay across the queue.
 */

import { hilbertWalk } from './hilbert.js';
import { clampResidual, strengthFn } from './common.js';

/**
 * @param {Object} image
 * @param {import('../search/nearest.js').Nearest} nearest
 * @param {Float64Array} palWork
 * @param {import('../color/space.js').Space} space
 * @param {Uint8Array} indices
 * @param {Object} opts
 * @param {number} [opts.queue=16]
 * @param {number} [opts.decay=0.0625]
 * @param {number} [opts.strength=1]
 * @param {number} [opts.errorLimit=Infinity]
 * @param {Float32Array|null} [opts.edge]
 * @param {number} [opts.edgeSuppression=0]
 * @param {Uint8Array|null} [opts.skip]
 */
export function ditherRiemersma(image, nearest, palWork, space, indices, opts = {}) {
  const { data, width, height } = image;
  const channels = image.channels ?? (data.length / (width * height));
  const Q = Math.max(1, opts.queue ?? 16);
  const decay = opts.decay ?? 1 / 16;
  const limit = opts.errorLimit ?? Infinity;
  const skip = opts.skip ?? null;
  const strengthAt = strengthFn(opts, opts.edge ?? null);

  // weights[0] applies to the most recent error. Normalised so the total
  // contribution is 1, matching the scale of raster error diffusion.
  const weights = new Float64Array(Q);
  let wsum = 0;
  for (let j = 0; j < Q; j++) {
    weights[j] = Math.pow(decay, j / Math.max(1, Q - 1));
    wsum += weights[j];
  }
  for (let j = 0; j < Q; j++) weights[j] /= wsum;

  // ring buffer of the last Q residuals
  const hist = new Float64Array(Q * 3);
  let head = 0; // index of the slot the next error will occupy

  const px = new Float64Array(3);
  const res = new Float64Array(3);

  for (const p of hilbertWalk(width, height)) {
    const k = p * channels;
    if (skip && skip[p]) { indices[p] = 0; continue; }

    space.fromRGB8(data[k], data[k + 1], data[k + 2], px, 0);

    // most recent error is at head-1, walking backwards in time
    for (let j = 0; j < Q; j++) {
      const slot = ((head - 1 - j) % Q + Q) % Q;
      const o = slot * 3, w = weights[j];
      px[0] += hist[o] * w;
      px[1] += hist[o + 1] * w;
      px[2] += hist[o + 2] * w;
    }

    const idx = nearest.findContinuous(px[0], px[1], px[2]);
    indices[p] = idx;

    const q = idx * 3;
    const s = strengthAt(p);
    res[0] = (px[0] - palWork[q]) * s;
    res[1] = (px[1] - palWork[q + 1]) * s;
    res[2] = (px[2] - palWork[q + 2]) * s;
    if (limit !== Infinity) clampResidual(res, limit);

    const o = head * 3;
    hist[o] = res[0]; hist[o + 1] = res[1]; hist[o + 2] = res[2];
    head = (head + 1) % Q;
  }
}
