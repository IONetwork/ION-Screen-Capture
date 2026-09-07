/**
 * Reduced-bit-depth colour lattices (RGB565, RGB888, and anything else) plus
 * exact nearest-level lookup.
 *
 * Why there is a lookup table here and not a formula:
 *
 * A lattice's representable 8-bit values depend on how the n-bit index is
 * expanded back to 8 bits, and the expansions are NOT uniformly spaced.
 * `replicate` puts the 5-bit levels at 0,8,16,24,33,41,... (gaps of 8,8,8,9).
 * Measured against every one of the 256 possible inputs, each plausible closed
 * form is exactly right for one expansion and badly wrong for the others:
 *
 *   expansion     round(v*L/255)   (v+4)>>3   v>>3    brute-forced LUT
 *   truncate       93/256 (+8)        0        93           0
 *   centered       39/256 (+6)       93         0           0
 *   high           93/256 (+8)      217        93           0
 *   replicate            0          112 (+9)   48           0
 *
 * ("+n" is the worst excess error in 8-bit counts.) So there is no formula that
 * works across expansions, and picking the wrong one costs up to 8 counts of
 * avoidable error on every affected pixel. A 256-entry table per channel is
 * exact for all of them, costs microseconds to build, and makes the tie-break
 * explicit. Do not "optimise" this back into arithmetic.
 */

/**
 * Low-bit fill patterns for the `centered` expansion, keyed by how many low
 * bits need filling. These match the literal bit strings in the project's
 * existing palette files (rgb565_palette_011_10_011.png): 011 for a 5-bit
 * channel, 10 for a 6-bit channel.
 */
const CENTER_FILL = { 0: 0, 1: 0b1, 2: 0b10, 3: 0b011, 4: 0b0111 };

/**
 * Index -> 8-bit value, for each supported expansion.
 * Named for what they do; the project's PNG filenames map as noted.
 */
export const EXPANSIONS = {
  /** Pad low bits with zeros. Black exact, white unreachable (248,252,248). `000_00_000`. */
  truncate(i, bits) {
    return (i << (8 - bits)) & 255;
  },
  /** Pad low bits with a mid pattern. Neither endpoint exact. `011_10_011`. */
  centered(i, bits) {
    const k = 8 - bits;
    const fill = k in CENTER_FILL ? CENTER_FILL[k] : (1 << (k - 1));
    return ((i << k) | fill) & 255;
  },
  /** Pad low bits with ones. White exact, black unreachable (7,3,7). `111_11_111`. */
  high(i, bits) {
    const k = 8 - bits;
    return ((i << k) | ((1 << k) - 1)) & 255;
  },
  /**
   * Replicate the high bits down into the low bits. Maps 0->0 and max->255
   * exactly, so both endpoints are reachable. This is what real 16-bit display
   * hardware does, making it the right choice when the bytes drive a panel.
   * `rgb565_palette_replicated.png`.
   */
  replicate(i, bits) {
    let v = 0, filled = 0;
    while (filled < 8) {
      const shift = 8 - filled - bits;
      v |= shift >= 0 ? (i << shift) : (i >>> -shift);
      filled += bits;
    }
    return v & 255;
  },
};

/**
 * Exact nearest level for a real-valued (possibly out-of-range) input.
 *
 * This is the path dithering must use: once error is diffused, the query is
 * `pixel + accumulated error`, which is continuous and can fall outside
 * [0,255]. Snapping that to a byte and using the byte table is NOT exact.
 *
 * Ties resolve to the lower index. The byte table below is built by calling
 * this, so the two can never disagree.
 *
 * @param {Uint8Array} levels ascending representable values
 * @param {number} x
 * @returns {number} index into levels
 */
export function nearestLevelIndex(levels, x) {
  const n = levels.length;
  if (!(x > levels[0])) return 0; // also catches NaN
  if (x >= levels[n - 1]) return n - 1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (levels[mid] <= x) lo = mid; else hi = mid;
  }
  return (x - levels[lo]) <= (levels[hi] - x) ? lo : hi;
}

/**
 * @typedef {Object} Lattice
 * @property {string} name
 * @property {number[]} bits            bits per channel, e.g. [5,6,5]
 * @property {string} expansion
 * @property {Uint8Array[]} levels      per channel: index -> 8-bit value
 * @property {Uint8Array[]} toIndex     per channel: 8-bit value -> nearest index
 * @property {number} size              total lattice points
 * @property {boolean} isFullByte       true when every channel is 8 bits (no reduction)
 */

const _cache = new Map();

/**
 * Build (and memoise) a lattice descriptor.
 * @param {number[]} bits bits per channel
 * @param {keyof typeof EXPANSIONS} [expansion]
 * @returns {Lattice}
 */
