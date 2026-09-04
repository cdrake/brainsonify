import { describe, expect, it } from "vitest";

import type { Niivue } from "@niivue/niivue";

import { VoxelSampler, rayToVoxelStep } from "./sampler";
import type { Sample } from "./sampler";

/**
 * MNI152-ish dimensions: deliberately unequal, since the whole point of the
 * conversion is that an equal fractional step is not an equal voxel step.
 */
const DIMS = [197, 233, 189] as const;

describe("rayToVoxelStep", () => {
  it("returns a one-voxel step whichever way it points", () => {
    const directions = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.3, -0.5, 0.81],
      [-1, -1, -1],
    ];

    for (const dir of directions) {
      const step = rayToVoxelStep(dir, DIMS);
      expect(Math.hypot(...step)).toBeCloseTo(1);
    }
  });

  it("preserves direction along an axis", () => {
    expect(rayToVoxelStep([1, 0, 0], DIMS)).toEqual([1, 0, 0]);

    const back = rayToVoxelStep([0, 0, -1], DIMS);
    expect(back[0]).toBe(0);
    expect(back[1]).toBe(0);
    expect(back[2]).toBe(-1);
  });

  it("weights axes by voxel count, not by fractional extent", () => {
    // Equal fractional components cover more voxels along the longer axis, so
    // the voxel-space step must lean towards it.
    const step = rayToVoxelStep([1, 1, 0], DIMS);
    expect(Math.abs(step[1])).toBeGreaterThan(Math.abs(step[0]));
    expect(step[1] / step[0]).toBeCloseTo(DIMS[1] / DIMS[0]);
  });

  it("degrades to no movement rather than NaN for a zero ray", () => {
    expect(rayToVoxelStep([0, 0, 0], DIMS)).toEqual([0, 0, 0]);
  });
});

/**
 * A NiiVue stand-in that records whether the 3D crosshair was visible at the
 * moment of each draw. Only the members VoxelSampler touches are implemented.
 */
function fakeNiivue() {
  const crosshairVisibleDuringDraws: boolean[] = [];
  let crosshairPos = new Float32Array([0.1, 0.1, 0.1]);

  const nv = {
    volumes: [
      {
        getValue: () => 42,
        hdr: { dims: [3, 197, 233, 189] },
      },
    ],
    opts: { show3Dcrosshair: true },
    scene: {
      renderAzimuth: 110,
      renderElevation: 10,
      get crosshairPos() {
        return crosshairPos;
      },
    },
    uiData: { dpr: 1, mouseDepthPicker: false },
    mousePos: [0, 0],
    selectedObjectId: -1,
    VOLUME_ID: 254,
    canvasPos2frac: () => [-1, -1, -1],
    inRenderTile: () => 0,
    frac2vox: () => [10, 10, 10],
    vox2frac: () => [0.5, 0.5, 0.5],
    frac2mm: () => [1, 2, 3],
    calculateRayDirection: () => [0, 0, 1],
    drawScene() {
      crosshairVisibleDuringDraws.push(nv.opts.show3Dcrosshair);
      if (nv.uiData.mouseDepthPicker) {
        // Stand in for depthPicker: a volume hit assigns a fresh position.
        nv.uiData.mouseDepthPicker = false;
        nv.selectedObjectId = nv.VOLUME_ID;
        crosshairPos = new Float32Array([0.4, 0.4, 0.4]);
      }
    },
  };

  return { nv, crosshairVisibleDuringDraws };
}

describe("VoxelSampler 3D picking", () => {
  it("hides the 3D crosshair while picking and restores it afterwards", async () => {
    const { nv, crosshairVisibleDuringDraws } = fakeNiivue();
    const sampler = new VoxelSampler(nv as unknown as Niivue);

    const sample = await new Promise<Sample | null>((resolve) => {
      sampler.sample(5, 5, true, 0, resolve);
    });

    // NiiVue paints the crosshair over the picking-shader output before it
    // reads the pixel back, so a visible crosshair during the pick draw means
    // the pick reads crosshair color and lands somewhere under the surface.
    expect(crosshairVisibleDuringDraws[0]).toBe(false);
    expect(nv.opts.show3Dcrosshair).toBe(true);
    // The display must not be left without its crosshair.
    expect(crosshairVisibleDuringDraws).toEqual([false, true]);
    expect(sample?.source).toBe("volume (254)");
  });
});
