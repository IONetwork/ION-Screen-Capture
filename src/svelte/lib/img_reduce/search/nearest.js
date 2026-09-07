/**
 * Exact nearest-palette-colour search.
 *
 * "Exact" is the whole point of this file. ImageMagick's `-remap` descends its
 * octree and then searches only the subtree rooted at the parent of wherever
 * the descent ran out, so a palette entry sitting just across a coarse octree
 * boundary is never considered. Measured, that picks a farther colour on 14.8%
 * of pixels against a 251-entry palette and 31.8% against the full RGB565 grid.
 * Every tier here is provably exact instead, and every tier is checked against
 * brute force in the test suite.
 *
 * Tiers, chosen automatically:
 *
 *   grid     palette is exactly a full product lattice and the working space is
 *            8-bit sRGB. Euclidean distance is separable over a product set, so
 *            the per-channel argmin *is* the global argmin. O(1) per channel.
 *   cell     arbitrary palette. Coarse 3D cell grid with a provable candidate
 *            set (see below). Exact, and cuts ~255 distance evaluations to a
 *            handful.
 *   brute    tiny palettes, and the fallback for queries outside the cell
 *            grid's bounding box (which dithered error can produce).
 */

import { getSpace } from '../color/space.js';
import { nearestLevelIndex } from '../color/rgb565.js';

/* ------------------------------------------------------------------ */
/* brute force — the oracle                                            */
/* ------------------------------------------------------------------ */

/**
 * Exhaustive nearest search. Ties resolve to the lowest index.
 * This is the reference every other tier is tested against.
 * @param {Float64Array} coords palette in working space, n*3
 * @param {number} n entry count
 */
