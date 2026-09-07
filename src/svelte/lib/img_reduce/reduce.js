/**
 * Orchestration: choose a palette, then assign every pixel to it.
 *
 * The pipeline, and why it is in this order:
 *
 *   census        -> if the image already fits the budget, pass it through
 *                    untouched. Instrument screenshots are often already
 *                    low-colour, and a lossless path is both faster and exactly
 *                    right.
 *   histogram     -> binned on the lattice when one is in play, so a box's
 *                    centroid can be snapped to a lattice point inside it
 *   Wu            -> deterministic variance-minimising split for the initial
 *                    palette
 *   Lloyd's       -> the step that actually beats ImageMagick (see kmeans.js)
 *   snap + refill -> lattice constraint applied once, at the end
 *   assign        -> exact nearest, dithered or not
 */

import { getSpace } from './color/space.js';
import { createLattice, LATTICE_565, LATTICE_888, isOnLattice } from './color/rgb565.js';
import { buildHistogram, buildCellCloud, censusDistinct } from './palette/histogram.js';
import { wuSplit } from './palette/wu.js';
import { refine } from './palette/kmeans.js';
import { topUpCentroids } from './palette/topup.js';
import { snapAndRefill } from './palette/gridSnap.js';
import { createNearest } from './search/nearest.js';
import { paletteToWorking, meanPaletteSpacing, edgeMap } from './dither/common.js';
import { ditherFloydSteinberg } from './dither/floydSteinberg.js';
import { ditherRiemersma } from './dither/riemersma.js';
import { ditherOrdered } from './dither/ordered.js';
import { srgb8ToOklab } from './color/oklab.js';

const DITHERS = ['none', 'floyd-steinberg', 'riemersma', 'ordered'];

function normaliseImage(image) {
  if (!image || !image.data) throw new Error('image.data is required');
  const { data, width, height } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('image.width and image.height must be positive integers');
  }
  const channels = image.channels ?? (data.length / (width * height));
  if (channels !== 3 && channels !== 4) {
    throw new Error(`image must be RGB or RGBA (got ${channels} channels)`);
  }
  if (data.length < width * height * channels) {
    throw new Error(`image.data is too short for ${width}x${height}x${channels}`);
  }
  return { data, width, height, channels };
}

function resolveLattice(opts) {
  const l = opts.lattice ?? 'rgb888';
  if (l === null || l === 'none' || l === 'rgb888') {
    return opts.expand565 ? createLattice([8, 8, 8], opts.expand565) : LATTICE_888;
  }
  if (l === 'rgb565') {
    return opts.expand565 ? createLattice([5, 6, 5], opts.expand565) : LATTICE_565;
  }
  if (typeof l === 'object' && l.levels) return l;
  throw new Error(`unknown lattice "${l}"`);
}

/** Sort a palette deterministically. Keeps a reserved tail entry in place. */
function orderPalette(palette, order, reservedTail) {
  const n = palette.length / 3 - (reservedTail ? 1 : 0);
  if (order === 'none' || n < 2) return { palette, map: null };
  const keys = new Float64Array(n);
  const tmp = new Float64Array(3);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (order === 'lightness') {
      srgb8ToOklab(palette[o], palette[o + 1], palette[o + 2], tmp, 0);
      keys[i] = tmp[0];
    } else {
      keys[i] = (palette[o] << 16) | (palette[o + 1] << 8) | palette[o + 2];
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => (keys[a] - keys[b])
      || ((palette[a * 3] << 16 | palette[a * 3 + 1] << 8 | palette[a * 3 + 2])
        - (palette[b * 3] << 16 | palette[b * 3 + 1] << 8 | palette[b * 3 + 2])));
  const out = new Uint8Array(palette.length);
  for (let i = 0; i < n; i++) {
    const s = idx[i] * 3, d = i * 3;
    out[d] = palette[s]; out[d + 1] = palette[s + 1]; out[d + 2] = palette[s + 2];
  }
  if (reservedTail) {
    const s = n * 3;
    out[s] = palette[s]; out[s + 1] = palette[s + 1]; out[s + 2] = palette[s + 2];
  }
  return { palette: out, map: idx };
}

/**
 * Build a palette for an image without assigning pixels.
 * Separated out so a capture series can share one palette and stay temporally
 * consistent instead of re-quantising every frame to a slightly different set.
 */
