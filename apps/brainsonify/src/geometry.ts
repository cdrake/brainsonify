/**
 * The small pieces of NiiVue's arithmetic the app leans on that NiiVue 1.0 no
 * longer hands out: voxel reads, voxel/world conversion, the colormap as a
 * lookup table, and projection through a tile's camera.
 *
 * Kept free of any NiiVue import (types aside) so it can be unit-tested and so
 * the app does not reach into modules the package does not export. Each
 * function mirrors the NiiVue code it replaces, named in its comment, so a
 * disagreement can be settled by reading that code.
 */

export type Vec3 = [number, number, number];

/** The fields of a loaded NiiVue volume a voxel read needs. */
export interface VoxelVolume {
  img: ArrayLike<number> | null;
  hdr: { scl_slope: number; scl_inter: number };
  dimsRAS?: number[];
  img2RASstart?: number[];
  img2RASstep?: number[];
}

/**
 * The scaled intensity of the voxel at RAS voxel coordinates.
 *
 * What 0.69's `NVImage.getValue` did, which 1.0 dropped: coordinates are
 * rounded and clamped to the grid (an edge voxel, not nothing, for a point
 * just outside), and `scl_slope`/`scl_inter` are applied, so a hover reads the
 * same number it did before the upgrade. Null only when the volume has no
 * voxels or the voxel is not a number.
 */
export function voxelValue(vol: VoxelVolume, i: number, j: number, k: number): number | null {
  const { img, dimsRAS: dims, img2RASstart: start, img2RASstep: step } = vol;
  if (!img || !dims || !start || !step) return null;

  const x = clampIndex(i, dims[1]);
  const y = clampIndex(j, dims[2]);
  const z = clampIndex(k, dims[3]);
  const raw = img[start[0] + x * step[0] + start[1] + y * step[1] + start[2] + z * step[2]];
  if (raw === undefined || Number.isNaN(raw)) return null;

  const slope = vol.hdr.scl_slope;
  const inter = vol.hdr.scl_inter;
  return (Number.isNaN(slope) || slope === 0 ? 1 : slope) * raw + (Number.isNaN(inter) ? 0 : inter);
}

function clampIndex(value: number, size: number): number {
  return Math.max(0, Math.min(Math.round(value), size - 1));
}

/**
 * World millimeters for a RAS voxel coordinate.
 *
 * `matRAS` is stored row-major (NiiVue transposes it before handing it to
 * gl-matrix), so the translation is at indices 3, 7 and 11.
 */
export function vox2mm(matRAS: ArrayLike<number>, vox: ArrayLike<number>): Vec3 {
  return affine(matRAS, vox[0], vox[1], vox[2]);
}

/** The RAS voxel coordinate of a world point, unrounded. Null for a degenerate affine. */
export function mm2vox(matRAS: ArrayLike<number>, mm: ArrayLike<number>): Vec3 | null {
  // Inverting is layout-agnostic, so the row-major inverse comes straight out.
  const inverse = invert4(matRAS);
  return inverse ? affine(inverse, mm[0], mm[1], mm[2]) : null;
}

function affine(m: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
  ];
}

/** A colormap's control points, as `lookupColorMap` returns them. */
export interface ColorMapPoints {
  R: number[];
  G: number[];
  B: number[];
  A?: number[];
  I?: number[];
}

/**
 * The colormap as 256 RGBA quads.
 *
 * NiiVue's own `lutrgba8`, which is not exported: control points interpolated
 * linearly, full opacity where the map gives no alpha, and on inversion the
 * colors reversed while alpha stays put — the shaders rely on index 0 being
 * transparent, and so does reading opacity back off the table here.
 */
export function colormapLut(map: ColorMapPoints, invert = false): Uint8ClampedArray {
  const is = map.I ?? spread(map.R.length);
  const as = map.A && map.A.length === is.length ? map.A : is.map(() => 255);
  const lut = new Uint8ClampedArray(256 * 4);

  for (let i = 0; i < is.length - 1; i++) {
    const lo = is[i];
    const hi = is[i + 1];
    for (let j = lo; j <= hi; j++) {
      const f = hi > lo ? (j - lo) / (hi - lo) : 0;
      const k = j * 4;
      lut[k] = Math.round(map.R[i] + f * (map.R[i + 1] - map.R[i]));
      lut[k + 1] = Math.round(map.G[i] + f * (map.G[i + 1] - map.G[i]));
      lut[k + 2] = Math.round(map.B[i] + f * (map.B[i + 1] - map.B[i]));
      lut[k + 3] = Math.round(as[i] + f * (as[i + 1] - as[i]));
    }
  }
  if (!invert) return lut;

  const out = new Uint8ClampedArray(lut.length);
  for (let i = 0; i < 256; i++) {
    const from = (255 - i) * 4;
    out[i * 4] = lut[from];
    out[i * 4 + 1] = lut[from + 1];
    out[i * 4 + 2] = lut[from + 2];
    out[i * 4 + 3] = lut[i * 4 + 3];
  }
  return out;
}

