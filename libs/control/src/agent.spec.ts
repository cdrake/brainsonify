import { describe, expect, it } from "vitest";

import {
  PLANE_ANGLES,
  cameraForPlane,
  clipNormal,
  depthThrough,
  matchRegion,
  regionMentions,
  resolvePlane,
  viewDirection,
} from "./agent";

const close = (v: readonly number[], expected: readonly number[]) => {
  for (let i = 0; i < 3; i++) expect(v[i]).toBeCloseTo(expected[i], 6);
};

describe("clipNormal", () => {
  it("gives each named plane the normal NiiVue gives it", () => {
    const expected: Record<string, [number, number, number]> = {
      posterior: [0, 1, 0],
      anterior: [0, -1, 0],
      left: [1, 0, 0],
      right: [-1, 0, 0],
      superior: [0, 0, -1],
      inferior: [0, 0, 1],
    };
    for (const { name, azimuth, elevation } of PLANE_ANGLES) {
      close(clipNormal(azimuth, elevation), expected[name]);
    }
  });
});

describe("viewDirection", () => {
  it("has the default camera on the left, in front and above, looking in", () => {
    const [x, y, z] = viewDirection(110, 10);
    expect(x).toBeGreaterThan(0.9);
    expect(y).toBeLessThan(0);
    expect(z).toBeLessThan(0);
  });

  it("looks along each axis from the expected side", () => {
    close(viewDirection(90, 0), [1, 0, 0]);
    close(viewDirection(270, 0), [-1, 0, 0]);
    close(viewDirection(0, 0), [0, 1, 0]);
    close(viewDirection(180, 0), [0, -1, 0]);
    close(viewDirection(0, 90), [0, 0, -1]);
    close(viewDirection(0, -90), [0, 0, 1]);
  });
});

describe("cameraForPlane", () => {
  it("faces each named side from the side it takes off", () => {
    const expected: Record<string, [number, number]> = {
      left: [90, 0],
      right: [270, 0],
      posterior: [0, 0],
      anterior: [180, 0],
      inferior: [0, -90],
      superior: [0, 90],
    };
    for (const { name, azimuth, elevation } of PLANE_ANGLES) {
      expect(cameraForPlane(azimuth, elevation), name).toEqual({
        azimuth: expected[name][0],
        elevation: expected[name][1],
      });
    }
  });

  it("looks straight along the plane's normal at any angles", () => {
    for (let azimuth = 0; azimuth < 360; azimuth += 15) {
      for (let elevation = -90; elevation <= 90; elevation += 15) {
        const camera = cameraForPlane(azimuth, elevation);
        close(viewDirection(camera.azimuth, camera.elevation), clipNormal(azimuth, elevation));
      }
    }
  });

  it("keeps the azimuth within a turn", () => {
    expect(cameraForPlane(0, 0).azimuth).toBe(0);
    expect(cameraForPlane(450, 0).azimuth).toBe(270);
    expect(cameraForPlane(-90, 0).azimuth).toBe(90);
  });
});

describe("depthThrough", () => {
  it("is zero for a point on the middle plane and matches the sweep's coronal rule", () => {
    expect(depthThrough([0, 1, 0], [0.5, 0.5, 0.5])).toBe(0);
    // sweep.ts: a coronal plane through the crosshair has depth 0.5 - crosshair[1].
    expect(depthThrough([0, 1, 0], [0.2, 0.7, 0.9])).toBeCloseTo(0.5 - 0.7, 9);
  });

  it("puts the plane through the point for any normal", () => {
    const n = clipNormal(37, 12);
    const p = [0.31, 0.62, 0.48];
    const depth = depthThrough(n, p);
    const onPlane = n[0] * (p[0] - 0.5) + n[1] * (p[1] - 0.5) + n[2] * (p[2] - 0.5) + depth;
    expect(onPlane).toBeCloseTo(0, 9);
  });
});

describe("resolvePlane", () => {
  it("knows the six sides and their anatomical aliases", () => {
    expect(resolvePlane("Left", null)?.azimuth).toBe(270);
    expect(resolvePlane("coronal", null)?.name).toBe("posterior");
    expect(resolvePlane("axial", null)?.name).toBe("superior");
    expect(resolvePlane("sagittal", null)?.name).toBe("left");
    expect(resolvePlane("diagonal", null)).toBeNull();
  });

  it("keeps the current plane when one is cut and falls back to coronal when none is", () => {
    expect(resolvePlane(undefined, [0.2, 90, 0])?.name).toBe("right");
    expect(resolvePlane("current", [0.1, 45, 10])).toEqual({ name: "current", azimuth: 45, elevation: 10 });
    expect(resolvePlane("current", [2, 0, 0])?.name).toBe("posterior");
    expect(resolvePlane(undefined, null)?.name).toBe("posterior");
  });
});

describe("matchRegion", () => {
  const regions = [
    { label: "Precentral_L", name: "left precentral gyrus", aliases: ["Left precentral"] },
    { label: "Precentral_R", name: "right precentral gyrus", aliases: ["Right precentral"] },
    { label: "Frontal_Inf_Tri_L", name: "left inferior frontal gyrus, triangular part", aliases: ["Left frontal inferior triangular"] },
    { label: "Insula_L", name: "left insula" },
  ];

  it("matches a label or a spoken name exactly, whatever the case or separator", () => {
    expect(matchRegion(regions, "precentral_r")?.label).toBe("Precentral_R");
    expect(matchRegion(regions, "Left Precentral Gyrus")?.label).toBe("Precentral_L");
    expect(matchRegion(regions, "Precentral L")?.label).toBe("Precentral_L");
    expect(matchRegion(regions, "left insula")?.label).toBe("Insula_L");
  });

  it("still answers to the name a region had before the table", () => {
    expect(matchRegion(regions, "left frontal inferior triangular")?.label).toBe("Frontal_Inf_Tri_L");
    expect(matchRegion(regions, "right precentral")?.label).toBe("Precentral_R");
  });

  it("falls back to the first region containing the words", () => {
    expect(matchRegion(regions, "triangular")?.label).toBe("Frontal_Inf_Tri_L");
    expect(matchRegion(regions, "precentral")?.label).toBe("Precentral_L");
    expect(matchRegion(regions, "frontal inferior")?.label).toBe("Frontal_Inf_Tri_L");
  });

  it("finds nothing for an empty or unknown query", () => {
    expect(matchRegion(regions, "")).toBeNull();
    expect(matchRegion(regions, "hippocampus")).toBeNull();
  });
});

describe("regionMentions", () => {
  const region = { label: "Frontal_Inf_Tri_L", name: "left inferior frontal gyrus, triangular part", aliases: ["Left frontal inferior triangular"] };

  it("looks through the label, the name and the aliases alike", () => {
    expect(regionMentions(region, "frontal_inf")).toBe(true);
    expect(regionMentions(region, "Triangular Part")).toBe(true);
    expect(regionMentions(region, "frontal inferior")).toBe(true);
    expect(regionMentions(region, "temporal")).toBe(false);
  });
});
