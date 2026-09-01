/**
 * Keeping perceived loudness flat while pitch carries the data.
 *
 * The ear is not equally sensitive across the range this app sweeps. Between
 * 110 Hz and 1760 Hz — the default span of four octaves — sensitivity rises by
 * about 19 dB, so a sine held at constant amplitude gets *louder and harsher*
 * as it climbs. Two things go wrong. It is tiring to listen to, which matters
 * when the interaction is a continuous hover. And loudness becomes a second,
 * exaggerated copy of intensity, so a listener cannot tell whether they are
 * hearing pitch or level, and the quiet end of the range is thrown away.
 *
 * Compensating means attenuating where the ear is sensitive rather than
 * boosting where it is not: boosting would need +19 dB of headroom the output
 * does not have. So the gain is 1 at the reference and falls from there.
 */

/**
 * A-weighting's frequency response, as a linear gain.
 *
 * The standard approximation of ear sensitivity, and the reason it is only
 * applied in part: A-weighting traces the equal-loudness contour at about 40
 * phon, which is quiet listening. Contours flatten as level rises, so applying
 * it whole would over-correct for anyone not listening quietly and leave the
 * top of the range sounding hollow.
 */
export function aWeighting(freq: number): number {
  if (!(freq > 0)) return 0;
  const f2 = freq * freq;
  const numerator = 12194 ** 2 * f2 * f2;
  const denominator =
    (f2 + 20.6 ** 2) *
    Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
    (f2 + 12194 ** 2);
  return numerator / denominator;
}

/** Where the gain is 1. The default bottom of the pitch range. */
export const LOUDNESS_REF_HZ = 110;

/**
 * How much of the weighting to apply, in the log domain.
 *
 * 1 would equalise loudness exactly at 40 phon; 0 disables compensation. 0.7
 * lands near the equal-loudness contour for the level someone actually explores
 * at, and leaves the bright end of the volume with presence rather than merely
 * parity.
 */
export const LOUDNESS_COMPENSATION = 0.7;

/**
 * Gain that holds perceived loudness roughly constant as pitch changes.
 *
 * Never exceeds 1, so it can be applied to an existing gain without costing
 * headroom or risking clipping. Below the reference it flattens out rather than
 * boosting, which also keeps the very bottom of the range from booming.
 */
export function loudnessGain(
  freq: number,
  ref: number = LOUDNESS_REF_HZ,
  strength: number = LOUDNESS_COMPENSATION,
): number {
  if (!(freq > 0)) return 0;
  const ratio = aWeighting(ref) / aWeighting(freq);
  if (!(ratio > 0)) return 1;
  return Math.min(1, ratio ** strength);
}
