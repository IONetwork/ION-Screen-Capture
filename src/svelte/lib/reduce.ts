// Main-thread client for the colour-reduction worker.
//
// Owns the worker's lifetime, tags requests so a stale reply is ignored, and
// enforces a deadline. The deadline matters: if reduction never completes, the
// backend is still holding a capture whose save and clipboard copy it deferred,
// so somebody has to tell it to give up and deliver the original.

import type { ColorSpace } from "$lib/ipc";
import type { ReduceFailure, ReduceReply, ReduceRequest } from "$lib/reduce.worker";

export interface ReducedPixels {
  indices: Uint8Array;
  palette: Uint8Array;
  paletteCount: number;
  width: number;
  height: number;
  msTotal: number;
}

/**
 * A real reduction is well under a second, so this only trips on a genuine
 * hang. It is deliberately generous: the cost of waiting is a late save, while
 * the cost of giving up too early is an unreduced file.
 */
const DEADLINE_MS = 15_000;

let worker: Worker | null = null;
let seq = 0;

function spawn(): Worker {
  // `new URL(..., import.meta.url)` is the build-analysable form, so Vite emits
  // the worker (and the library it pulls in) as its own chunk instead of
  // bundling ~100 KB of reducer into the startup path.
  return new Worker(new URL("./reduce.worker.ts", import.meta.url), {
    type: "module",
    name: "img-reduce",
  });
}

/** Drop the worker, e.g. after a timeout left it in an unknown state. */
export function resetReducer() {
  worker?.terminate();
  worker = null;
}

/**
 * Reduce a capture's data URL to palette indices.
 *
 * Decoding happens inside the worker, so nothing here touches the main thread
 * beyond posting a string.
 */
export function reduceDataUrl(
  dataUrl: string,
  opts: { colors: number; space: ColorSpace; dither: boolean },
): Promise<ReducedPixels> {
  worker ??= spawn();
  const w = worker;
  const mine = ++seq;

  return new Promise<ReducedPixels>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      // The worker's state is unknown, so start fresh next time rather than
      // queueing behind whatever it is stuck on.
      resetReducer();
      reject(new Error(`colour reduction did not finish within ${DEADLINE_MS / 1000}s`));
    }, DEADLINE_MS);

    function cleanup() {
      clearTimeout(timer);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    }

    function onMessage(ev: MessageEvent<ReduceReply | ReduceFailure>) {
      // A reply from a superseded request: ignore it, keep waiting for ours.
      if (ev.data.seq !== mine || settled) return;
      settled = true;
      cleanup();
      if (!ev.data.ok) {
        reject(new Error(ev.data.message));
        return;
      }
      const { indices, palette, paletteCount, width, height, msTotal } = ev.data;
      resolve({ indices, palette, paletteCount, width, height, msTotal });
    }

    function onError(ev: ErrorEvent) {
      if (settled) return;
      settled = true;
      cleanup();
      resetReducer();
      reject(new Error(ev.message || "the colour reduction worker failed"));
    }

    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);

    const req: ReduceRequest = {
      seq: mine,
      dataUrl,
      colors: opts.colors,
      space: opts.space,
      dither: opts.dither,
    };
    w.postMessage(req);
  });
}
