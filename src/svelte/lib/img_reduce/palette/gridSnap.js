/**
 * Constrain a continuous palette to a colour lattice, then refill to the
 * requested entry count.
 *
 * THIS IS THE RISKIEST MODULE IN THE LIBRARY. Read before editing.
 *
 * Every other hard part has an oracle: the search tiers are checked against
 * brute force, the colour conversions against round-trip identities, the
 * metrics against `magick compare`, Wu against monotone SSE. Refill has nothing
 * to compare against, so its correctness has to be *asserted* rather than
 * diffed. It is also where the one bug we actually measured in the original
 * ImageMagick pipeline lived: asking for 255 colours and silently getting 251,
 * because four free-space centroids collapsed onto the same RGB565 point.
 *
 * Three rules keep it safe:
 *
 *  1. Snap ONCE, at the end of refinement, never inside the Lloyd's loop.
 *     Snapping is not SSE-monotone, so interleaving the two makes SSE oscillate
 *     and the result depends on whatever iteration count you happened to test.
 *  2. Refill only ever ADDS entries. Adding a palette entry can never increase
 *     nearest-neighbour SSE, which gives us a real post-condition to assert.
 *  3. Candidates come only from lattice points that some actual image cell
 *     snaps to. Inventing unused lattice points would pad the count with
 *     entries no pixel ever selects, turning a real shortfall into a fake
 *     success.
 */

import { createNearestFromCoords } from '../search/nearest.js';

const pack = (r, g, b) => (r << 16) | (g << 8) | b;

/**
 * @param {Float64Array} centroidsRGB n*3 continuous RGB centroids
 * @param {number} k
 * @param {import('./histogram.js').Histogram} _unusedHist
 * @param {Object} opts
 * @param {Object} opts.lattice
 * @param {{coords:Float64Array,weights:Float64Array,count:number}} opts.cloud
 * @param {import('../color/space.js').Space} opts.space
 * @param {number} opts.target requested entry count
 * @returns {{palette:Uint8Array,count:number,collisions:number,refilled:number,
 *            sseAfterSnap:number,sseAfterRefill:number,headroom:boolean}}
 */