export function createLattice(bits, expansion = 'replicate') {
  const key = `${bits.join(',')}|${expansion}`;
  const hit = _cache.get(key);
  if (hit) return hit;

  const expand = EXPANSIONS[expansion];
  if (!expand) throw new Error(`unknown expansion "${expansion}"`);
  if (bits.length !== 3) throw new Error('bits must have 3 entries');

  const levels = [], toIndex = [];
  for (let c = 0; c < 3; c++) {
    const b = bits[c];
    if (!Number.isInteger(b) || b < 1 || b > 8) throw new Error(`bits[${c}] must be 1..8`);
    const n = 1 << b;
    const lv = new Uint8Array(n);
    for (let i = 0; i < n; i++) lv[i] = expand(i, b);
    for (let i = 1; i < n; i++) {
      if (lv[i] <= lv[i - 1]) throw new Error(`expansion "${expansion}" is not monotonic at ${b} bits`);
    }
    const ti = new Uint8Array(256);
    for (let v = 0; v < 256; v++) ti[v] = nearestLevelIndex(lv, v);
    levels.push(lv);
    toIndex.push(ti);
  }

  const lat = {
    name: `rgb${bits.join('')}`,
    bits: bits.slice(),
    expansion,
    levels,
    toIndex,
    size: (1 << bits[0]) * (1 << bits[1]) * (1 << bits[2]),
    isFullByte: bits[0] === 8 && bits[1] === 8 && bits[2] === 8,
  };
  _cache.set(key, lat);
  return lat;
}

/** RGB565 with the hardware-correct expansion. */
export const LATTICE_565 = createLattice([5, 6, 5], 'replicate');
/** Full 8-bit-per-channel space: no reduction, every colour representable. */
export const LATTICE_888 = createLattice([8, 8, 8], 'replicate');

/** Snap an 8-bit colour to its nearest lattice point, in place-ish. */
export function snapToLattice(lat, r, g, b, out, o = 0) {
  out[o]     = lat.levels[0][lat.toIndex[0][r]];
  out[o + 1] = lat.levels[1][lat.toIndex[1][g]];
  out[o + 2] = lat.levels[2][lat.toIndex[2][b]];
}

/** True when a colour is exactly representable on the lattice. */
export function isOnLattice(lat, r, g, b) {
  return lat.levels[0][lat.toIndex[0][r]] === r
      && lat.levels[1][lat.toIndex[1][g]] === g
      && lat.levels[2][lat.toIndex[2][b]] === b;
}

/**
 * Theoretical worst-case per-channel error for correct nearest assignment,
 * derived from the level table rather than assumed. `replicate` has gaps of
 * 8,8,8,9 so the bound is 4 for the 8-gaps and 4 for the 9-gap (floor(9/2)).
 * @returns {number[]} per-channel bound in 8-bit counts
 */
export function maxLatticeError(lat) {
  return lat.levels.map((lv) => {
    let worst = 0;
    for (let v = 0; v < 256; v++) worst = Math.max(worst, Math.abs(v - lv[nearestLevelIndex(lv, v)]));
    return worst;
  });
}

/* ------------------------------------------------------------------ */
/* RGB565 bit packing                                                  */
/* ------------------------------------------------------------------ */

/** Pack 5/6/5 channel indices into a uint16. */
export function packIndices565(r5, g6, b5) {
  return ((r5 & 0x1f) << 11) | ((g6 & 0x3f) << 5) | (b5 & 0x1f);
}

/** Pack an 8-bit colour to uint16 RGB565 (snapping via the exact tables). */
export function packRGB565(r, g, b, lat = LATTICE_565) {
  return packIndices565(lat.toIndex[0][r], lat.toIndex[1][g], lat.toIndex[2][b]);
}

/** Unpack a uint16 RGB565 to 8-bit RGB using the lattice's expansion. */
export function unpackRGB565(v, out, o = 0, lat = LATTICE_565) {
  out[o]     = lat.levels[0][(v >>> 11) & 0x1f];
  out[o + 1] = lat.levels[1][(v >>> 5) & 0x3f];
  out[o + 2] = lat.levels[2][v & 0x1f];
}

/**
 * Byte-swap a uint16 buffer in place. Panels driven over SPI (ST7789 and
 * friends) usually want big-endian; this is the swap everyone forgets.
 */
export function byteSwap565(u16) {
  for (let i = 0; i < u16.length; i++) {
    const v = u16[i];
    u16[i] = ((v & 0xff) << 8) | (v >>> 8);
  }
  return u16;
}

/** Materialise every lattice point as a packed RGB palette. */
export function latticeToPalette(lat) {
  const n0 = 1 << lat.bits[0], n1 = 1 << lat.bits[1], n2 = 1 << lat.bits[2];
  const pal = new Uint8Array(n0 * n1 * n2 * 3);
  let k = 0;
  for (let i = 0; i < n0; i++) {
    const r = lat.levels[0][i];
    for (let j = 0; j < n1; j++) {
      const g = lat.levels[1][j];
      for (let m = 0; m < n2; m++) {
        pal[k++] = r; pal[k++] = g; pal[k++] = lat.levels[2][m];
      }
    }
  }
  return pal;
}
