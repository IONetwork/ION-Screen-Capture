/**
 * sRGB transfer function, and 8-bit <-> linear-light conversion.
 *
 * The forward direction is a 256-entry table because every input we ever see is
 * an 8-bit channel value, so the pow() never has to run at pixel rates.
 */

/** sRGB electro-optical transfer function (gamma-encoded 0..1 -> linear 0..1). */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Inverse: linear 0..1 -> gamma-encoded 0..1. */
export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** 8-bit gamma-encoded value -> linear light, 0..1. Indexed by byte. */
export const SRGB8_TO_LINEAR = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i / 255);
  return t;
})();

/**
 * Linear light 0..1 -> 8-bit gamma-encoded, clamped and rounded half-up.
 *
 * Rounding is written as floor(x + 0.5) rather than Math.round so the tie
 * direction is explicit and stays stable if this is ever ported.
 */
export function linearToSrgb8(c) {
  if (!(c > 0)) return 0; // also catches NaN
  if (c >= 1) return 255;
  return Math.floor(linearToSrgb(c) * 255 + 0.5);
}

/** Clamp a real value to a rounded byte. */
export function toByte(v) {
  if (!(v > 0)) return 0;
  if (v >= 255) return 255;
  return Math.floor(v + 0.5);
}