export function snapAndRefill(centroidsRGB, k, opts) {
  const { lattice: lat, cloud, space, target } = opts;
  const L = lat.levels, T = lat.toIndex;

  /** snap a continuous RGB triple to its nearest lattice point */
  const snap = (r, g, b) => {
    const ri = Math.max(0, Math.min(255, Math.round(r)));
    const gi = Math.max(0, Math.min(255, Math.round(g)));
    const bi = Math.max(0, Math.min(255, Math.round(b)));
    return [L[0][T[0][ri]], L[1][T[1][gi]], L[2][T[2][bi]]];
  };

  /* -- 1. snap and dedupe -- */
  const seen = new Set();
  const entries = [];
  for (let i = 0, o = 0; i < k; i++, o += 3) {
    const c = snap(centroidsRGB[o], centroidsRGB[o + 1], centroidsRGB[o + 2]);
    const key = pack(c[0], c[1], c[2]);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(c);
  }
  const collisions = k - entries.length;

  const sseOf = (list) => {
    if (list.length === 0) return Infinity;
    const cen = new Float64Array(list.length * 3);
    for (let i = 0; i < list.length; i++) {
      space.fromRGB8(list[i][0], list[i][1], list[i][2], cen, i * 3);
    }
    const nrst = createNearestFromCoords(cen, list.length);
    const t = new Float64Array(3);
    let total = 0;
    for (let i = 0, o = 0; i < cloud.count; i++, o += 3) {
      space.fromRGBf(cloud.coords[o], cloud.coords[o + 1], cloud.coords[o + 2], t, 0);
      const a = nrst.findContinuous(t[0], t[1], t[2]) * 3;
      const d0 = t[0] - cen[a], d1 = t[1] - cen[a + 1], d2 = t[2] - cen[a + 2];
      total += (d0 * d0 + d1 * d1 + d2 * d2) * cloud.weights[i];
    }
    return total;
  };

  const sseAfterSnap = sseOf(entries);

  /* -- 2. refill -- */
  // Snapshot the assignment once. Recomputing it per added entry would be
  // O(cells x palette) per step, and collisions are rare enough (4 of 255 on
  // the measured photo) that a snapshot is both sufficient and far cheaper.
  let refilled = 0;
  let headroom = true;

  if (entries.length < target && cloud.count > 0) {
    const m = entries.length;
    const cen = new Float64Array(m * 3);
    for (let i = 0; i < m; i++) {
      space.fromRGB8(entries[i][0], entries[i][1], entries[i][2], cen, i * 3);
    }
    const nrst = createNearestFromCoords(cen, m);
    const t = new Float64Array(3);

    // per-cell: owning entry and squared distance to it
    const owner = new Int32Array(cloud.count);
    const dist = new Float64Array(cloud.count);
    const clusterSse = new Float64Array(m);
    for (let i = 0, o = 0; i < cloud.count; i++, o += 3) {
      space.fromRGBf(cloud.coords[o], cloud.coords[o + 1], cloud.coords[o + 2], t, 0);
      const a = nrst.findContinuous(t[0], t[1], t[2]);
      const p = a * 3;
      const d0 = t[0] - cen[p], d1 = t[1] - cen[p + 1], d2 = t[2] - cen[p + 2];
      const d = d0 * d0 + d1 * d1 + d2 * d2;
      owner[i] = a;
      dist[i] = d;
      clusterSse[a] += d * cloud.weights[i];
    }

    // Candidate lattice points per cluster, worst-fitting first. Only points
    // that a real cell snaps to, and only ones not already in the palette.
    const buckets = new Array(m);
    for (let a = 0; a < m; a++) buckets[a] = [];
    for (let i = 0, o = 0; i < cloud.count; i++, o += 3) {
      const c = snap(cloud.coords[o], cloud.coords[o + 1], cloud.coords[o + 2]);
      const key = pack(c[0], c[1], c[2]);
      if (seen.has(key)) continue;
      buckets[owner[i]].push({ key, c, d: dist[i] });
    }
    for (let a = 0; a < m; a++) {
      // descending distance; key ascending as the deterministic tie-break
      buckets[a].sort((x, y) => (y.d - x.d) || (x.key - y.key));
    }

    // Walk clusters worst-SSE first, taking one candidate each, round-robin.
    // Hard cap: target iterations, so this cannot spin.
    const order = Array.from({ length: m }, (_, a) => a)
      .sort((a, b) => (clusterSse[b] - clusterSse[a]) || (a - b));
    const cursor = new Int32Array(m);
    let guard = 0;
    const guardLimit = target * (m + 1) + m + 1;

    while (entries.length < target) {
      if (guard++ > guardLimit) break; // belt and braces; should be unreachable
      let added = false;
      for (const a of order) {
        if (entries.length >= target) break;
        const bucket = buckets[a];
        while (cursor[a] < bucket.length && seen.has(bucket[cursor[a]].key)) cursor[a]++;
        if (cursor[a] >= bucket.length) continue;
        const cand = bucket[cursor[a]++];
        seen.add(cand.key);
        entries.push(cand.c);
        refilled++;
        added = true;
      }
      if (!added) { headroom = false; break; } // no distinct lattice point left
    }
  }

  const palette = new Uint8Array(entries.length * 3);
  for (let i = 0; i < entries.length; i++) {
    palette[i * 3] = entries[i][0];
    palette[i * 3 + 1] = entries[i][1];
    palette[i * 3 + 2] = entries[i][2];
  }
  const sseAfterRefill = refilled > 0 ? sseOf(entries) : sseAfterSnap;

  /* -- 3. post-conditions -- */
  // These are assertions, not tests: this module has no oracle, so the
  // invariants have to be checked at runtime.
  if (entries.length > target) {
    throw new Error(`gridSnap produced ${entries.length} entries, over the target of ${target}`);
  }
  if (seen.size !== entries.length) {
    throw new Error('gridSnap produced duplicate palette entries');
  }
  for (let i = 0; i < entries.length; i++) {
    const [r, g, b] = entries[i];
    if (L[0][T[0][r]] !== r || L[1][T[1][g]] !== g || L[2][T[2][b]] !== b) {
      throw new Error(`gridSnap entry ${i} (${r},${g},${b}) is not on the lattice`);
    }
  }
  if (refilled > 0 && sseAfterRefill > sseAfterSnap * (1 + 1e-9)) {
    throw new Error(`gridSnap refill increased SSE (${sseAfterSnap} -> ${sseAfterRefill})`);
  }
  if (entries.length < target && headroom && refilled === 0 && collisions === 0) {
    // Legitimate: the image simply does not contain `target` distinct lattice
    // colours. Recorded in stats rather than thrown.
    headroom = false;
  }

  return {
    palette,
    count: entries.length,
    collisions,
    refilled,
    sseAfterSnap,
    sseAfterRefill,
    headroom,
  };
}
