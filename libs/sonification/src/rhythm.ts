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

/**
 * The range for a driver that names a boundary rather than a quantity.
 *
 * Wider at both ends than `DEFAULT_TAPS`, and deliberately fast enough at the
 * top to sit at the edge of fusion: around 22/s the taps stop being countable
 * and turn into a flutter, which makes bone *categorically* different from soft
 * tissue instead of merely quicker than it. That is the opposite of the choice
 * 03 makes, and it is safe here for the reason 03 was worried about — a 22 Hz
 * flutter is more than two octaves below the 110 Hz floor of the pitch channel,
 * far too low to be confused with the tone or to mask it.
 */
export const BONE_TAPS: TapRange = { slowest: 1.2, fastest: 22 };

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
 * Pushes a driver towards its ends, so a boundary is heard as a boundary.
 *
 * `tapRate` spends its range evenly, which is right for a quantity that varies
 * smoothly the way opacity does. A driver that answers a yes-or-no question
 * does not vary smoothly: a voxel is skull or it is not, and the thin band of
 * half-answers on either side is the least informative part of the signal.
 * Spending audible range on it blurs the one edge worth conveying, and leaves
 * the listener unable to say whether a middling rate means "partly bone" or
 * "somewhere near bone".
 *
 * A logistic centered on `mid`, rescaled so 0 and 1 still land on 0 and 1: a
 * gradual climb becomes a step with soft shoulders. The shoulders matter —
 * a hard threshold would chatter between two rates as the pointer wanders
 * across it.
 */
export function contrast(value: number, steepness = 12, mid = 0.45): number {
  const clamped = Math.min(1, Math.max(0, value));
  const curve = (t: number) => 1 / (1 + Math.exp(-steepness * (t - mid)));

  const lo = curve(0);
  const hi = curve(1);
  if (!(hi > lo)) return clamped;

  return (curve(clamped) - lo) / (hi - lo);
}

/**
 * Maps opacity onto a tap rate, in taps per second.
 *
 * Geometric rather than linear, for the same reason pitch is: tempo is heard as
 * a ratio. Spacing the rates linearly would spend most of the scale up in the
 * fast end, where one rate is indistinguishable from the next, and crowd every
 * audible difference into the last sliver of the range.
 *
 * `coefficient` scales the whole scale without changing the ratios in it, which
 * sounds like it should not help tell two tissues apart and does. Telling 1.2/s
 * from 3.9/s means waiting out two or three taps of each — the better part of a
 * second per reading, by which time the pointer has moved. The same ratio at
 * 2.4/s against 7.8/s is legible almost immediately. The coefficient buys that
 * time back, at the cost of pushing the fast end towards a flutter.
 */
export function tapRate(
  opacity: number,
  range: TapRange = DEFAULT_TAPS,
  coefficient = 1,
): number {
  const { slowest, fastest } = range;
  if (!(slowest > 0) || !(fastest > 0) || !(coefficient > 0)) return 0;

  const clamped = Math.min(1, Math.max(0, opacity));
  return slowest * Math.pow(fastest / slowest, clamped) * coefficient;
}
