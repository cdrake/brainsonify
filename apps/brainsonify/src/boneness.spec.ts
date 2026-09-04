import { describe, expect, it } from "vitest";

import {
  type Dims,
  type Grid,
  bonenessAt,
  computeBoneness,
  convolve1d,
  densestVoxel,
  depthFromSurface,
  downsample2,
  eigSym3,
  gaussianKernel,
  sheetness,
  reach,
  type Zoom,
} from "./boneness";

const index = (i: number, j: number, k: number, [nx, ny]: Dims) => i + nx * (j + ny * k);

/**
 * A cube of bright tissue with a dark sheet buried `at` voxels below one face:
 * a toy skull.
 *
 * The sheet is inset on the other two axes so that bright tissue wraps its
 * edges, which is the arrangement that matters. Cortical bone is darker than
 * the air threshold, so it is never in the head mask on its own — it counts as
 * head because it is *enclosed*. A sheet that reached the outside would be
 * flooded as air and sit at depth zero, which is not how a skull under a scalp
 * behaves.
 */
function slabPhantom(n = 40, at = 6, thickness = 3): Grid {
  const dims: Dims = [n, n, n];
  const data = new Float32Array(n * n * n);
  const lo = 4;
  const hi = n - 4;

  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const inside = i > lo && i < hi && j > lo && j < hi && k > lo && k < hi;
        if (!inside) continue;
        const depth = i - lo;
        const sealed = j > lo + 3 && j < hi - 3 && k > lo + 3 && k < hi - 3;
        const bone = sealed && depth >= at && depth < at + thickness;
        data[index(i, j, k, dims)] = bone ? 0.05 : 0.9;
      }
    }
  }
  return { data, dims, zoom: [1, 1, 1] };
}

