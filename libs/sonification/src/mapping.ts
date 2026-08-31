/** A closed numeric interval: an intensity window, or a world-space axis span. */
export interface Extent {
  lo: number;
  hi: number;
}

/** The intensity window a volume is displayed and sonified over. */
export type IntensityRange = Extent;

export const DEFAULT_RANGE: IntensityRange = { lo: 0, hi: 1 };

/** A volume's world-space bounding box, in millimetres, per axis. */
export interface Bounds {
  x: Extent;
  y: Extent;
  z: Extent;
}

export const DEFAULT_BOUNDS: Bounds = {
  x: { lo: 0, hi: 0 },
  y: { lo: 0, hi: 0 },
  z: { lo: 0, hi: 0 },
};

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

/**
 * Places a world coordinate in the stereo field, -1 hard left to +1 hard right.
 *
 * The axis is anatomical rather than screen-relative on purpose: panning by
 * where the pointer sits on screen would swing the hemispheres across the
 * stereo image every time the render is rotated, and tells you nothing your
 * eyes and hand do not already know. Panning by world X means the left
 * hemisphere is always in the left ear, on a slice or on a spinning render.
 *
 * `width` scales the field: 0 collapses to mono, 1 sends the extremes hard
 * over. A degenerate extent stays centred rather than pinning hard left.
 */
export function pan(mm: number, extent: Extent, width: number): number {
  const span = extent.hi - extent.lo;
  const scale = Math.min(1, Math.max(0, width));
  if (!(span > 0)) return 0;

  const t = (mm - extent.lo) / span;
  return Math.min(1, Math.max(-1, t * 2 - 1)) * scale;
}

/**
 * The world-space bounding box of the unit fractional cube.
 *
 * All eight corners are mapped, not just two: an obliquely stored volume has
 * a frac-to-mm transform with off-diagonal terms, so opposite corners of one
 * edge do not bracket the axis.
 */
export function boundsFromFrac(
  frac2mm: (frac: [number, number, number]) => ArrayLike<number>,
): Bounds {
  const axes: [number[], number[], number[]] = [[], [], []];

  for (let corner = 0; corner < 8; corner++) {
    const mm = frac2mm([corner & 1, (corner >> 1) & 1, (corner >> 2) & 1]);
    for (let axis = 0; axis < 3; axis++) axes[axis].push(mm[axis]);
  }

  const [x, y, z] = axes.map((v) => ({ lo: Math.min(...v), hi: Math.max(...v) }));
  return { x, y, z };
}
