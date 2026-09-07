/**
 * 3D colour histogram with the statistical moments Wu's algorithm needs.
 *
 * Two things worth knowing about the binning:
 *
 * 1. In a reduced-lattice mode the lattice *is* the natural bin grid. RGB565
 *    has exactly 32x64x32 = 65536 cells, so binning by the lattice index means
 *    a box's centroid can be snapped to a lattice point that actually lies in
 *    that box. Binning coarsely and snapping afterwards is what produced the
 *    "asked for 255, got 251" collision in the original ImageMagick pipeline.
 *
 * 2. The moments accumulate *full 8-bit* channel values, not bin indices. The
 *    bins decide which pixels group together; the moments decide where the
 *    palette entry goes. Keeping the moments at full precision means coarse
 *    bins cost grouping accuracy but never centroid accuracy.
 */

/**
 * @typedef {Object} Histogram
 * @property {number[]} dims                bins per channel
 * @property {Float64Array} wt              cumulative weight
 * @property {Float64Array} mr
 * @property {Float64Array} mg
 * @property {Float64Array} mb              cumulative channel sums
 * @property {Float64Array} m2              cumulative sum of r^2+g^2+b^2
 * @property {number} total                 pixels counted
 * @property {number} nonEmptyCells
 */

/** Choose a binning strategy: lattice-aligned when reduced, 5-bit otherwise. */
function binnerFor(lattice) {
  if (lattice && !lattice.isFullByte) {
    return {
      dims: [1 << lattice.bits[0], 1 << lattice.bits[1], 1 << lattice.bits[2]],
      map: [lattice.toIndex[0], lattice.toIndex[1], lattice.toIndex[2]],
    };
  }
  const t = new Uint8Array(256);
  for (let v = 0; v < 256; v++) t[v] = v >> 3;
  return { dims: [32, 32, 32], map: [t, t, t] };
}

/**
 * @param {{data:Uint8Array|Uint8ClampedArray,width:number,height:number,channels?:number}} image
 * @param {Object} [opts]
 * @param {Object|null} [opts.lattice]
 * @param {number} [opts.alphaThreshold] pixels with alpha below this are excluded
 * @param {Float32Array|null} [opts.weights] per-pixel importance, length w*h
 * @returns {Histogram}
 */
export function buildHistogram(image, opts = {}) {
  const { data, width, height } = image;
  const channels = image.channels ?? (data.length / (width * height));
  const { dims, map } = binnerFor(opts.lattice ?? null);
  const [d0, d1, d2] = dims;

  const s1 = d1 + 1, s2 = d2 + 1;
  const size = (d0 + 1) * s1 * s2;
  const wt = new Float64Array(size);
  const mr = new Float64Array(size);
  const mg = new Float64Array(size);
  const mb = new Float64Array(size);
  const m2 = new Float64Array(size);

  const alphaThreshold = opts.alphaThreshold ?? 0;
  const weights = opts.weights ?? null;
  const px = width * height;
  let total = 0;

  for (let p = 0; p < px; p++) {
    const k = p * channels;
    if (channels === 4 && alphaThreshold > 0 && data[k + 3] < alphaThreshold) continue;
    const r = data[k], g = data[k + 1], b = data[k + 2];
    const w = weights ? weights[p] : 1;
    if (!(w > 0)) continue;

    // +1 because index 0 on each axis is the zero plane for the prefix sums
    const i = ((map[0][r] + 1) * s1 + (map[1][g] + 1)) * s2 + (map[2][b] + 1);
    wt[i] += w;
    mr[i] += w * r;
    mg[i] += w * g;
    mb[i] += w * b;
    m2[i] += w * (r * r + g * g + b * b);
    total += w;
  }

  let nonEmptyCells = 0;
  for (let i = 0; i < size; i++) if (wt[i] > 0) nonEmptyCells++;

  // 3D prefix sums, so any box's moments come from 8 corner lookups
  const area = new Float64Array(5 * s2);
  for (let r = 1; r <= d0; r++) {
    area.fill(0);
    for (let g = 1; g <= d1; g++) {
      let lw = 0, lr = 0, lg = 0, lb = 0, l2 = 0;
      for (let b = 1; b <= d2; b++) {
        const i = (r * s1 + g) * s2 + b;
        lw += wt[i]; lr += mr[i]; lg += mg[i]; lb += mb[i]; l2 += m2[i];
        area[b] += lw;
        area[s2 + b] += lr;
        area[2 * s2 + b] += lg;
        area[3 * s2 + b] += lb;
        area[4 * s2 + b] += l2;
        const j = ((r - 1) * s1 + g) * s2 + b;
        wt[i] = wt[j] + area[b];
        mr[i] = mr[j] + area[s2 + b];
        mg[i] = mg[j] + area[2 * s2 + b];
        mb[i] = mb[j] + area[3 * s2 + b];
        m2[i] = m2[j] + area[4 * s2 + b];
      }
    }
  }

  return { dims, wt, mr, mg, mb, m2, total, nonEmptyCells, stride: [s1, s2] };
}

