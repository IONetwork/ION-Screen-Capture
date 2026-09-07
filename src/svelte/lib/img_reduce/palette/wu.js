/**
 * Wu's variance-minimising colour quantiser.
 *
 * Xiaolin Wu, "Efficient Statistical Computations for Optimal Color
 * Quantization", Graphics Gems II, 1991.
 *
 * Chosen over median cut deliberately. Median cut splits at the population
 * median, so it hands out entries in proportion to pixel count — a 200-pixel
 * bright trace on a 2-megapixel dark background gets nothing. Wu splits to
 * minimise weighted variance, so an isolated far-off cluster scores highly
 * despite a tiny population. For instrument screenshots that difference is the
 * whole point.
 *
 * Wu alone is still not enough: measured against ImageMagick at N=64, a
 * box-splitting palette scored 27.20 dB versus IM's 27.61 dB. It is the Lloyd's
 * refinement in kmeans.js that turns that into a win (29.14 dB at 12
 * iterations). Wu's job here is to supply a good deterministic starting point,
 * which is exactly what Lloyd's needs and cannot provide for itself.
 */

const R = 0, G = 1, B = 2;

/**
 * @param {import('./histogram.js').Histogram} hist
 * @param {number} k desired box count
 * @returns {{centroids:Float64Array,weights:Float64Array,count:number,variances:Float64Array}}
 */
export function wuSplit(hist, k) {
  const { dims, wt, mr, mg, mb, m2 } = hist;
  const [d0, d1, d2] = dims;
  const s1 = d1 + 1, s2 = d2 + 1;
  const idx = (r, g, b) => (r * s1 + g) * s2 + b;

  /* -- box moment helpers (8-corner lookups on the prefix sums) -- */

  const volume = (c, m) =>
      m[idx(c[1], c[3], c[5])] - m[idx(c[1], c[3], c[4])]
    - m[idx(c[1], c[2], c[5])] + m[idx(c[1], c[2], c[4])]
    - m[idx(c[0], c[3], c[5])] + m[idx(c[0], c[3], c[4])]
    + m[idx(c[0], c[2], c[5])] - m[idx(c[0], c[2], c[4])];

  // the part of a half-box moment that does not depend on the cut position
  const bottom = (c, dir, m) => {
    switch (dir) {
      case R: return -m[idx(c[0], c[3], c[5])] + m[idx(c[0], c[3], c[4])]
                     + m[idx(c[0], c[2], c[5])] - m[idx(c[0], c[2], c[4])];
      case G: return -m[idx(c[1], c[2], c[5])] + m[idx(c[1], c[2], c[4])]
                     + m[idx(c[0], c[2], c[5])] - m[idx(c[0], c[2], c[4])];
      default: return -m[idx(c[1], c[3], c[4])] + m[idx(c[1], c[2], c[4])]
                     + m[idx(c[0], c[3], c[4])] - m[idx(c[0], c[2], c[4])];
    }
  };

  const top = (c, dir, pos, m) => {
    switch (dir) {
      case R: return m[idx(pos, c[3], c[5])] - m[idx(pos, c[3], c[4])]
                   - m[idx(pos, c[2], c[5])] + m[idx(pos, c[2], c[4])];
      case G: return m[idx(c[1], pos, c[5])] - m[idx(c[1], pos, c[4])]
                   - m[idx(c[0], pos, c[5])] + m[idx(c[0], pos, c[4])];
      default: return m[idx(c[1], c[3], pos)] - m[idx(c[1], c[2], pos)]
                   - m[idx(c[0], c[3], pos)] + m[idx(c[0], c[2], pos)];
    }
  };

  const variance = (c) => {
    const w = volume(c, wt);
    if (!(w > 0)) return 0;
    const dr = volume(c, mr), dg = volume(c, mg), db = volume(c, mb);
    const v = volume(c, m2) - (dr * dr + dg * dg + db * db) / w;
    return v > 0 ? v : 0;
  };

  /**
   * Best cut along one axis: the position maximising the sum of the two halves'
   * weighted squared means. Since the box's total m2 is fixed, that is the same
   * as minimising the halves' combined variance.
   */
  const maximize = (c, dir, wr, wg, wb, ww) => {
    const br = bottom(c, dir, mr), bg = bottom(c, dir, mg);
    const bb = bottom(c, dir, mb), bw = bottom(c, dir, wt);
    const first = c[dir * 2] + 1, last = c[dir * 2 + 1];
    let cut = -1, best = 0;
    for (let i = first; i < last; i++) {
      let hr = br + top(c, dir, i, mr);
      let hg = bg + top(c, dir, i, mg);
      let hb = bb + top(c, dir, i, mb);
      let hw = bw + top(c, dir, i, wt);
      if (hw === 0) continue; // nothing below the cut yet
      let t = (hr * hr + hg * hg + hb * hb) / hw;

      const or = wr - hr, og = wg - hg, ob = wb - hb, ow = ww - hw;
      if (ow === 0) break; // nothing above the cut; further cuts are worse
      t += (or * or + og * og + ob * ob) / ow;

      if (t > best) { best = t; cut = i; }
    }
    return { cut, best };
  };

  /* -- split loop -- */

  // a cube is [r0,r1,g0,g1,b0,b1]
  const cubes = [Int32Array.from([0, d0, 0, d1, 0, d2])];
  const vars = [0];
  vars[0] = variance(cubes[0]);

  while (cubes.length < k) {
    // pick the highest-variance box; ties go to the lowest index for determinism
    let pick = -1, pv = 0;
    for (let i = 0; i < cubes.length; i++) {
      if (vars[i] > pv) { pv = vars[i]; pick = i; }
    }
    if (pick < 0) break; // every box is a single colour; cannot improve

    const c = cubes[pick];
    const ww = volume(c, wt);
    const wr = volume(c, mr), wg = volume(c, mg), wb = volume(c, mb);

    const m = [maximize(c, R, wr, wg, wb, ww),
               maximize(c, G, wr, wg, wb, ww),
               maximize(c, B, wr, wg, wb, ww)];
    // strict > keeps the earliest axis on a tie, so the choice is deterministic
    let dir = -1, bestVal = -1;
    for (let d = 0; d < 3; d++) {
      if (m[d].cut >= 0 && m[d].best > bestVal) { bestVal = m[d].best; dir = d; }
    }
    if (dir < 0) { vars[pick] = 0; continue; } // unsplittable, retire it

    const cut = m[dir].cut;
    const c2 = Int32Array.from(c);
    c2[dir * 2] = cut;      // upper half starts at the cut
    c[dir * 2 + 1] = cut;   // lower half ends at the cut
    cubes.push(c2);
    vars[pick] = variance(c);
    vars[cubes.length - 1] = variance(c2);
  }

  /* -- centroids -- */

  const count = cubes.length;
  const centroids = new Float64Array(count * 3);
  const weights = new Float64Array(count);
  const variances = new Float64Array(count);
  let out = 0;
  for (let i = 0; i < count; i++) {
    const c = cubes[i];
    const w = volume(c, wt);
    if (!(w > 0)) continue; // empty box contributes no entry
    centroids[out * 3] = volume(c, mr) / w;
    centroids[out * 3 + 1] = volume(c, mg) / w;
    centroids[out * 3 + 2] = volume(c, mb) / w;
    weights[out] = w;
    variances[out] = vars[i];
    out++;
  }

  return {
    centroids: centroids.subarray(0, out * 3),
    weights: weights.subarray(0, out),
    variances: variances.subarray(0, out),
    count: out,
  };
}
