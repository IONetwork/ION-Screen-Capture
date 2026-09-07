/**
 * Floyd-Steinberg error diffusion, serpentine.
 *
 * Two deliberate departures from ImageMagick:
 *
 *  - The nearest-colour lookup is exact and uncached. ImageMagick memoises
 *    lookups in a 5-bits-per-channel table that persists for the whole image,
 *    so the first pixel to land in a bucket fixes the colour every later pixel
 *    in that bucket gets, whatever its own diffused value. That is a real
 *    scan-order artefact; we don't reproduce it.
 *  - The residual is clamped. An unclamped residual from a pixel whose colour
 *    is far from every palette entry sprays error across its neighbours, which
 *    is exactly the halo you get around a thin bright trace on a dark field.
 *
 * The query passed to the search is continuous and can fall outside the 8-bit
 * range, which is why it must go through findContinuous and not a byte table.
 */

import { clampResidual, strengthFn } from './common.js';

/**
 * @param {Object} image {data,width,height,channels}
 * @param {import('../search/nearest.js').Nearest} nearest
 * @param {Float64Array} palWork palette in working space, n*3
 * @param {import('../color/space.js').Space} space
 * @param {Uint8Array} indices output, width*height
 * @param {Object} opts
 * @param {number} [opts.strength=1]
 * @param {boolean} [opts.serpentine=true]
 * @param {number} [opts.errorLimit=Infinity] absolute clamp on each residual component
 * @param {Float32Array|null} [opts.edge]
 * @param {number} [opts.edgeSuppression=0]
 * @param {Uint8Array|null} [opts.skip] 1 = leave this pixel unassigned (transparent)
 */
export function ditherFloydSteinberg(image, nearest, palWork, space, indices, opts = {}) {
  const { data, width, height } = image;
  const channels = image.channels ?? (data.length / (width * height));
  const serpentine = opts.serpentine !== false;
  const limit = opts.errorLimit ?? Infinity;
  const skip = opts.skip ?? null;
  const strengthAt = strengthFn(opts, opts.edge ?? null);

  // Two row buffers of 3-vectors. errCur holds error owed to pixels in the
  // current row, errNext to the row below.
  let errCur = new Float64Array(width * 3);
  let errNext = new Float64Array(width * 3);

  const px = new Float64Array(3);
  const res = new Float64Array(3);

  for (let y = 0; y < height; y++) {
    const tmp = errCur; errCur = errNext; errNext = tmp;
    errNext.fill(0);

    const dir = (serpentine && (y & 1)) ? -1 : 1;

    for (let i = 0; i < width; i++) {
      const x = dir > 0 ? i : width - 1 - i;
      const p = y * width + x;
      const k = p * channels;
      const e = x * 3;

      if (skip && skip[p]) { indices[p] = 0; continue; }

      space.fromRGB8(data[k], data[k + 1], data[k + 2], px, 0);
      px[0] += errCur[e];
      px[1] += errCur[e + 1];
      px[2] += errCur[e + 2];

      const idx = nearest.findContinuous(px[0], px[1], px[2]);
      indices[p] = idx;

      const q = idx * 3;
      const s = strengthAt(p);
      if (s <= 0) continue; // no diffusion from this pixel at all

      res[0] = (px[0] - palWork[q]) * s;
      res[1] = (px[1] - palWork[q + 1]) * s;
      res[2] = (px[2] - palWork[q + 2]) * s;
      if (limit !== Infinity) clampResidual(res, limit);

      // Mirrored weights: the "forward" neighbour is x+dir, so the diagonals
      // swap sides on a right-to-left row while the straight-down 5/16 does not.
      const xf = x + dir;      // forward, same row
      const xb = x - dir;      // backward, next row
      if (xf >= 0 && xf < width) {
        const t = xf * 3;
        errCur[t]     += res[0] * 7 / 16;
        errCur[t + 1] += res[1] * 7 / 16;
        errCur[t + 2] += res[2] * 7 / 16;
      }
      if (y + 1 < height) {
        if (xb >= 0 && xb < width) {
          const t = xb * 3;
          errNext[t]     += res[0] * 3 / 16;
          errNext[t + 1] += res[1] * 3 / 16;
          errNext[t + 2] += res[2] * 3 / 16;
        }
        {
          const t = x * 3;
          errNext[t]     += res[0] * 5 / 16;
          errNext[t + 1] += res[1] * 5 / 16;
          errNext[t + 2] += res[2] * 5 / 16;
        }
        if (xf >= 0 && xf < width) {
          const t = xf * 3;
          errNext[t]     += res[0] * 1 / 16;
          errNext[t + 1] += res[1] * 1 / 16;
          errNext[t + 2] += res[2] * 1 / 16;
        }
      }
    }
  }
}
