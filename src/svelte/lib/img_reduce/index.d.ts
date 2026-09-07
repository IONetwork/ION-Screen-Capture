/**
 * img_reduce — zero-dependency image colour reduction.
 *
 * Hand-written declarations: the library is plain ES modules with JSDoc, so
 * there is no build step, and this file is what gives a TypeScript consumer
 * full typing without adding a toolchain.
 */

export type DitherMethod = 'none' | 'floyd-steinberg' | 'riemersma' | 'ordered';
export type SpaceName = 'srgb' | 'linear' | 'oklab';
export type LatticeName = 'rgb565' | 'rgb888' | 'none';
export type ExpansionName = 'truncate' | 'centered' | 'high' | 'replicate';
export type PaletteOrder = 'lightness' | 'population' | 'none';
export type AlphaMode = 'ignore' | 'threshold';

export interface Image8 {
  /** Interleaved RGB or RGBA, tightly packed. */
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  /** Inferred from data.length when omitted. */
  channels?: 3 | 4;
}

export interface Lattice {
  readonly name: string;
  readonly bits: number[];
  readonly expansion: string;
  /** Per channel: index -> representable 8-bit value. */
  readonly levels: Uint8Array[];
  /** Per channel: 8-bit value -> nearest index (exact, brute-forced). */
  readonly toIndex: Uint8Array[];
  readonly size: number;
  readonly isFullByte: boolean;
}

export interface Options {
  /** 1..256. 256 is legal; an index is reserved only when alpha handling is on. */
  colors?: number;
  /** Restrict the palette to a colour lattice. Default 'rgb888' (no restriction). */
  lattice?: LatticeName | Lattice | null;
  /** How 5/6-bit values expand to 8 bits. Default 'replicate' (hardware-correct). */
  expand565?: ExpansionName;
  /** Working space for palette generation and nearest search. Default 'oklab'. */
  space?: SpaceName;
  /** Default 'floyd-steinberg'. */
  dither?: DitherMethod;
  /** 0..1, default 1. */
  ditherStrength?: number;
  /** Suppress dither on edges and thin features. Default true. */
  ditherAdaptive?: boolean;
  /** Edge-suppression gain, default 1. */
  ditherEdgeSuppression?: number;
  /** Residual clamp as a fraction of the mean palette gap. Default 0.25. */
  ditherErrorClamp?: number;
  /** Alternate scan direction per row. Default true. */
  serpentine?: boolean;
  /** Riemersma error-history length. Default 16 (matching ImageMagick). */
  riemersmaQueue?: number;
  /** Riemersma decay across the history. Default 1/16. */
  riemersmaDecay?: number;
  /** Bayer matrix side for ordered dithering. Default 8. */
  orderedMatrixSize?: number;
  /**
   * Lloyd's (k-means) refinement iterations. Default 8.
   * Setting this to 0 is measurably worse than ImageMagick — the refinement is
   * what makes the adaptive path win. Do not disable it for quality reasons.
   */
  refine?: number;
  /** Colours the palette must contain, e.g. instrument trace colours. */
  pin?: Array<[number, number, number]>;
  /** Default 'ignore'. 'threshold' reserves an index for transparent pixels. */
  alpha?: AlphaMode;
  /** Alpha below this counts as transparent. Default 128. */
  alphaThreshold?: number;
  /** Colour stored in the reserved transparent entry. Default [0,0,0]. */
  background?: [number, number, number];
  /** Palette sort order. Default 'lightness' for adaptive, 'none' for supplied. */
  paletteOrder?: PaletteOrder;
  /** Supply a fixed palette (n*3 RGB) instead of building one. */
  palette?: Uint8Array | ArrayLike<number>;
}

export interface Stats {
  lattice: string;
  expansion?: string;
  space: string;
  /** Distinct colours in the input (capped by the census limit). */
  uniqueInput: number;
  /** True when the input already fitted the budget and passed through unchanged. */
  lossless: boolean;
  /** Centroids that collapsed onto the same lattice point. */
  collisions: number;
  /** Entries added after snapping to restore the requested count. */
  refilled: number;
  /** Centroids added by farthest-point seeding before refinement. */
  toppedUp?: number;
  kmeansIterations: number;
  /** False when the image lacks enough distinct lattice colours for the budget. */
  headroom: boolean;
  /** Which search tier ran: 'grid' | 'cell' | 'brute'. */
  searchTier: string;
  searchStats?: Record<string, unknown>;
  dither: string;
  transparentPixels: number;
  cells?: number;
  sse?: number;
  sseAfterSnap?: number;
  sseAfterRefill?: number;
  msAssign: number;
  msTotal: number;
}

export interface ReduceResult {
  /**
   * One palette index per pixel. Uint8Array for the normal case (<=256
   * entries); widens to Uint16Array/Uint32Array for larger palettes, such as a
   * remap onto the full 65536-entry RGB565 grid.
   */
  indices: Uint8Array | Uint16Array | Uint32Array;
  /** count*3 interleaved RGB. */
  palette: Uint8Array;
  paletteCount: number;
  /** Index reserved for transparent pixels, or null. */
  transparentIndex: number | null;
  stats: Stats;
}

