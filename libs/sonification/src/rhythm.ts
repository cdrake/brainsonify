/**
 * Opacity as a channel of its own.
 *
 * Intensity is what a voxel *is*; opacity is how much of it the renderer
 * actually shows you, which is a different question once a display window or a
 * colormap with its own alpha ramp is in play. Sonifying opacity means the ears
 * get told what the eyes would have been told.
 */

/** Taps per second at the transparent and fully opaque ends of the scale. */
export interface TapRange {
  slowest: number;
  fastest: number;
}

/**
 * A slow tick through a fast rattle.
 *
 * The top end stays well under the ~20/s where a click train stops being heard
 * as separate taps and fuses into a buzz with a pitch of its own — which would
 * put this channel straight back on top of the one carrying intensity.
 */
export const DEFAULT_TAPS: TapRange = { slowest: 1.5, fastest: 14 };

/** Entries in a NiiVue colormap lookup table: 256 RGBA quads. */
const LUT_ENTRIES = 256;

/**
 * The alpha a colormap assigns to a normalised intensity, 0..1.
 *
 * `lut` is what `cmapper.colormap()` hands back: 256 RGBA quads, so the alpha
 * for entry `i` sits at `i * 4 + 3`. A LUT that is not that shape means we
 * cannot say what is being drawn, so nothing is: fully transparent.
 */
export function opacityFromLut(lut: ArrayLike<number>, norm: number): number {
  if (lut.length < LUT_ENTRIES * 4) return 0;

  const clamped = Math.min(1, Math.max(0, norm));
  const index = Math.round(clamped * (LUT_ENTRIES - 1));
  return lut[index * 4 + 3] / 255;
}

/**
 * The most opaque a colormap ever gets, 0..1.
 *
 * Colormaps spend alpha very differently: NiiVue's `gray` ramps only to
 * 128/255, so its most opaque voxel is half opaque in absolute terms. Reported
 * as-is that would be a fact about the palette, not about the tissue.
 */
export function peakAlpha(lut: ArrayLike<number>): number {
  if (lut.length < LUT_ENTRIES * 4) return 0;

  let peak = 0;
  for (let i = 0; i < LUT_ENTRIES; i++) peak = Math.max(peak, lut[i * 4 + 3]);
  return peak / 255;
}

/**
 * Opacity as a fraction of the most this colormap gives, 0..1.
 *
 * Driving the taps off raw alpha would leave the fast half of the range
 * unreachable under `gray` — the loudest thing in the volume would rattle at
 * a third of the rate the scale was built for — and would make the channel's
 * span an accident of the palette rather than a property of the image. Scaling
 * by the peak keeps the *shape* of the alpha ramp, which is the part worth
 * hearing: its plateaus, its threshold, where it stops tracking intensity.
 */
export function relativeOpacity(alpha: number, peak: number): number {
  if (!(peak > 0)) return 0;
  return Math.min(1, Math.max(0, alpha / peak));
}

/**
 * Maps opacity onto a tap rate, in taps per second.
 *
 * Geometric rather than linear, for the same reason pitch is: tempo is heard as
 * a ratio. Spacing the rates linearly would spend most of the scale up in the
 * fast end, where one rate is indistinguishable from the next, and crowd every
 * audible difference into the last sliver of the range.
 */
export function tapRate(opacity: number, range: TapRange = DEFAULT_TAPS): number {
  const { slowest, fastest } = range;
  if (!(slowest > 0) || !(fastest > 0)) return 0;

  const clamped = Math.min(1, Math.max(0, opacity));
  return slowest * Math.pow(fastest / slowest, clamped);
}