/**
 * Extract the non-empty cells as a weighted point cloud, for Lloyd's.
 * Each cell contributes its own mean colour, which keeps refinement cheap:
 * cells, not pixels, are what get reassigned.
 *
 * Must be called on a histogram *before* the prefix-sum pass, so this rebuilds
 * the raw counts from a second light pass over the image instead.
 *
 * @returns {{coords:Float64Array,weights:Float64Array,count:number}}
 */
export function buildCellCloud(image, opts = {}) {
  const { data, width, height } = image;
  const channels = image.channels ?? (data.length / (width * height));
  const alphaThreshold = opts.alphaThreshold ?? 0;
  const weights = opts.weights ?? null;
  const px = width * height;
  const cap = opts.maxCells ?? 65536;
  const lattice = opts.lattice ?? null;

  /*
   * The cloud is a sparse Map, so its cost tracks the number of *occupied*
   * cells rather than the grid size. That means it can afford far finer
   * resolution than the Wu histogram, and it needs to: with 5-bit binning a
   * grayscale ramp collapses onto ~32 diagonal cells, which caps how many
   * distinct entries top-up and refill can ever propose. Measured, that cost
   * about 1.1 dB on grayscale and line-art at N=64.
   *
   * On a reduced lattice the lattice index is already the right resolution.
   * On the full 8-bit space, try exact colours first and fall back to
   * progressively coarser binning only if the image is too varied.
   */
  const attempts = [];
  if (lattice && !lattice.isFullByte) {
    const [d1, d2] = [1 << lattice.bits[1], 1 << lattice.bits[2]];
    attempts.push({ map: lattice.toIndex, d1, d2 });
  } else {
    const ident = new Uint8Array(256); for (let v = 0; v < 256; v++) ident[v] = v;
    const six = new Uint8Array(256); for (let v = 0; v < 256; v++) six[v] = v >> 2;
    const five = new Uint8Array(256); for (let v = 0; v < 256; v++) five[v] = v >> 3;
    attempts.push({ map: [ident, ident, ident], d1: 256, d2: 256 });
    attempts.push({ map: [six, six, six], d1: 64, d2: 64 });
    attempts.push({ map: [five, five, five], d1: 32, d2: 32 });
  }

  let acc = null;
  for (let a = 0; a < attempts.length; a++) {
    const { map, d1, d2 } = attempts[a];
    const last = a === attempts.length - 1;
    const m = new Map(); // cell key -> [w, sr, sg, sb]
    let overflow = false;
    for (let p = 0; p < px; p++) {
      const k = p * channels;
      if (channels === 4 && alphaThreshold > 0 && data[k + 3] < alphaThreshold) continue;
      const r = data[k], g = data[k + 1], b = data[k + 2];
      const w = weights ? weights[p] : 1;
      if (!(w > 0)) continue;
      const key = (map[0][r] * d1 + map[1][g]) * d2 + map[2][b];
      let e = m.get(key);
      if (e === undefined) {
        if (!last && m.size >= cap) { overflow = true; break; }
        e = [0, 0, 0, 0];
        m.set(key, e);
      }
      e[0] += w; e[1] += w * r; e[2] += w * g; e[3] += w * b;
    }
    if (!overflow) { acc = m; break; }
  }

  const count = acc.size;
  const coords = new Float64Array(count * 3);
  const wOut = new Float64Array(count);
  // Sorted by cell key so the cloud order is deterministic regardless of
  // Map insertion order (which depends on pixel scan order).
  const keys = [...acc.keys()].sort((a, b) => a - b);
  for (let i = 0; i < count; i++) {
    const e = acc.get(keys[i]);
    coords[i * 3] = e[1] / e[0];
    coords[i * 3 + 1] = e[2] / e[0];
    coords[i * 3 + 2] = e[3] / e[0];
    wOut[i] = e[0];
  }
  return { coords, weights: wOut, count };
}

/**
 * Distinct colour census with an early exit.
 * Used for the lossless-passthrough gate, where we only care whether the
 * count is at or below the budget.
 * @returns {{count:number,exceeded:boolean,colors:number[]}}
 */
export function censusDistinct(image, limit, opts = {}) {
  const { data, width, height } = image;
  const channels = image.channels ?? (data.length / (width * height));
  const alphaThreshold = opts.alphaThreshold ?? 0;
  const seen = new Set();
  const px = width * height;
  for (let p = 0; p < px; p++) {
    const k = p * channels;
    if (channels === 4 && alphaThreshold > 0 && data[k + 3] < alphaThreshold) continue;
    seen.add((data[k] << 16) | (data[k + 1] << 8) | data[k + 2]);
    if (seen.size > limit) return { count: seen.size, exceeded: true, colors: [] };
  }
  return { count: seen.size, exceeded: false, colors: [...seen].sort((a, b) => a - b) };
}
