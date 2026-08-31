import type { Niivue } from "@niivue/niivue";

/** NiiVue speaks gl-matrix vectors; borrow the type rather than depending on gl-matrix. */
type Frac = Parameters<Niivue["frac2vox"]>[0];

/**
 * Bits of the NiiVue instance we drive directly. They exist on the object but
 * are not part of the documented surface, so they are reached through one
 * explicit cast rather than sprinkling `any` through the sampling code.
 */
interface NiivueInternals {
  uiData: { dpr?: number; mouseDepthPicker: boolean };
  mousePos: number[];
  /** Set by depthPicker to the alpha of the pixel it read; VOLUME_ID (254) means a real volume hit. */
  selectedObjectId: number;
  VOLUME_ID: number;
  inRenderTile(x: number, y: number): number;
  drawScene(): void;
  calculateRayDirection(azimuth: number, elevation: number): ArrayLike<number>;
}

export interface Sample {
  /** Raw voxel intensity under the pointer. */
  raw: number;
  /** World coordinate of the voxel that produced `raw`, formatted "x, y, z" in millimetres. */
  mm: string;
  /** Which pick branch produced this, for diagnosing the 3D path. */
  source?: string;
}

/**
 * Converts a ray direction expressed in fractional volume coordinates into a
 * unit step in voxel coordinates.
 *
 * A fractional step is not a voxel step: the axes have different voxel counts,
 * so an equal fractional move covers more voxels along the longest axis. Scaling
 * by the dimensions first, then normalising, gives a direction whose length is
 * one voxel regardless of which way it points.
 */
export function rayToVoxelStep(
  rayFrac: ArrayLike<number>,
  dims: readonly [number, number, number],
): [number, number, number] {
  const scaled: [number, number, number] = [
    rayFrac[0] * dims[0],
    rayFrac[1] * dims[1],
    rayFrac[2] * dims[2],
  ];
  const length = Math.hypot(...scaled);
  if (!(length > 0)) return [0, 0, 0];
  return [scaled[0] / length, scaled[1] / length, scaled[2] / length];
}

/**
 * Reads the voxel under the pointer without moving the crosshair.
 *
 * 2D tiles are a direct lookup. The 3D render tile has no such mapping, so we
 * ask NiiVue to depth-pick on the next draw and read the position it resolves;
 * that costs a full redraw, hence one pick per animation frame at most.
 */
export class VoxelSampler {
  private nvi: NiivueInternals;
  private pickQueued = false;

  constructor(private nv: Niivue) {
    this.nvi = nv as unknown as NiivueInternals;
  }

  /**
   * @param surfaceDepth how many voxels to search inward from a 3D render hit.
   *   Ignored on 2D tiles, which are always an exact single-voxel read.
   * @param onSample called with the voxel under the pointer, or null when the
   *   pointer is off every tile. The 3D path reports asynchronously.
   */
  sample(
    offsetX: number,
    offsetY: number,
    allow3d: boolean,
    surfaceDepth: number,
    onSample: (s: Sample | null) => void,
  ): void {
    if (!this.nv.volumes.length) return onSample(null);

    const dpr = this.nvi.uiData.dpr ?? window.devicePixelRatio ?? 1;
    const x = offsetX * dpr;
    const y = offsetY * dpr;

    // canvasPos2frac returns a negative x when the point is not over a 2D tile.
    const frac = this.nv.canvasPos2frac([x, y]);
    if (frac[0] >= 0) return onSample(this.read(frac));

    if (!allow3d || this.nvi.inRenderTile(x, y) < 0) return onSample(null);
    this.pickDepth(x, y, surfaceDepth, onSample);
  }

