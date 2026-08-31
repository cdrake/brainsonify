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
  inRenderTile(x: number, y: number): number;
  drawScene(): void;
}

export interface Sample {
  /** Raw voxel intensity under the pointer. */
  raw: number;
  /** World coordinate, formatted "x, y, z" in millimetres. */
  mm: string;
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
   * @param onSample called with the voxel under the pointer, or null when the
   *   pointer is off every tile. The 3D path reports asynchronously.
   */
  sample(offsetX: number, offsetY: number, allow3d: boolean, onSample: (s: Sample | null) => void): void {
    if (!this.nv.volumes.length) return onSample(null);

    const dpr = this.nvi.uiData.dpr ?? window.devicePixelRatio ?? 1;
    const x = offsetX * dpr;
    const y = offsetY * dpr;

    // canvasPos2frac returns a negative x when the point is not over a 2D tile.
    const frac = this.nv.canvasPos2frac([x, y]);
    if (frac[0] >= 0) return onSample(this.read(frac));

    if (!allow3d || this.nvi.inRenderTile(x, y) < 0) return onSample(null);
    this.pickDepth(x, y, onSample);
  }

  private pickDepth(x: number, y: number, onSample: (s: Sample | null) => void): void {
    if (this.pickQueued) return;
    this.pickQueued = true;

    requestAnimationFrame(() => {
      this.pickQueued = false;
      this.nvi.mousePos = [x, y];
      this.nvi.uiData.mouseDepthPicker = true;
      this.nvi.drawScene();

      const pos = this.nv.scene.crosshairPos;
      if (pos && pos[0] >= 0) onSample(this.read(pos));
    });
  }

  private read(frac: Frac): Sample | null {
    const vox = this.nv.frac2vox(frac);
    const raw = this.nv.volumes[0].getValue(vox[0], vox[1], vox[2]);
    if (raw === null || raw === undefined || Number.isNaN(raw)) return null;

    const mm = this.nv.frac2mm(frac);
    return { raw, mm: [mm[0], mm[1], mm[2]].map((n) => n.toFixed(0)).join(", ") };
  }
}
