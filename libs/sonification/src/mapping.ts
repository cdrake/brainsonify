/** The intensity window a volume is displayed and sonified over. */
export interface IntensityRange {
  lo: number;
  hi: number;
}

export const DEFAULT_RANGE: IntensityRange = { lo: 0, hi: 1 };

/** Clamps a raw voxel value into 0..1 across the display window. */
export function normalise(raw: number, range: IntensityRange): number {
  const span = range.hi - range.lo;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (raw - range.lo) / span));
}

/** Maps normalised intensity onto `octaves` of pitch above `lowHz`. */
export function frequency(norm: number, lowHz: number, octaves: number): number {
  return lowHz * Math.pow(2, norm * octaves);
}
