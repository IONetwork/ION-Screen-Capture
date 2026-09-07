/**
 * Top a palette up to the requested entry count by farthest-point seeding.
 *
 * Why this is needed: Wu splits a 3D histogram, so it can never return more
 * boxes than there are non-empty bins. At 32 bins per channel a grayscale ramp
 * collapses onto ~32 diagonal bins, so `-colors 64` on a grayscale image
 * yielded only 36 entries — and measured against ImageMagick, whose octree
 * reaches full 8-bit depth, that cost us about 1.1 dB on exactly those images.
 *
 * Adding the missing centroids here, *before* Lloyd's runs, means the whole
 * requested budget gets refined rather than bolted on afterwards. Farthest-point
 * seeding is the right greedy choice (it targets the least-covered colour) and
 * it is fully deterministic: ties go to the lowest cell index.
 */

/**
 * @param {Float64Array} centroidsRGB existing centroids, continuous RGB
 * @param {number} count how many of them are valid
 * @param {number} target desired count
 * @param {{coords:Float64Array,weights:Float64Array,count:number}} cloud
 * @param {import('../color/space.js').Space} space
 * @returns {{centroids:Float64Array,count:number,added:number}}
 */
export function topUpCentroids(centroidsRGB, count, target, cloud, space) {
  if (count >= target || cloud.count === 0) {
    return { centroids: centroidsRGB, count, added: 0 };
  }

  const n = cloud.count;
  // cells and current centroids in the working space
  const cells = new Float64Array(n * 3);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    space.fromRGBf(cloud.coords[o], cloud.coords[o + 1], cloud.coords[o + 2], cells, o);
  }

  const out = new Float64Array(target * 3);
  out.set(centroidsRGB.subarray(0, count * 3), 0);

  const cen = new Float64Array(3);
  // best[i] = squared distance from cell i to the nearest chosen centroid
  const best = new Float64Array(n).fill(Infinity);
  const consider = (r, g, b) => {
    space.fromRGBf(r, g, b, cen, 0);
    for (let i = 0, o = 0; i < n; i++, o += 3) {
      const d0 = cells[o] - cen[0], d1 = cells[o + 1] - cen[1], d2 = cells[o + 2] - cen[2];
      const d = d0 * d0 + d1 * d1 + d2 * d2;
      if (d < best[i]) best[i] = d;
    }
  };

  for (let i = 0; i < count; i++) {
    const o = i * 3;
    consider(out[o], out[o + 1], out[o + 2]);
  }

  let added = 0;
  while (count < target) {
    // farthest cell, weighted so a populous poorly-covered region wins over a
    // single stray pixel; ties resolve to the lowest index
    let pick = -1, pv = -1;
    for (let i = 0; i < n; i++) {
      const v = best[i] * cloud.weights[i];
      if (v > pv) { pv = v; pick = i; }
    }
    if (pick < 0 || !(pv > 0)) break; // every cell is already exactly covered

    const o = pick * 3, d = count * 3;
    out[d] = cloud.coords[o];
    out[d + 1] = cloud.coords[o + 1];
    out[d + 2] = cloud.coords[o + 2];
    consider(out[d], out[d + 1], out[d + 2]);
    count++;
    added++;
  }

  return { centroids: out.subarray(0, count * 3), count, added };
}
