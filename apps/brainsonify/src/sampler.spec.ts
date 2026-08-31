import { describe, expect, it } from "vitest";

import { rayToVoxelStep } from "./sampler";

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