/** Evenly spaced indices over 0..255, for a map given without them. */
function spread(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((i * 255) / Math.max(1, count - 1)));
}

/**
 * Projects a world point to canvas pixels through a tile's camera.
 *
 * The same map as NiiVue's `projectMMToCanvas`, plus the perspective divide the
 * render tile needs (2D tiles are orthographic, so there `w` is 1 and the
 * divide changes nothing). Being orthographic, a 2D tile projects a point onto
 * its own plane however far off the shown slice it sits: a shadow rather than
 * a literal point, which is what the overlays want. Null when the point is
 * behind the camera or off the tile.
 *
 * @param mvp the tile's MVP, column-major as gl-matrix stores it.
 * @param ltwh the tile's rectangle in canvas pixels: left, top, width, height.
 */
export function projectToCanvas(
  mm: ArrayLike<number>,
  mvp: ArrayLike<number>,
  ltwh: ArrayLike<number>,
): [number, number] | null {
  const [x, y, z] = [mm[0], mm[1], mm[2]];
  const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
  const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
  const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (!(cw > 0)) return null;

  const ndcX = cx / cw;
  const ndcY = cy / cw;
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) return null;
  return [ltwh[0] + (ndcX + 1) * 0.5 * ltwh[2], ltwh[1] + (1 - ndcY) * 0.5 * ltwh[3]];
}

/**
 * The near-to-far direction of the view ray through a canvas pixel, in world
 * millimeters, as a unit vector.
 *
 * 0.69 exposed `calculateRayDirection`; 1.0 does not, but the render tile's MVP
 * is public, and unprojecting the pixel at the near and far planes gives the
 * same ray — the exact one through this pixel, rather than the view axis, which
 * is what a perspective camera needs away from the centre.
 */
export function viewRay(
  x: number,
  y: number,
  mvp: ArrayLike<number>,
  ltwh: ArrayLike<number>,
): Vec3 | null {
  const inverse = invert4(mvp);
  if (!inverse) return null;

  const ndcX = ((x - ltwh[0]) / ltwh[2]) * 2 - 1;
  const ndcY = 1 - ((y - ltwh[1]) / ltwh[3]) * 2;
  const near = unproject(inverse, ndcX, ndcY, -1);
  const far = unproject(inverse, ndcX, ndcY, 1);
  if (!near || !far) return null;

  const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
  const length = Math.hypot(...dir);
  return length > 0 ? [dir[0] / length, dir[1] / length, dir[2] / length] : null;
}

/** A clip-space point back to world space through a column-major inverse MVP. */
function unproject(inv: ArrayLike<number>, x: number, y: number, z: number): Vec3 | null {
  const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
  if (!(Math.abs(w) > 1e-12)) return null;
  return [
    (inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w,
    (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w,
    (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w,
  ];
}

/**
 * The inverse of a 4x4 matrix, or null when it has none.
 *
 * gl-matrix's `mat4.invert`, written out rather than pulling the library in
 * for this one use. Works in either storage order: the inverse of a transpose
 * is the transpose of the inverse.
 */
export function invert4(a: ArrayLike<number>): number[] | null {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = Array.from(a);

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  const d = 1 / det;

  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d,
    (a02 * b10 - a01 * b11 - a03 * b09) * d,
    (a31 * b05 - a32 * b04 + a33 * b03) * d,
    (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d,
    (a00 * b11 - a02 * b08 + a03 * b07) * d,
    (a32 * b02 - a30 * b05 - a33 * b01) * d,
    (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d,
    (a01 * b08 - a00 * b10 - a03 * b06) * d,
    (a30 * b04 - a31 * b02 + a33 * b00) * d,
    (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d,
    (a00 * b09 - a01 * b07 + a02 * b06) * d,
    (a31 * b01 - a30 * b03 - a32 * b00) * d,
    (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
}