export function buildPalette(image, options = {}) {
  const img = normaliseImage(image);
  const opts = options;
  const colors = opts.colors ?? 256;
  if (!Number.isInteger(colors) || colors < 1 || colors > 256) {
    throw new Error('colors must be an integer 1..256');
  }
  const space = getSpace(opts.space ?? 'oklab');
  const lat = resolveLattice(opts);
  const alphaMode = opts.alpha ?? 'ignore';
  const alphaThreshold = alphaMode === 'threshold' ? (opts.alphaThreshold ?? 128) : 0;

  const stats = {
    lattice: lat.name, expansion: lat.expansion, space: space.name,
    uniqueInput: 0, lossless: false, collisions: 0, refilled: 0,
    kmeansIterations: 0, headroom: true,
  };

  const pin = opts.pin ?? null;
  const pinCount = pin ? pin.length : 0;
  const budget = Math.max(1, colors - pinCount);

  /* -- lossless passthrough -- */
  const census = censusDistinct(img, colors, { alphaThreshold });
  stats.uniqueInput = census.count;
  if (!census.exceeded) {
    // Only lossless if every colour is representable on the lattice.
    let allLegal = true;
    for (const v of census.colors) {
      if (!isOnLattice(lat, (v >> 16) & 255, (v >> 8) & 255, v & 255)) { allLegal = false; break; }
    }
    if (allLegal) {
      const pal = new Uint8Array(census.colors.length * 3);
      census.colors.forEach((v, i) => {
        pal[i * 3] = (v >> 16) & 255; pal[i * 3 + 1] = (v >> 8) & 255; pal[i * 3 + 2] = v & 255;
      });
      stats.lossless = true;
      return { palette: pal, count: census.colors.length, stats };
    }
  }

  /* -- adaptive palette -- */
  const cloud = buildCellCloud(img, { lattice: lat, alphaThreshold });
  stats.cells = cloud.count;

  const hist = buildHistogram(img, { lattice: lat, alphaThreshold });
  const wu = wuSplit(hist, budget);

  let centroids = wu.centroids;
  let count = wu.count;

  // Wu cannot return more boxes than there are non-empty histogram bins, which
  // short-changes images with fine gradations in few hues (a grayscale ramp
  // collapses onto ~32 diagonal bins). Top up before refining, so Lloyd's
  // optimises the whole requested budget rather than part of it.
  if (count < budget) {
    const t = topUpCentroids(centroids, count, budget, cloud, space);
    centroids = t.centroids;
    count = t.count;
    stats.toppedUp = t.added;
  }

  const iterations = opts.refine ?? 8;
  if (iterations > 0 && count > 0) {
    const r = refine(centroids, count, cloud, { space, iterations });
    centroids = r.centroids;
    stats.kmeansIterations = r.iterations;
    stats.kmeansMoved = r.moved;
    stats.sse = r.sse;
  }

  // pinned colours are appended, then the whole set is lattice-constrained
  if (pinCount > 0) {
    const merged = new Float64Array((count + pinCount) * 3);
    merged.set(centroids.subarray(0, count * 3), 0);
    pin.forEach((c, i) => {
      const o = (count + i) * 3;
      merged[o] = c[0]; merged[o + 1] = c[1]; merged[o + 2] = c[2];
    });
    centroids = merged;
    count += pinCount;
  }

  const snapped = snapAndRefill(centroids, count, {
    lattice: lat, cloud, space, target: colors,
  });
  stats.collisions = snapped.collisions;
  stats.refilled = snapped.refilled;
  stats.headroom = snapped.headroom;
  stats.sseAfterSnap = snapped.sseAfterSnap;
  stats.sseAfterRefill = snapped.sseAfterRefill;

  return { palette: snapped.palette, count: snapped.count, stats };
}

/**
 * @typedef {Object} ReduceResult
 * @property {Uint8Array} indices        width*height palette indices
 * @property {Uint8Array} palette        count*3 RGB
 * @property {number} paletteCount
 * @property {number|null} transparentIndex
 * @property {Object} stats
 */

/**
 * Reduce an image to a palette. Pass `options.palette` to remap onto a fixed
 * palette; omit it to build one adaptively.
 * @returns {ReduceResult}
 */
