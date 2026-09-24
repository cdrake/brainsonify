import { describe, expect, it } from "vitest";

import type { NiiVue } from "@niivue/niivue";

import { VoxelSampler, voxelRayStep } from "./sampler";
import type { Sample } from "./sampler";

/**
 * An affine with deliberately unequal voxel sizes, since the whole point of the
 * conversion is that an equal step in millimeters is not an equal voxel step.
 * Row-major, as NiiVue stores `matRAS`: 1mm in x, 2mm in y, 3mm in z.
 */
const ANISOTROPIC = [1, 0, 0, -90, 0, 2, 0, -126, 0, 0, 3, -72, 0, 0, 0, 1];
const AT = [0, 0, 0];

describe("voxelRayStep", () => {
  it("returns a one-voxel step whichever way it points", () => {
    const directions = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.3, -0.5, 0.81],
      [-1, -1, -1],
    ];

    for (const dir of directions) {
      const step = voxelRayStep(ANISOTROPIC, AT, dir);
      expect(Math.hypot(...step)).toBeCloseTo(1);
    }
  });

  it("preserves direction along an axis", () => {
    const step = voxelRayStep(ANISOTROPIC, AT, [1, 0, 0]);
    expect(step[0]).toBeCloseTo(1);
    expect(step[1]).toBeCloseTo(0);
    expect(step[2]).toBeCloseTo(0);

    const back = voxelRayStep(ANISOTROPIC, AT, [0, 0, -1]);
    expect(back[0]).toBeCloseTo(0);
    expect(back[1]).toBeCloseTo(0);
    expect(back[2]).toBeCloseTo(-1);
  });

  it("weights axes by voxel size, not by millimeters", () => {
    // An equal move in mm crosses more voxels along the finer axis, so the
    // voxel-space step must lean towards it.
    const step = voxelRayStep(ANISOTROPIC, AT, [0, 1, 1]);
    expect(Math.abs(step[1])).toBeGreaterThan(Math.abs(step[2]));
    expect(step[1] / step[2]).toBeCloseTo(3 / 2);
  });

  it("degrades to no movement rather than NaN for a zero ray", () => {
    expect(voxelRayStep(ANISOTROPIC, AT, [0, 0, 0])).toEqual([0, 0, 0]);
  });
});

/** An identity-affine 4x4x4 volume whose voxels hold their own x index. */
function volume() {
  const img = new Float32Array(64).map((_, i) => i % 4);
  return {
    img,
    hdr: { scl_slope: 1, scl_inter: 0 },
    dimsRAS: [3, 4, 4, 4],
    img2RASstart: [0, 0, 0],
    img2RASstep: [1, 4, 16],
    matRAS: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
}

/**
 * A NiiVue stand-in with one render tile. Only the members VoxelSampler
 * touches are implemented; `pick` is what the next depth pick resolves to.
 */
function fakeNiivue(pick: [number, number, number] | null) {
  const calls: string[] = [];
  const nv = {
    volumes: [volume()],
    clientToCanvas: (x: number, y: number) => [x, y],
    hitTest: () => ({ isRender: true, sliceType: 4, normalizedX: 0.5, normalizedY: 0.5, tileIndex: 0 }),
    canvasToMM: () => null,
    getScreenTiles: () => [],
    model: { scene2mm: (frac: ArrayLike<number>) => [frac[0] * 3, frac[1] * 3, frac[2] * 3] },
    view: {
      async depthPick() {
        calls.push("pick");
        return pick;
      },
    },
    drawScene() {
      calls.push("draw");
    },
  };
  return { nv: nv as unknown as NiiVue, calls };
}

function sampleAt(sampler: VoxelSampler): Promise<Sample | null> {
  return new Promise((resolve) => sampler.sample(5, 5, true, 0, resolve));
}

describe("VoxelSampler 3D picking", () => {
  it("reads the voxel the depth pick lands on", async () => {
    const { nv } = fakeNiivue([2, 1, 3]);
    const sample = await sampleAt(new VoxelSampler(nv));

    expect(sample?.vox).toEqual([2, 1, 3]);
    expect(sample?.raw).toBe(2);
    expect(sample?.source).toBe("3D render");
  });

  it("reports nothing for a miss rather than the previous voxel", async () => {
    const { nv } = fakeNiivue(null);
    expect(await sampleAt(new VoxelSampler(nv))).toBeNull();
  });

  it("redraws the scene after the pick pass", async () => {
    // The pick renders into the canvas; the frame left on screen must be the
    // scene again, not the pick's encoded depth.
    const { nv, calls } = fakeNiivue([1, 1, 1]);
    await sampleAt(new VoxelSampler(nv));
    expect(calls).toEqual(["pick", "draw"]);
  });
});

describe("VoxelSampler.sampleFraction", () => {
  it("reads the voxel at a scene fraction", () => {
    const { nv } = fakeNiivue(null);
    let sample: Sample | null = null;
    new VoxelSampler(nv).sampleFraction([1, 0, 0], (s) => (sample = s));
    expect(sample).toMatchObject({ raw: 3, vox: [3, 0, 0], mm: [3, 0, 0] });
  });
});