export function bruteNearest(coords, n, c0, c1, c2) {
  let best = 0, bd = Infinity;
  for (let i = 0, k = 0; i < n; i++, k += 3) {
    const d0 = c0 - coords[k], d1 = c1 - coords[k + 1], d2 = c2 - coords[k + 2];
    const d = d0 * d0 + d1 * d1 + d2 * d2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* full-lattice detection                                              */
/* ------------------------------------------------------------------ */

/**
 * True when `palette` contains exactly the lattice's points, once each.
 * Lets a remap against the whole RGB565 grid take the O(1) path automatically.
 */
export function isFullLattice(lat, palette) {
  const n = palette.length / 3;
  if (n !== lat.size) return false;
  const seen = new Set();
  for (let i = 0, k = 0; i < n; i++, k += 3) {
    const r = palette[k], g = palette[k + 1], b = palette[k + 2];
    if (lat.levels[0][lat.toIndex[0][r]] !== r) return false;
    if (lat.levels[1][lat.toIndex[1][g]] !== g) return false;
    if (lat.levels[2][lat.toIndex[2][b]] !== b) return false;
    seen.add((r << 16) | (g << 8) | b);
  }
  return seen.size === lat.size;
}

/* ------------------------------------------------------------------ */
/* cell grid with a provable candidate set                             */
/* ------------------------------------------------------------------ */

/**
 * Partition the palette's bounding box into G^3 cells. For cell C let
 *
 *   R = min over entries p of dmax(C, p)        (dmax = farthest corner)
 *   cand(C) = { p : dmin(C, p) <= R }           (dmin = closest point of box)
 *
 * For any query q in C with true nearest p*:
 *   d(q,p*) <= d(q,p_b) <= dmax(C,p_b) = R
 * and any p with dmin(C,p) > R has d(q,p) >= dmin(C,p) > R >= d(q,p*),
 * so p != p*. Therefore p* is in cand(C) and scanning cand(C) is exact.
 * Ties are retained too, since dmin <= d(q,p*) <= R for a tied entry.
 */
function buildCellGrid(coords, n, G) {
  const lo = new Float64Array(3).fill(Infinity);
  const hi = new Float64Array(3).fill(-Infinity);
  for (let i = 0, k = 0; i < n; i++, k += 3) {
    for (let a = 0; a < 3; a++) {
      const v = coords[k + a];
      if (v < lo[a]) lo[a] = v;
      if (v > hi[a]) hi[a] = v;
    }
  }
  // A degenerate axis (all entries equal) would give a zero-width box.
  const step = new Float64Array(3);
  for (let a = 0; a < 3; a++) {
    if (hi[a] - lo[a] < 1e-9) { hi[a] = lo[a] + 1e-9; }
    step[a] = (hi[a] - lo[a]) / G;
  }

  const cellCount = G * G * G;
  const lists = new Array(cellCount);
  let total = 0;

  const bl = new Float64Array(3), bh = new Float64Array(3);
  for (let ci = 0; ci < G; ci++) {
    bl[0] = lo[0] + ci * step[0]; bh[0] = bl[0] + step[0];
    for (let cj = 0; cj < G; cj++) {
      bl[1] = lo[1] + cj * step[1]; bh[1] = bl[1] + step[1];
      for (let ck = 0; ck < G; ck++) {
        bl[2] = lo[2] + ck * step[2]; bh[2] = bl[2] + step[2];

        // pass 1: R = min dmax
        let R = Infinity;
        for (let i = 0, k = 0; i < n; i++, k += 3) {
          let dm = 0;
          for (let a = 0; a < 3; a++) {
            const p = coords[k + a];
            const e = Math.max(Math.abs(p - bl[a]), Math.abs(p - bh[a]));
            dm += e * e;
          }
          if (dm < R) R = dm;
        }
        // pass 2: keep entries whose dmin <= R
        const cand = [];
        for (let i = 0, k = 0; i < n; i++, k += 3) {
          let dn = 0;
          for (let a = 0; a < 3; a++) {
            const p = coords[k + a];
            const e = p < bl[a] ? bl[a] - p : (p > bh[a] ? p - bh[a] : 0);
            dn += e * e;
          }
          if (dn <= R) cand.push(i);
        }
        lists[(ci * G + cj) * G + ck] = cand;
        total += cand.length;
      }
    }
  }

  // flatten to CSR
  const offset = new Int32Array(cellCount + 1);
  const items = new Int32Array(total);
  let w = 0;
  for (let c = 0; c < cellCount; c++) {
    offset[c] = w;
    const l = lists[c];
    for (let i = 0; i < l.length; i++) items[w++] = l[i];
  }
  offset[cellCount] = w;

  return { G, lo, hi, step, offset, items, avgCandidates: total / cellCount };
}

/* ------------------------------------------------------------------ */
/* dispatcher                                                          */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} Nearest
 * @property {(r:number,g:number,b:number)=>number} findRGB8
 *   nearest index for an exact 8-bit colour
 * @property {(c0:number,c1:number,c2:number)=>number} findContinuous
 *   nearest index for a real-valued point in the working space; this is what
 *   dithering must call, because diffused error is continuous and can fall
 *   outside the 8-bit range
 * @property {(r:number,g:number,b:number,out:Float64Array,o?:number)=>void} toWorking
 * @property {string} tier
 * @property {Object} stats
 */

/**
 * @param {Uint8Array} palette n*3 8-bit RGB
 * @param {Object} [opts]
 * @param {string|Object} [opts.space='oklab']
 * @param {Object|null} [opts.lattice=null] enables the grid fast path
 * @param {number} [opts.cellGrid=0] override G (0 = auto)
 * @returns {Nearest}
 */
export function createNearest(palette, opts = {}) {
  const space = typeof opts.space === 'string' || opts.space === undefined
    ? getSpace(opts.space ?? 'oklab')
    : opts.space;
  const lattice = opts.lattice ?? null;
  const n = palette.length / 3;
  if (!Number.isInteger(n) || n < 1) throw new Error('palette must be a non-empty n*3 buffer');

  // palette in working space
  const coords = new Float64Array(n * 3);
  for (let i = 0, k = 0; i < n; i++, k += 3) {
    space.fromRGB8(palette[k], palette[k + 1], palette[k + 2], coords, k);
  }

  const toWorking = (r, g, b, out, o = 0) => space.fromRGB8(r, g, b, out, o);

  /* ---- tier: grid ---- */
  // Separability only holds for a plain per-channel metric, so this requires
  // the identity space. It is not applied silently otherwise.
  if (lattice && space.isIdentity && isFullLattice(lattice, palette)) {
    const n1 = 1 << lattice.bits[1], n2 = 1 << lattice.bits[2];
    const L = lattice.levels, T = lattice.toIndex;
    // Reverse map from lattice position to palette index. Do NOT assume the
    // palette is in latticeToPalette order — callers legitimately reorder it
    // (by lightness, for PNG compressibility), and assuming order here silently
    // returns indices for the wrong entries.
    const latToPal = new Int32Array(lattice.size).fill(-1);
    for (let i = 0, k = 0; i < n; i++, k += 3) {
      const li = (T[0][palette[k]] * n1 + T[1][palette[k + 1]]) * n2 + T[2][palette[k + 2]];
      latToPal[li] = i;
    }
    return {
      tier: 'grid',
      stats: { entries: n, note: 'full lattice, per-channel exact' },
      toWorking,
      findRGB8(r, g, b) {
        return latToPal[(T[0][r] * n1 + T[1][g]) * n2 + T[2][b]];
      },
      findContinuous(c0, c1, c2) {
        return latToPal[(nearestLevelIndex(L[0], c0) * n1 + nearestLevelIndex(L[1], c1)) * n2
                      + nearestLevelIndex(L[2], c2)];
      },
    };
  }

  /* ---- tier: brute ---- */
  if (n <= 16) {
    return {
      tier: 'brute',
      stats: { entries: n },
      toWorking,
      findRGB8(r, g, b) {
        const t = _q;
        space.fromRGB8(r, g, b, t, 0);
        return bruteNearest(coords, n, t[0], t[1], t[2]);
      },
      findContinuous(c0, c1, c2) {
        return bruteNearest(coords, n, c0, c1, c2);
      },
    };
  }

  /* ---- tier: cell ---- */
  const cell = createNearestFromCoords(coords, n, opts);
  return {
    tier: cell.tier,
    stats: cell.stats,
    toWorking,
    findRGB8(r, g, b) {
      const t = _q;
      space.fromRGB8(r, g, b, t, 0);
      return cell.findContinuous(t[0], t[1], t[2]);
    },
    findContinuous: cell.findContinuous,
  };
}

/**
 * Cell-tier search over points already in the working space.
 *
 * Lloyd's iterations need this: their centroids are real-valued working-space
 * coordinates, not 8-bit colours, and rebuilding the accelerator each iteration
 * is far cheaper than brute-forcing every histogram cell against every
 * centroid.
 *
 * @param {Float64Array} coords n*3 working-space points
 * @param {number} n
 * @param {{cellGrid?:number}} [opts]
 */
export function createNearestFromCoords(coords, n, opts = {}) {
  if (n <= 16) {
    return {
      tier: 'brute',
      stats: { entries: n },
      findContinuous: (c0, c1, c2) => bruteNearest(coords, n, c0, c1, c2),
    };
  }
  const G = opts.cellGrid > 0 ? opts.cellGrid : (n > 4096 ? 48 : (n > 512 ? 32 : 16));
  const grid = buildCellGrid(coords, n, G);
  const { lo, hi, step, offset, items } = grid;

  const findContinuous = (c0, c1, c2) => {
    // Outside the palette's bounding box the cell's exactness proof does not
    // apply (the query is not in the cell), so fall back to brute force.
    if (c0 < lo[0] || c0 > hi[0] || c1 < lo[1] || c1 > hi[1] || c2 < lo[2] || c2 > hi[2]
        || c0 !== c0 || c1 !== c1 || c2 !== c2) {
      return bruteNearest(coords, n, c0, c1, c2);
    }
    let i0 = ((c0 - lo[0]) / step[0]) | 0; if (i0 >= G) i0 = G - 1;
    let i1 = ((c1 - lo[1]) / step[1]) | 0; if (i1 >= G) i1 = G - 1;
    let i2 = ((c2 - lo[2]) / step[2]) | 0; if (i2 >= G) i2 = G - 1;
    const cell = (i0 * G + i1) * G + i2;
    const s = offset[cell], e = offset[cell + 1];
    let best = -1, bd = Infinity;
    for (let t = s; t < e; t++) {
      const idx = items[t], k = idx * 3;
      const d0 = c0 - coords[k], d1 = c1 - coords[k + 1], d2 = c2 - coords[k + 2];
      const d = d0 * d0 + d1 * d1 + d2 * d2;
      if (d < bd) { bd = d; best = idx; }
    }
    // A cell can only be empty if the palette is empty, but stay safe.
    return best < 0 ? bruteNearest(coords, n, c0, c1, c2) : best;
  };

  return {
    tier: 'cell',
    stats: { entries: n, cellGrid: G, avgCandidates: grid.avgCandidates },
    findContinuous,
  };
}

const _q = new Float64Array(3);

/** Brute-force nearest over an 8-bit palette, for tests and small one-offs. */
export function createBruteNearest(palette, opts = {}) {
  const space = typeof opts.space === 'string' || opts.space === undefined
    ? getSpace(opts.space ?? 'oklab')
    : opts.space;
  const n = palette.length / 3;
  const coords = new Float64Array(n * 3);
  for (let i = 0, k = 0; i < n; i++, k += 3) {
    space.fromRGB8(palette[k], palette[k + 1], palette[k + 2], coords, k);
  }
  const t = new Float64Array(3);
  return {
    tier: 'brute-reference',
    stats: { entries: n },
    toWorking: (r, g, b, out, o = 0) => space.fromRGB8(r, g, b, out, o),
    findRGB8(r, g, b) {
      space.fromRGB8(r, g, b, t, 0);
      return bruteNearest(coords, n, t[0], t[1], t[2]);
    },
    findContinuous(c0, c1, c2) {
      return bruteNearest(coords, n, c0, c1, c2);
    },
  };
}
