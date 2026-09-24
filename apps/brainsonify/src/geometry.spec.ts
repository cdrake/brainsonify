import { describe, expect, it } from "vitest";

import { colormapLut, invert4, mm2vox, projectToCanvas, viewRay, vox2mm, voxelValue } from "./geometry";

/** Row-major, as NiiVue stores `matRAS`: 2mm voxels, origin at (-90, -126, -72). */
const MAT_RAS = [2, 0, 0, -90, 0, 2, 0, -126, 0, 0, 2, -72, 0, 0, 0, 1];
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("vox2mm / mm2vox", () => {
  it("reads the translation off the end of each row", () => {
    expect(vox2mm(MAT_RAS, [0, 0, 0])).toEqual([-90, -126, -72]);
    expect(vox2mm(MAT_RAS, [45, 63, 36])).toEqual([0, 0, 0]);
  });

  it("round-trips", () => {
    const vox = mm2vox(MAT_RAS, vox2mm(MAT_RAS, [10, 20, 30]));
    expect(vox?.[0]).toBeCloseTo(10);
    expect(vox?.[1]).toBeCloseTo(20);
    expect(vox?.[2]).toBeCloseTo(30);
  });

  it("is null for an affine with no inverse", () => {
    expect(mm2vox(new Array(16).fill(0), [0, 0, 0])).toBeNull();
  });
});

describe("voxelValue", () => {
  /** A 2x2x2 volume stored with x reversed, as a LAS scan is: RAS x = 1 - native x. */
  const vol = {
    img: [10, 11, 12, 13, 14, 15, 16, 17],
    hdr: { scl_slope: 2, scl_inter: 1 },
    dimsRAS: [3, 2, 2, 2],
    img2RASstart: [1, 0, 0],
    img2RASstep: [-1, 2, 4],
  };

  it("goes through the RAS index and applies the scaling", () => {
    // RAS (0,0,0) is native (1,0,0): raw 11, scaled 2 * 11 + 1.
    expect(voxelValue(vol, 0, 0, 0)).toBe(23);
    expect(voxelValue(vol, 1, 1, 1)).toBe(2 * 16 + 1);
  });

  it("clamps a point just off the grid to the edge voxel", () => {
    expect(voxelValue(vol, -3, 0, 0)).toBe(voxelValue(vol, 0, 0, 0));
    expect(voxelValue(vol, 0.4, 5, 0)).toBe(voxelValue(vol, 0, 1, 0));
  });

  it("treats a zero or missing slope as one, as NiiVue does", () => {
    expect(voxelValue({ ...vol, hdr: { scl_slope: 0, scl_inter: Number.NaN } }, 0, 0, 0)).toBe(11);
  });

  it("is null for a volume with no voxels", () => {
    expect(voxelValue({ ...vol, img: null }, 0, 0, 0)).toBeNull();
  });
});

describe("colormapLut", () => {
  const gray = { R: [0, 255], G: [0, 255], B: [0, 255], A: [0, 128], I: [0, 255] };

  it("interpolates the control points across 256 entries", () => {
    const lut = colormapLut(gray);
    expect(lut.length).toBe(1024);
    expect(Array.from(lut.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(lut.slice(1020))).toEqual([255, 255, 255, 128]);
    expect(lut[128 * 4]).toBe(128);
  });

  it("is fully opaque where the map gives no alpha", () => {
    const lut = colormapLut({ R: [0, 255], G: [0, 255], B: [0, 255], I: [0, 255] });
    expect(lut[3]).toBe(255);
    expect(lut[1023]).toBe(255);
  });

  it("reverses the colors but not the alpha on inversion", () => {
    const lut = colormapLut(gray, true);
    expect(Array.from(lut.slice(0, 4))).toEqual([255, 255, 255, 0]);
    expect(Array.from(lut.slice(1020))).toEqual([0, 0, 0, 128]);
  });
});

describe("invert4", () => {
  it("inverts", () => {
    const m = [2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 8, 0, 3, 5, 7, 1];
    const inv = invert4(m);
    expect(inv).not.toBeNull();
    // Column-major multiply m * inv.
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += m[k * 4 + row] * (inv as number[])[col * 4 + k];
        expect(sum).toBeCloseTo(row === col ? 1 : 0);
      }
    }
  });
});

describe("projectToCanvas", () => {
  const tile = [100, 50, 200, 100];

  it("maps clip space onto the tile, y down", () => {
    expect(projectToCanvas([0, 0, 0], IDENTITY, tile)).toEqual([200, 100]);
    expect(projectToCanvas([-1, 1, 0], IDENTITY, tile)).toEqual([100, 50]);
    expect(projectToCanvas([1, -1, 0], IDENTITY, tile)).toEqual([300, 150]);
  });

  it("ignores depth, so a point off the slice still lands on the tile", () => {
    expect(projectToCanvas([0, 0, 40], IDENTITY, tile)).toEqual([200, 100]);
  });

  it("is null off the tile or behind the camera", () => {
    expect(projectToCanvas([1.5, 0, 0], IDENTITY, tile)).toBeNull();
    // A perspective matrix whose w is -z: a point at positive z is behind it.
    const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0];
    expect(projectToCanvas([0, 0, 1], perspective, tile)).toBeNull();
    expect(projectToCanvas([0, 0, -1], perspective, tile)).toEqual([200, 100]);
  });
});

describe("viewRay", () => {
  it("points into the screen, near to far", () => {
    expect(viewRay(200, 100, IDENTITY, [100, 50, 200, 100])).toEqual([0, 0, 1]);
  });

  it("follows the pixel under a perspective camera, not just the view axis", () => {
    // A camera at the origin looking down -z, with w = -z.
    const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0];
    const centre = viewRay(200, 100, perspective, [100, 50, 200, 100]);
    const right = viewRay(290, 100, perspective, [100, 50, 200, 100]);
    expect(centre?.[0]).toBeCloseTo(0);
    expect(centre?.[2]).toBeCloseTo(-1);
    expect(right?.[0]).toBeGreaterThan(0.1);
  });
});
