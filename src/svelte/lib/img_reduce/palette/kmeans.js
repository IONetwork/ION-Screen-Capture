/**
 * Lloyd's algorithm (k-means) refinement of an initial palette.
 *
 * This is not optional polish. Measured against ImageMagick's octree at N=64
 * on a photographic sample:
 *
 *   IM -colors 64                27.610 dB
 *   box-splitting alone          27.202 dB   (loses by 0.41)
 *   + 1 Lloyd's iteration        28.183 dB   (+0.57)
 *   + 8 iterations               29.039 dB   (+1.43)
 *   + 12 iterations              29.144 dB   (+1.53)
 *
 * Without refinement the adaptive path is *worse* than the thing we are trying
 * to beat. Returns diminish past about 8 iterations, which is the default.
 *
 * Refinement runs over histogram *cells* rather than pixels, so cost is bounded
 * by the bin count (at most 65536) instead of the pixel count, and the
 * accelerator is rebuilt once per iteration rather than consulted per pixel.
 *
 * Determinism: no RNG. The initial centroids come from Wu, and empty clusters
 * are re-seeded from the worst-fitting cell by index order.
 */

import { createNearestFromCoords } from '../search/nearest.js';

/**
 * @param {Float64Array} centroidsRGB initial centroids, n*3, RGB 0..255 floats
 * @param {number} k centroid count
 * @param {{coords:Float64Array,weights:Float64Array,count:number}} cloud
 *        weighted cell cloud in RGB 0..255
 * @param {Object} opts
 * @param {import('../color/space.js').Space} opts.space
 * @param {number} [opts.iterations=8]
 * @param {Uint8Array|null} [opts.pinned] 1 where a centroid is immutable
 * @returns {{centroids:Float64Array,sse:number,iterations:number,moved:number}}
 */
export function refine(centroidsRGB, k, cloud, opts) {
  const { space } = opts;
  const iterations = opts.iterations ?? 8;
  const pinned = opts.pinned ?? null;
  const n = cloud.count;
  if (k < 1 || n === 0 || iterations < 1) {
    return { centroids: Float64Array.from(centroidsRGB), sse: NaN, iterations: 0, moved: 0 };
  }

  // Cells and centroids into the working space. fromRGBf, not fromRGB8: cell
  // means and Wu centroids are continuous, and the 8-bit path is a table lookup
  // that returns undefined for a fractional index.
  const cells = new Float64Array(n * 3);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    space.fromRGBf(cloud.coords[o], cloud.coords[o + 1], cloud.coords[o + 2], cells, o);
  }
  const cen = new Float64Array(k * 3);
  for (let i = 0, o = 0; i < k; i++, o += 3) {
    space.fromRGBf(centroidsRGB[o], centroidsRGB[o + 1], centroidsRGB[o + 2], cen, o);
  }

  const w = cloud.weights;
  const sum = new Float64Array(k * 3);
  const sw = new Float64Array(k);
  const assign = new Int32Array(n);
  const clusterSse = new Float64Array(k);

  let sse = Infinity, done = 0, moved = 0;

  for (let it = 0; it < iterations; it++) {
    const nrst = createNearestFromCoords(cen, k);
    sum.fill(0); sw.fill(0); clusterSse.fill(0);
    let total = 0;

    for (let i = 0, o = 0; i < n; i++, o += 3) {
      const c0 = cells[o], c1 = cells[o + 1], c2 = cells[o + 2];
      const a = nrst.findContinuous(c0, c1, c2);
      assign[i] = a;
      const p = a * 3;
      const d0 = c0 - cen[p], d1 = c1 - cen[p + 1], d2 = c2 - cen[p + 2];
      const d = (d0 * d0 + d1 * d1 + d2 * d2) * w[i];
      clusterSse[a] += d;
      total += d;
      sum[p] += c0 * w[i]; sum[p + 1] += c1 * w[i]; sum[p + 2] += c2 * w[i];
      sw[a] += w[i];
    }

    // update
    for (let a = 0; a < k; a++) {
      if (pinned && pinned[a]) continue;
      const p = a * 3;
      if (sw[a] > 0) {
        cen[p] = sum[p] / sw[a];
        cen[p + 1] = sum[p + 1] / sw[a];
        cen[p + 2] = sum[p + 2] / sw[a];
      }
    }

    // re-seed empty clusters at the worst-fitting cell of the worst cluster.
    // Deterministic: lowest index wins every tie.
    for (let a = 0; a < k; a++) {
      if (sw[a] > 0 || (pinned && pinned[a])) continue;
      let worstCluster = -1, worstVal = -1;
      for (let b = 0; b < k; b++) {
        if (sw[b] > 0 && clusterSse[b] > worstVal) { worstVal = clusterSse[b]; worstCluster = b; }
      }
      if (worstCluster < 0) break;
      let far = -1, farVal = -1;
      for (let i = 0; i < n; i++) {
        if (assign[i] !== worstCluster) continue;
        const o = i * 3, p = worstCluster * 3;
        const d0 = cells[o] - cen[p], d1 = cells[o + 1] - cen[p + 1], d2 = cells[o + 2] - cen[p + 2];
        const d = d0 * d0 + d1 * d1 + d2 * d2;
        if (d > farVal) { farVal = d; far = i; }
      }
      if (far < 0) break;
      const p = a * 3, o = far * 3;
      cen[p] = cells[o]; cen[p + 1] = cells[o + 1]; cen[p + 2] = cells[o + 2];
      // charge the moved cell to the new cluster so two empties don't collide
      clusterSse[worstCluster] -= farVal * w[far];
      sw[a] = w[far];
      assign[far] = a;
      moved++;
    }

    done = it + 1;
    // Lloyd's is monotone; stop once it stops improving meaningfully.
    // `it > 0` matters: on the first pass sse is Infinity, and
    // Infinity - total <= Infinity is true, which would break immediately.
    if (it > 0 && sse - total <= Math.abs(total) * 1e-12) { sse = total; break; }
    sse = total;
  }

  // back to RGB
  const outRGB = new Float64Array(k * 3);
  const tmp = new Uint8Array(3);
  for (let a = 0, o = 0; a < k; a++, o += 3) {
    space.toRGB8(cen[o], cen[o + 1], cen[o + 2], tmp, 0);
    outRGB[o] = tmp[0]; outRGB[o + 1] = tmp[1]; outRGB[o + 2] = tmp[2];
  }

  return { centroids: outRGB, sse, iterations: done, moved };
}

/**
 * Weighted SSE of a palette against a cell cloud, in a given space.
 * Used by tests and by the snap/refill phase to assert it never makes things
 * worse.
 */
export function paletteSse(palette, cloud, space) {
  const k = palette.length / 3;
  const cen = new Float64Array(k * 3);
  for (let i = 0, o = 0; i < k; i++, o += 3) {
    space.fromRGB8(palette[o], palette[o + 1], palette[o + 2], cen, o);
  }
  const nrst = createNearestFromCoords(cen, k);
  const t = new Float64Array(3);
  let total = 0;
  for (let i = 0, o = 0; i < cloud.count; i++, o += 3) {
    space.fromRGBf(cloud.coords[o], cloud.coords[o + 1], cloud.coords[o + 2], t, 0);
    const a = nrst.findContinuous(t[0], t[1], t[2]) * 3;
    const d0 = t[0] - cen[a], d1 = t[1] - cen[a + 1], d2 = t[2] - cen[a + 2];
    total += (d0 * d0 + d1 * d1 + d2 * d2) * cloud.weights[i];
  }
  return total;
}