describe("gaussianKernel", () => {
  it("normalises the smoothing kernel to preserve intensity", () => {
    const k = gaussianKernel(1.5, 0);
    expect([...k].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("gives derivative kernels no DC response", () => {
    // A second-derivative kernel with a residual sum would report curvature on
    // a flat region — a sheet everywhere, which is worse than none.
    for (const order of [1, 2] as const) {
      const k = gaussianKernel(1.5, order);
      expect([...k].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
    }
  });

  it("gives the second derivative the sign of the curvature it measures", () => {
    // Negative at the center: a bright ridge curves downward away from its peak.
    const k = gaussianKernel(1.5, 2);
    expect(k[(k.length - 1) / 2]).toBeLessThan(0);
  });
});

describe("convolve1d", () => {
  it("leaves the volume alone under an identity kernel", () => {
    const dims: Dims = [4, 3, 2];
    const src = Float32Array.from({ length: 24 }, (_, i) => i);
    const dst = new Float32Array(24);
    convolve1d(src, dst, dims, 1, Float32Array.from([0, 1, 0]));
    expect([...dst]).toEqual([...src]);
  });

  it("clamps at the border rather than wrapping to the far side", () => {
    const dims: Dims = [3, 1, 1];
    const src = Float32Array.from([9, 0, 0]);
    const dst = new Float32Array(3);
    convolve1d(src, dst, dims, 0, Float32Array.from([1, 0, 0]));
    // Reading before index 0 repeats index 0; it must not pick up index 2.
    expect(dst[0]).toBe(9);
  });
});

describe("eigSym3", () => {
  it("recovers the eigenvalues of a diagonal matrix", () => {
    const e = eigSym3(3, 0, 0, -7, 0, 0.0001);
    expect(e.map((v) => Math.round(v * 100) / 100)).toEqual([0, 3, -7]);
  });

  it("orders by magnitude, so l3 is always the dominant curvature", () => {
    const [l1, l2, l3] = eigSym3(1, 0.2, 0.1, -5, 0.3, 2);
    expect(Math.abs(l1)).toBeLessThanOrEqual(Math.abs(l2));
    expect(Math.abs(l2)).toBeLessThanOrEqual(Math.abs(l3));
  });

  it("keeps the sign that tells a dark sheet from a bright one", () => {
    const dark = eigSym3(6, 0, 0, 0, 0, 0);
    const bright = eigSym3(-6, 0, 0, 0, 0, 0);
    expect(dark[2]).toBeGreaterThan(0);
    expect(bright[2]).toBeLessThan(0);
  });
});

describe("sheetness", () => {
  it("responds to a dark sheet and ignores the bulk around it", () => {
    const phantom = slabPhantom();
    const r = sheetness(phantom, 1.5);
    const at = (i: number) => r[index(i, 20, 20, phantom.dims)];

    // Depth 6-8 below the face at i=4, so the sheet center is i=11.
    expect(at(11)).toBeGreaterThan(0.4);
    expect(at(20)).toBeLessThan(0.05); // solid interior
  });

  it("stays quiet on a uniform block, which curves nowhere", () => {
    const dims: Dims = [24, 24, 24];
    const grid: Grid = { data: new Float32Array(24 ** 3).fill(0.5), dims, zoom: [1, 1, 1] };
    const r = sheetness(grid, 1.5);
    expect(Math.max(...r)).toBeLessThan(1e-3);
  });

  it("prefers a plate to a blob of the same darkness", () => {
    const plate = sheetness(slabPhantom(), 1.5);

    const n = 40;
    const dims: Dims = [n, n, n];
    const data = new Float32Array(n ** 3).fill(0.9);
    for (let k = 0; k < n; k++)
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++)
          if (Math.hypot(i - 20, j - 20, k - 20) < 2.5) data[index(i, j, k, dims)] = 0.05;
    const blob = sheetness({ data, dims, zoom: [1, 1, 1] }, 1.5);

    expect(Math.max(...plate)).toBeGreaterThan(blob[index(20, 20, 20, dims)] * 2);
  });
});

describe("depthFromSurface", () => {
  it("measures millimeters in from the outside, not voxels", () => {
    const n = 24;
    const dims: Dims = [n, n, n];
    const data = new Float32Array(n ** 3);
    for (let k = 4; k < 20; k++)
      for (let j = 4; j < 20; j++)
        for (let i = 4; i < 20; i++) data[index(i, j, k, dims)] = 1;

    const depth = depthFromSurface({ data, dims, zoom: [2, 2, 2] }, 0.08);
    // The block is 16 voxels across at 2mm, so its center is 16mm from the face.
    expect(depth[index(12, 12, 12, dims)]).toBeCloseTo(16, 0);
    expect(depth[index(4, 12, 12, dims)]).toBeCloseTo(2, 0);
    expect(depth[index(0, 0, 0, dims)]).toBe(0);
  });

  it("fills interior air so a sinus does not read as a second scalp", () => {
    const n = 24;
    const dims: Dims = [n, n, n];
    const data = new Float32Array(n ** 3);
    for (let k = 2; k < 22; k++)
      for (let j = 2; j < 22; j++)
        for (let i = 2; i < 22; i++) data[index(i, j, k, dims)] = 1;
    // A pocket of air in the middle, sealed off from the outside.
    for (let k = 10; k < 14; k++)
      for (let j = 10; j < 14; j++)
        for (let i = 10; i < 14; i++) data[index(i, j, k, dims)] = 0;

    const depth = depthFromSurface({ data, dims, zoom: [1, 1, 1] }, 0.08);
    expect(depth[index(12, 12, 12, dims)]).toBeGreaterThan(8);
  });
});

describe("downsample2", () => {
  it("halves each axis and doubles the millimeters per voxel", () => {
    const grid: Grid = {
      data: new Float32Array(8 * 6 * 4).fill(1),
      dims: [8, 6, 4],
      zoom: [0.9, 0.9, 0.9],
    };
    const half = downsample2(grid);
    expect(half.dims).toEqual([4, 3, 2]);
    expect(half.zoom).toEqual([1.8, 1.8, 1.8]);
    expect(half.data.every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
  });

  it("keeps the odd trailing slice rather than dropping it", () => {
    const grid: Grid = { data: new Float32Array(3 * 3 * 3).fill(2), dims: [3, 3, 3], zoom: [1, 1, 1] };
    expect(downsample2(grid).dims).toEqual([2, 2, 2]);
  });
});

describe("computeBoneness", () => {
  it("marks the buried sheet and nothing else", () => {
    const phantom = slabPhantom(48, 8, 4);
    const map = computeBoneness(phantom, { scalesMm: [2, 3], shellMm: [1, 20] });

    const onSheet = bonenessAt(map, 14, 24, 24); // inside the dark slab
    const inBulk = bonenessAt(map, 30, 24, 24); // solid tissue behind it
    expect(onSheet).toBeGreaterThan(0.3);
    expect(inBulk).toBeLessThan(onSheet / 3);
  });

  it("drops sheets that lie deeper than the skull ever does", () => {
    const phantom = slabPhantom(48, 8, 4);
    const shallow = computeBoneness(phantom, { scalesMm: [2, 3], shellMm: [1, 20] });
    const deepOnly = computeBoneness(phantom, { scalesMm: [2, 3], shellMm: [25, 40] });

    expect(bonenessAt(shallow, 14, 24, 24)).toBeGreaterThan(0.3);
    expect(bonenessAt(deepOnly, 14, 24, 24)).toBe(0);
  });
});

describe("bonenessAt", () => {
  const map = {
    data: new Float32Array(8),
    dims: [2, 2, 2] as Dims,
    factor: 2,
    zoom: [2, 2, 2] as Zoom,
  };

  it("reads the coarse entry covering a full-resolution voxel", () => {
    map.data[index(1, 0, 0, map.dims)] = 0.7;
    expect(bonenessAt(map, 2, 0, 0)).toBeCloseTo(0.7, 6);
    expect(bonenessAt(map, 3, 1, 1)).toBe(0);
  });

  it("clamps rather than reading off the end of the map", () => {
    expect(() => bonenessAt(map, 9999, -5, 9999)).not.toThrow();
    expect(Number.isFinite(bonenessAt(map, 9999, -5, 9999))).toBe(true);
  });
});

describe("reach", () => {
  const dims: Dims = [9, 9, 9];
  const zoom: Zoom = [2, 2, 2];
  const seeded = (value = 1) => {
    const data = new Float32Array(dims[0] * dims[1] * dims[2]);
    data[index(4, 4, 4, dims)] = value;
    return { data, dims, factor: 2, zoom };
  };

  it("lets a voxel report bone that is only a short distance away", () => {
    const map = seeded();
    // 4mm at 2mm per entry reaches two entries in every direction.
    const wide = reach(map, 4);

    expect(wide.data[index(4, 4, 4, dims)]).toBe(1);
    expect(wide.data[index(6, 4, 4, dims)]).toBe(1);
    expect(wide.data[index(4, 6, 6, dims)]).toBe(1);
    expect(wide.data[index(7, 4, 4, dims)]).toBe(0);
  });

  it("leaves the source map alone, so the reach can be changed freely", () => {
    const map = seeded();
    reach(map, 6);

    expect(map.data[index(6, 4, 4, dims)]).toBe(0);
    expect(map.data[index(4, 4, 4, dims)]).toBe(1);
  });

  it("reads a single entry at zero reach, which is the honest measurement", () => {
    const map = seeded();
    const point = reach(map, 0);

    expect(point.data[index(4, 4, 4, dims)]).toBe(1);
    expect(point.data[index(5, 4, 4, dims)]).toBe(0);
  });

  it("reports the strongest bone in range, not the nearest", () => {
    const map = seeded(0.3);
    map.data[index(6, 4, 4, dims)] = 0.9;

    expect(reach(map, 4).data[index(5, 4, 4, dims)]).toBeCloseTo(0.9, 6);
  });

  it("never lowers a value: a probe can only find more bone, never less", () => {
    const map = seeded();
    map.data[index(1, 1, 1, dims)] = 0.5;
    const wide = reach(map, 4);

    for (let i = 0; i < map.data.length; i++) {
      expect(wide.data[i]).toBeGreaterThanOrEqual(map.data[i]);
    }
  });

  it("keeps the geometry it was handed", () => {
    const wide = reach(seeded(), 4);
    expect(wide.dims).toEqual(dims);
    expect(wide.factor).toBe(2);
    expect(wide.zoom).toEqual(zoom);
  });
});

describe("densestVoxel", () => {
  const dims: Dims = [9, 9, 9];
  const zoom: Zoom = [2, 2, 2];
  const seeded = () => {
    const data = new Float32Array(dims[0] * dims[1] * dims[2]);
    data[index(4, 4, 4, dims)] = 0.3;
    data[index(6, 4, 4, dims)] = 0.9;
    return { data, dims, factor: 2, zoom };
  };

  it("points at the voxel the reported value actually came from, not the queried one", () => {
    const wide = reach(seeded(), 4);
    // Coarse (5,4,4) reports the stronger neighbor at coarse (6,4,4), which
    // is full-resolution (12,8,8) under factor 2.
    expect(densestVoxel(wide, 10, 8, 8)).toEqual([12, 8, 8]);
  });

  it("points a weaker cell at its stronger neighbor rather than itself", () => {
    const wide = reach(seeded(), 4);
    // Full-resolution (8,8,8) is coarse (4,4,4), the 0.3 seed itself, whose
    // own reach also finds the 0.9 neighbor.
    expect(densestVoxel(wide, 8, 8, 8)).toEqual([12, 8, 8]);
  });

  it("returns null where nothing in reach clears zero, rather than the queried voxel", () => {
    const wide = reach(seeded(), 4);
    expect(densestVoxel(wide, 0, 0, 0)).toBeNull();
  });

  it("points a zero-reach map at itself, the one honest measurement", () => {
    const point = reach(seeded(), 0);
    expect(densestVoxel(point, 8, 8, 8)).toEqual([8, 8, 8]);
  });

  it("returns null for a map that has not been through reach() yet", () => {
    expect(densestVoxel(seeded(), 8, 8, 8)).toBeNull();
  });
});