export interface PaletteResult {
  palette: Uint8Array;
  count: number;
  stats: Partial<Stats>;
}

export interface Nearest {
  /** Exact nearest index for an integer 8-bit colour. */
  findRGB8(r: number, g: number, b: number): number;
  /** Exact nearest index for a real-valued working-space point. */
  findContinuous(c0: number, c1: number, c2: number): number;
  toWorking(r: number, g: number, b: number, out: Float64Array, o?: number): void;
  readonly tier: string;
  readonly stats: Record<string, unknown>;
}

/* ------------------------------------------------------------------ core */

export function reduce(image: Image8, options?: Options): ReduceResult;
/** Adaptive palette. The `-colors N` equivalent. */
export function quantize(image: Image8, options?: Options): ReduceResult;
/** Fixed palette. The `-remap` equivalent. */
export function remap(image: Image8, palette: Uint8Array | ArrayLike<number>, options?: Options): ReduceResult;
/** Build a palette without assigning pixels, so it can be reused across frames. */
export function buildPalette(image: Image8, options?: Options): PaletteResult;

/* --------------------------------------------------------------- lattice */

export const GRID_565: Lattice;
export const GRID_888: Lattice;
export function createLattice(bits: number[], expansion?: ExpansionName): Lattice;
export function latticeToPalette(lattice: Lattice): Uint8Array;
export const EXPANSIONS: Record<ExpansionName, (index: number, bits: number) => number>;
export function isOnLattice(lattice: Lattice, r: number, g: number, b: number): boolean;
export function snapToLattice(lattice: Lattice, r: number, g: number, b: number, out: Uint8Array, o?: number): void;
/** Worst-case per-channel error for correct nearest assignment, from the level table. */
export function maxLatticeError(lattice: Lattice): number[];
/** Exact nearest level index for a real value; ties go to the lower index. */
export function nearestLevelIndex(levels: Uint8Array, x: number): number;

export function packRGB565(r: number, g: number, b: number, lattice?: Lattice): number;
export function packIndices565(r5: number, g6: number, b5: number): number;
export function unpackRGB565(v: number, out: Uint8Array, o?: number, lattice?: Lattice): void;
export function byteSwap565(u16: Uint16Array): Uint16Array;

/* --------------------------------------------------------------- packing */

export function toRGB(indices: ArrayLike<number>, palette: Uint8Array, out?: Uint8Array): Uint8Array;
export function toRGBA(indices: ArrayLike<number>, palette: Uint8Array, transparentIndex?: number | null, out?: Uint8Array): Uint8Array;
export function toRGB565(indices: ArrayLike<number>, palette: Uint8Array, opts?: { lattice?: Lattice; byteOrder?: 'le' | 'be' }): Uint16Array;
export function paletteToRGB565(palette: Uint8Array, opts?: { lattice?: Lattice; byteOrder?: 'le' | 'be' }): Uint16Array;

/* ---------------------------------------------------------------- search */

export function createNearest(palette: Uint8Array, opts?: { space?: SpaceName; lattice?: Lattice | null; cellGrid?: number }): Nearest;
export function createBruteNearest(palette: Uint8Array, opts?: { space?: SpaceName }): Nearest;
export function isFullLattice(lattice: Lattice, palette: Uint8Array): boolean;

/* ----------------------------------------------------------------- misc */

export function bayerMatrix(size?: number): { size: number; values: Float64Array };
export function hilbertD2XY(side: number, d: number, out: Int32Array | number[]): void;
export function hilbertWalk(width: number, height: number): Generator<number>;

export const SPACES: Record<SpaceName, unknown>;
export function getSpace(name: SpaceName): unknown;
export function srgb8ToOklab(r: number, g: number, b: number, out: Float64Array, o?: number): void;
export function srgbfToOklab(r: number, g: number, b: number, out: Float64Array, o?: number): void;
export function oklabToSrgb8(L: number, A: number, B: number, out: Uint8Array | number[], o?: number): void;

export namespace metrics {
  function mse(a: ArrayLike<number>, b: ArrayLike<number>): number;
  function rmse(a: ArrayLike<number>, b: ArrayLike<number>): number;
  function psnr(a: ArrayLike<number>, b: ArrayLike<number>): number;
  function maxAbsError(a: ArrayLike<number>, b: ArrayLike<number>): number;
  function differingSamples(a: ArrayLike<number>, b: ArrayLike<number>): number;
  function differingPixels(a: ArrayLike<number>, b: ArrayLike<number>, channels?: number): number;
  function meanDeltaE(a: ArrayLike<number>, b: ArrayLike<number>, channels?: number): number;
  function countDistinct(buf: ArrayLike<number>, channels?: number): number;
  function compare(a: ArrayLike<number>, b: ArrayLike<number>, channels?: number): {
    psnr: number; rmse: number; maxAbsError: number; meanDeltaE: number; differingPixels: number;
  };
}
