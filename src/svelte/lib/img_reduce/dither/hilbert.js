/**
 * Hilbert curve traversal, generated iteratively.
 *
 * The recursive formulation is the one everyone writes first and it is fine for
 * small orders, but a 2048-wide image needs order 11 and 4.2 million points;
 * the iterative bit-twiddling version is O(1) memory per point, has no stack
 * growth at all, and streams. The path is never materialised (an Int32Array of
 * 4.2M pairs would be 33 MB for no benefit).
 */

/**
 * Hilbert d -> (x, y) for a side length that is a power of two.
 * Standard Lam/Shapiro conversion.
 * @param {number} side power-of-two side length
 * @param {number} d position along the curve, 0 .. side*side-1
 * @param {Int32Array|number[]} out receives [x, y]
 */
export function hilbertD2XY(side, d, out) {
  let t = d, x = 0, y = 0;
  for (let s = 1; s < side; s *= 2) {
    const rx = 1 & (t >>> 1);
    const ry = 1 & (t ^ rx);
    // rotate the quadrant
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const swap = x; x = y; y = swap;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  out[0] = x;
  out[1] = y;
}

/** Smallest power of two >= n. */
export function ceilPow2(n) {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/**
 * Walk an arbitrary width x height region along a Hilbert curve.
 *
 * The curve is defined on the enclosing power-of-two square and points outside
 * the image are skipped. That introduces a discontinuity wherever the curve
 * leaves and re-enters the image, which is what ImageMagick does too; the
 * locality that makes Riemersma work is preserved either side of the seam.
 *
 * Yields pixel indices (y * width + x) so callers do no arithmetic.
 * @param {number} width @param {number} height
 */
export function* hilbertWalk(width, height) {
  const side = ceilPow2(Math.max(width, height));
  const total = side * side;
  const out = new Int32Array(2);
  for (let d = 0; d < total; d++) {
    hilbertD2XY(side, d, out);
    const x = out[0], y = out[1];
    if (x < width && y < height) yield y * width + x;
  }
}
