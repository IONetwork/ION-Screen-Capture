// Colour reduction, off the main thread.
//
// The whole job runs here, decode included: the worker is handed the capture's
// data URL and does fetch -> createImageBitmap -> OffscreenCanvas -> quantise.
// Reduction alone is 220 ms at 64 colours and 450 ms at 256 for a 1040x720
// screen, which is well past the point where a synchronous main-thread call
// looks like a hang, and captures arrive in bursts.
//
// Running it here also buys two things the main thread cannot: the reduction is
// cancellable (terminate the worker), and it can be given a deadline, which is
// what makes the "deliver the original instead" fallback real rather than
// aspirational.

import { quantize } from "img_reduce";
import type { ColorSpace } from "$lib/ipc";

export interface ReduceRequest {
  /** Echoed back so a stale reply can be discarded. */
  seq: number;
  /** `data:<mime>;base64,…` straight from the capture response. */
  dataUrl: string;
  colors: number;
  space: ColorSpace;
  /** Error diffusion on or off; the method itself is fixed. */
  dither: boolean;
}

export interface ReduceReply {
  seq: number;
  ok: true;
  indices: Uint8Array;
  palette: Uint8Array;
  paletteCount: number;
  width: number;
  height: number;
  msTotal: number;
}

export interface ReduceFailure {
  seq: number;
  ok: false;
  message: string;
}

/*
 * Fixed by decision, not exposed in Settings. Palette size, colour space and
 * whether to dither all come from the request.
 *
 * When dithering is on the method is Floyd-Steinberg with serpentine scan,
 * which is the right general choice; the switch in Settings is about whether to
 * diffuse error at all, not which kernel to use.
 */
const DITHER_METHOD = "floyd-steinberg" as const;
const LATTICE = "rgb888" as const;
const DITHER_STRENGTH = 1.0;
const KMEANS_ITERATIONS = 12;

async function decode(dataUrl: string): Promise<ImageData> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context in the worker");
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (e: MessageEvent<ReduceRequest>) => {
  const { seq, dataUrl, colors, space, dither } = e.data;
  const post = self as unknown as Worker;
  try {
    const img = await decode(dataUrl);
    const result = quantize(
      { data: img.data, width: img.width, height: img.height, channels: 4 },
      {
        colors,
        lattice: LATTICE,
        dither: dither ? DITHER_METHOD : "none",
        ditherStrength: DITHER_STRENGTH,
        refine: KMEANS_ITERATIONS,
        space,
      },
    );

    // `indices` widens to Uint16Array above 256 entries. The IPC framing and the
    // Rust decoder both assume one byte per pixel, so assert rather than let a
    // widened array be silently truncated on the wire.
    if (!(result.indices instanceof Uint8Array)) {
      throw new Error(`palette produced ${result.paletteCount} entries, over the 256 an indexed PNG allows`);
    }

    const reply: ReduceReply = {
      seq,
      ok: true,
      indices: result.indices,
      palette: result.palette,
      paletteCount: result.paletteCount,
      width: img.width,
      height: img.height,
      msTotal: result.stats.msTotal,
    };
    // Transfer rather than copy: the library never writes back into its input,
    // and these are the only references left.
    post.postMessage(reply, [result.indices.buffer, result.palette.buffer]);
  } catch (err) {
    const failure: ReduceFailure = {
      seq,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
    post.postMessage(failure);
  }
};
