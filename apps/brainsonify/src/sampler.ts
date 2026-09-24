import type { NiiVue } from "@niivue/niivue";

import { mm2vox, viewRay, vox2mm, voxelValue } from "./geometry";
import type { Vec3 } from "./geometry";

export interface Sample {
  /** Raw voxel intensity under the pointer. */
  raw: number;
  /** World coordinate of the voxel that produced `raw`, in millimeters. */
  mm: [number, number, number];
  /** Index of that voxel, for maps computed in voxel space rather than mm. */
  vox: [number, number, number];
  /** Which pick branch produced this, for diagnosing the 3D path. */
  source?: string;
}

/**
 * Converts a view ray in world millimeters into a one-voxel step along it.
 *
 * A millimeter is not a voxel: with anisotropic voxels an equal move in mm
 * covers more voxels along the finely sampled axis. Taking the ray through the
 * volume's own affine first, then normalising, gives a direction whose length
 * is one voxel regardless of which way it points.
 */
export function voxelRayStep(matRAS: ArrayLike<number>, at: ArrayLike<number>, dirMm: ArrayLike<number>): Vec3 {
  const from = mm2vox(matRAS, at);
  const to = mm2vox(matRAS, [at[0] + dirMm[0], at[1] + dirMm[1], at[2] + dirMm[2]]);
  if (!from || !to) return [0, 0, 0];
  const step: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...step);
  if (!(length > 0)) return [0, 0, 0];
  return [step[0] / length, step[1] / length, step[2] / length];
}

/**
 * Reads the voxel under the pointer without moving the crosshair.
 *
 * 2D tiles are a direct lookup. The 3D render tile has no such mapping, so we
 * ask NiiVue to depth-pick and read the position it resolves; that costs a
 * render pass, hence one pick per animation frame at most.
 */
export class VoxelSampler {
  private pickQueued = false;

  constructor(private nv: NiiVue) {}

  /**
   * @param clientX the pointer's position, in the page's CSS pixels.
   * @param surfaceDepth how many voxels to search inward from a 3D render hit.
   *   Ignored on 2D tiles, which are always an exact single-voxel read.
   * @param onSample called with the voxel under the pointer, or null when the
   *   pointer is off every tile. The 3D path reports asynchronously.
   */
  sample(
    clientX: number,
    clientY: number,
    allow3d: boolean,
    surfaceDepth: number,
    onSample: (s: Sample | null) => void,
  ): void {
    if (!this.nv.volumes.length) return onSample(null);

    // hitTest and friends take canvas backing-store pixels, not CSS pixels.
    // NiiVue's own conversion, rather than a multiply by the pixel ratio:
    // `devicePixelRatio` reads -1 while NiiVue is left to choose it.
    const at = this.nv.clientToCanvas(clientX, clientY);
    if (!at) return onSample(null);
    const [x, y] = at;

    const hit = this.nv.hitTest(x, y);
    if (!hit) return onSample(null);
    if (!hit.isRender) {
      const mm = this.nv.canvasToMM(x, y);
      return onSample(mm ? this.read(mm) : null);
    }

    if (!allow3d) return onSample(null);
    this.pickDepth(x, y, hit.tileIndex, surfaceDepth, onSample);
  }

  /** Reads the voxel at a fractional scene position, used by accessible nudges. */
  sampleFraction(frac: ArrayLike<number>, onSample: (s: Sample | null) => void): void {
    if (!this.nv.volumes.length) return onSample(null);
    onSample(this.read(this.nv.model.scene2mm(frac)));
  }

  /**
   * Depth-picks the render tile at a canvas pixel.
   *
   * `depthPick` lives on the view backend rather than the controller, but it
   * is the call NiiVue's own double-click makes to move the crosshair onto the
   * render, and it runs a dedicated pick pass: unlike 0.69, the 3D crosshair
   * is not in that pass, so nothing needs hiding for the pick to read the
   * volume rather than the crosshair's own color.
   */
  private pickDepth(
    x: number,
    y: number,
    tileIndex: number,
    surfaceDepth: number,
    onSample: (s: Sample | null) => void,
  ): void {
    if (this.pickQueued) return;
    this.pickQueued = true;

    requestAnimationFrame(async () => {
      let mm: [number, number, number] | null = null;
      try {
        mm = (await this.nv.view?.depthPick(x, y)) ?? null;
      } finally {
        this.pickQueued = false;
      }
      // The pick pass renders into the canvas; NiiVue redraws after its own
      // pick for the same reason, so the frame on screen is the scene again.
      this.nv.drawScene();
      if (!mm) return onSample(null);

      const sample = this.readSurface(mm, x, y, tileIndex, surfaceDepth);
      if (sample) sample.source = "3D render";
      onSample(sample);
    });
  }

  /** Exact read at a world position, used for the 2D slice tiles. */
  private read(mm: ArrayLike<number>): Sample | null {
    const matRAS = this.nv.volumes[0].matRAS;
    const vox = matRAS && mm2vox(matRAS, mm);
    if (!vox) return null;
    return this.at(Math.round(vox[0]), Math.round(vox[1]), Math.round(vox[2]));
  }

  /**
   * Read for the 3D render tile, which needs a short inward search.
   *
   * The pick reports the first point along the ray where the volume becomes
   * visible — the faint outer rim where the tissue merely starts to show, so
   * hover a bright gyral crown and you can easily read the air in front of it.
   *
   * Searching a few voxels along the view ray and keeping the strongest value
   * recovers the tissue actually being displayed. The search is one-dimensional
   * on purpose: widening it into a box would blur across the sulci, which are
   * the features this whole thing exists to make audible.
   */
  private readSurface(
    mm: [number, number, number],
    x: number,
    y: number,
    tileIndex: number,
    surfaceDepth: number,
  ): Sample | null {
    const surface = this.read(mm);
    if (surfaceDepth < 1 || !surface) return surface;

    const step = this.voxelRay(mm, x, y, tileIndex);
    const [i, j, k] = surface.vox;
    let best = surface;

    for (let t = 1; t <= surfaceDepth; t++) {
      const deeper = this.at(
        Math.round(i + step[0] * t),
        Math.round(j + step[1] * t),
        Math.round(k + step[2] * t),
      );
      if (deeper && deeper.raw > best.raw) best = deeper;
    }
    return best;
  }

  /** The near-to-far view ray through this pixel, as a one-voxel step. */
  private voxelRay(mm: Vec3, x: number, y: number, tileIndex: number): Vec3 {
    const tile = this.nv.getScreenTiles()[tileIndex];
    const matRAS = this.nv.volumes[0].matRAS;
    if (!tile?.mvpMatrix || !tile.leftTopWidthHeight || !matRAS) return [0, 0, 0];
    const dir = viewRay(x, y, tile.mvpMatrix, tile.leftTopWidthHeight);
    return dir ? voxelRayStep(matRAS, mm, dir) : [0, 0, 0];
  }

  /** Intensity and world position of one voxel. */
  private at(i: number, j: number, k: number): Sample | null {
    const vol = this.nv.volumes[0];
    const raw = voxelValue(vol, i, j, k);
    if (raw === null || !vol.matRAS) return null;

    const mm = vox2mm(vol.matRAS, [i, j, k]);
    return { raw, mm, vox: [i, j, k] };
  }
}