  private pickDepth(
    x: number,
    y: number,
    surfaceDepth: number,
    onSample: (s: Sample | null) => void,
  ): void {
    if (this.pickQueued) return;
    this.pickQueued = true;

    requestAnimationFrame(() => {
      this.pickQueued = false;
      this.nvi.mousePos = [x, y];
      this.nvi.uiData.mouseDepthPicker = true;

      // NiiVue draws the 3D crosshair into the framebuffer *after* the picking
      // shader and *before* readPixels. Since the crosshair is drawn wherever
      // crosshairPos is, it parks under the pointer and the pick reads its
      // colour instead of the encoded position: the alpha is no longer
      // VOLUME_ID, so NiiVue takes the mesh branch, decodes that colour as a
      // depth and unprojects it to a point inside the head. Worse, it feeds
      // itself — once the crosshair follows the pointer it shadows every later
      // pick. Hide it for the pick draw, then restore and redraw for display.
      const showCrosshair = this.nv.opts.show3Dcrosshair;
      this.nv.opts.show3Dcrosshair = false;

      // On a hit NiiVue assigns a fresh crosshairPos; on a miss it leaves the
      // property untouched. Comparing the reference across the draw is therefore
      // an exact hit test — without it a miss re-reports the previous voxel.
      const before = this.nv.scene.crosshairPos;
      this.nvi.drawScene();
      const after = this.nv.scene.crosshairPos;

      this.nv.opts.show3Dcrosshair = showCrosshair;
      if (showCrosshair) this.nvi.drawScene();

      if (after === before) return onSample(null);

      const sample = this.readSurface(after, surfaceDepth);
      const id = this.nvi.selectedObjectId;
      if (sample) {
        sample.source = id === this.nvi.VOLUME_ID ? `volume (${id})` : `id ${id}`;
      }
      onSample(sample);
    });
  }

  /** Exact read at a fractional coordinate, used for the 2D slice tiles. */
  private read(frac: Frac): Sample | null {
    const vox = this.nv.frac2vox(frac);
    return this.at(vox[0], vox[1], vox[2]);
  }

  /**
   * Read for the 3D render tile, which needs a short inward search.
   *
   * The picking shader marches in steps of ~1.9 voxels and stops at the first
   * sample whose colormap alpha exceeds 0.01, then encodes that position into
   * 8 bits per axis. So the reported point is the faint outer rim where the
   * tissue merely becomes visible, give or take a voxel or two of quantisation
   * — hover a bright gyral crown and you can easily read the air in front of it.
   *
   * Searching a few voxels along the view ray and keeping the strongest value
   * recovers the tissue actually being displayed. The search is one-dimensional
   * on purpose: widening it into a box would blur across the sulci, which are
   * the features this whole thing exists to make audible.
   */
  private readSurface(frac: Frac, surfaceDepth: number): Sample | null {
    const vox = this.nv.frac2vox(frac);
    const surface = this.at(vox[0], vox[1], vox[2]);
    if (surfaceDepth < 1 || !surface) return surface;

    const step = this.voxelRay();
    let best = surface;

    for (let t = 1; t <= surfaceDepth; t++) {
      const deeper = this.at(
        Math.round(vox[0] + step[0] * t),
        Math.round(vox[1] + step[1] * t),
        Math.round(vox[2] + step[2] * t),
      );
      if (deeper && deeper.raw > best.raw) best = deeper;
    }
    return best;
  }

  /** The current near-to-far view direction, as a one-voxel step. */
  private voxelRay(): [number, number, number] {
    const { renderAzimuth, renderElevation } = this.nv.scene;
    const dir = this.nvi.calculateRayDirection(renderAzimuth, renderElevation);
    const dims = this.nv.volumes[0].hdr?.dims;
    if (!dims) return [0, 0, 0];
    return rayToVoxelStep(dir, [dims[1], dims[2], dims[3]]);
  }

  /** Intensity and world position of one voxel. */
  private at(i: number, j: number, k: number): Sample | null {
    const raw = this.nv.volumes[0].getValue(i, j, k);
    if (raw === null || raw === undefined || Number.isNaN(raw)) return null;

    const mm = this.nv.frac2mm(this.nv.vox2frac([i, j, k]));
    return { raw, mm: [mm[0], mm[1], mm[2]].map((n) => n.toFixed(0)).join(", ") };
  }
}