export function reduce(image, options = {}) {
  const t0 = Date.now();
  const img = normaliseImage(image);
  const opts = options;
  const space = getSpace(opts.space ?? 'oklab');
  const lat = resolveLattice(opts);
  const dither = opts.dither ?? 'floyd-steinberg';
  if (!DITHERS.includes(dither)) {
    throw new Error(`unknown dither "${dither}" (expected one of ${DITHERS.join(', ')})`);
  }

  const colorsOpt = opts.colors ?? 256;
  if (!opts.palette && (!Number.isInteger(colorsOpt) || colorsOpt < 1 || colorsOpt > 256)) {
    throw new Error('colors must be an integer 1..256');
  }
  const alphaMode = opts.alpha ?? 'ignore';
  const alphaThreshold = alphaMode === 'threshold' ? (opts.alphaThreshold ?? 128) : 0;
  const px = img.width * img.height;

  /* -- transparency -- */
  let skip = null, transparentCount = 0;
  if (img.channels === 4 && alphaMode === 'threshold') {
    skip = new Uint8Array(px);
    for (let p = 0; p < px; p++) {
      if (img.data[p * 4 + 3] < alphaThreshold) { skip[p] = 1; transparentCount++; }
    }
    if (transparentCount === 0) skip = null;
  }

  /* -- palette -- */
  let palette, paletteCount, stats;
  const reserve = skip ? 1 : 0;
  if (opts.palette) {
    palette = opts.palette instanceof Uint8Array ? opts.palette : Uint8Array.from(opts.palette);
    if (palette.length % 3 !== 0 || palette.length === 0) {
      throw new Error('options.palette must be a non-empty n*3 RGB buffer');
    }
    paletteCount = palette.length / 3;
    stats = { lattice: lat.name, space: space.name, supplied: true, uniqueInput: 0 };
  } else {
    const budget = Math.max(1, (opts.colors ?? 256) - reserve);
    const built = buildPalette(image, { ...opts, colors: budget });
    palette = built.palette;
    paletteCount = built.count;
    stats = built.stats;
  }

  /* -- deterministic ordering (before assignment, so indices match) -- */
  // A supplied palette keeps its own order by default: the caller chose it, and
  // for a hardware LUT the order may be meaningful.
  const defaultOrder = opts.palette ? 'none' : 'lightness';
  palette = orderPalette(palette, opts.paletteOrder ?? defaultOrder, false).palette;

  /* -- reserved transparent entry, appended last -- */
  let transparentIndex = null;
  if (skip) {
    const bg = opts.background ?? [0, 0, 0];
    const grown = new Uint8Array(palette.length + 3);
    grown.set(palette, 0);
    grown[palette.length] = bg[0]; grown[palette.length + 1] = bg[1]; grown[palette.length + 2] = bg[2];
    palette = grown;
    transparentIndex = paletteCount;
    paletteCount += 1;
  }

  /* -- assignment -- */
  // The nearest-colour search must not see the reserved transparent entry, or
  // opaque pixels could be assigned to it.
  const searchPalette = transparentIndex === null
    ? palette
    : palette.subarray(0, transparentIndex * 3);
  const nearest = createNearest(searchPalette, { space, lattice: lat });
  const palWork = paletteToWorking(searchPalette, space);

  // Index width follows the palette size. Uint8Array covers the normal case
  // (<=256 entries) and is what an indexed encoder wants, but remapping onto a
  // full RGB565 grid means 65536 entries, and a byte array would silently wrap.
  const IndexArray = paletteCount <= 256 ? Uint8Array
    : (paletteCount <= 65536 ? Uint16Array : Uint32Array);
  const indices = new IndexArray(px);

  const useEdge = (opts.ditherAdaptive ?? true) && dither !== 'none'
    && (opts.ditherEdgeSuppression ?? 1) > 0;
  const edge = useEdge ? edgeMap(img) : null;

  const spacing = dither === 'none' ? 0 : meanPaletteSpacing(palWork, searchPalette.length / 3);
  const clampFactor = opts.ditherErrorClamp ?? 0.25;
  const errorLimit = (dither === 'none' || !(clampFactor > 0))
    ? Infinity
    : clampFactor * spacing * 4; // 4x the mean gap: bounds the outliers, not normal error

  const dOpts = {
    strength: opts.ditherStrength ?? 1,
    serpentine: opts.serpentine !== false,
    errorLimit,
    edge,
    edgeSuppression: opts.ditherEdgeSuppression ?? 1,
    skip,
    queue: opts.riemersmaQueue ?? 16,
    decay: opts.riemersmaDecay ?? 1 / 16,
    matrixSize: opts.orderedMatrixSize ?? 8,
  };

  const tAssign = Date.now();
  if (dither === 'none') {
    const d = img.data, ch = img.channels;
    for (let p = 0; p < px; p++) {
      if (skip && skip[p]) continue;
      const k = p * ch;
      indices[p] = nearest.findRGB8(d[k], d[k + 1], d[k + 2]);
    }
  } else if (dither === 'floyd-steinberg') {
    ditherFloydSteinberg(img, nearest, palWork, space, indices, dOpts);
  } else if (dither === 'riemersma') {
    ditherRiemersma(img, nearest, palWork, space, indices, dOpts);
  } else {
    ditherOrdered(img, nearest, palWork, space, indices, dOpts);
  }

  if (skip) for (let p = 0; p < px; p++) if (skip[p]) indices[p] = transparentIndex;

  stats.searchTier = nearest.tier;
  stats.searchStats = nearest.stats;
  stats.dither = dither;
  stats.transparentPixels = transparentCount;
  stats.msAssign = Date.now() - tAssign;
  stats.msTotal = Date.now() - t0;

  return { indices, palette, paletteCount, transparentIndex, stats };
}

/** Adaptive palette (the `-colors N` equivalent). */
export function quantize(image, options = {}) {
  const { palette, ...rest } = options;
  void palette;
  return reduce(image, rest);
}

/** Fixed palette (the `-remap` equivalent). */
export function remap(image, palette, options = {}) {
  return reduce(image, { ...options, palette });
}
