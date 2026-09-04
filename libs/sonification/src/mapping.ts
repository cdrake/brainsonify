/** A closed numeric interval: an intensity window, or a world-space axis span. */
export interface Extent {
  lo: number;
  hi: number;
}

/** The intensity window a volume is displayed and sonified over. */
export type IntensityRange = Extent;

export const DEFAULT_RANGE: IntensityRange = { lo: 0, hi: 1 };

/** A volume's world-space bounding box, in millimeters, per axis. */
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
 * over.
 */
export function pan(mm: number, extent: Extent, width: number): number {
  return signedPosition(mm, extent, width);
}

/**
 * Places a world coordinate on the front-back axis, -1 fully posterior to +1
 * fully anterior.
 *
 * The companion to `pan`, and anatomical for the same reason: the occiput
 * should sound like the occiput from every viewing angle, not swap ends with
 * the forehead when the render is spun round.
 *
 * It is a separate function rather than `pan` called on world Y because the two
 * are separate channels with separate controls. Collapsing the stereo field to
 * mono should not also flatten depth, and a condition may want one without the
 * other. `spread` scales it the way `width` scales the stereo image.
 */
export function anteriority(mm: number, extent: Extent, spread: number): number {
  return signedPosition(mm, extent, spread);
}

/** Places a world coordinate on the inferior-superior axis, -1 to +1. */
export function elevation(mm: number, extent: Extent): number {
  return signedPosition(mm, extent, 1);
}

/**
 * A world coordinate as a signed -1..1 offset across an axis, scaled.
 *
 * A degenerate extent stays neutral rather than pinning to one end: a volume
 * with no thickness on an axis has no position along it to report. A zero
 * scale returns early for the same reason, and to keep a collapsed field at a
 * clean 0 — multiplying through would hand back -0 for half the volume, which
 * compares unequal to 0 and would be a nuisance to anything downstream.
 */
function signedPosition(mm: number, extent: Extent, scale: number): number {
  const span = extent.hi - extent.lo;
  const width = Math.min(1, Math.max(0, scale));
  if (!(span > 0) || width === 0) return 0;

  const t = (mm - extent.lo) / span;
  return Math.min(1, Math.max(-1, t * 2 - 1)) * width;
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
