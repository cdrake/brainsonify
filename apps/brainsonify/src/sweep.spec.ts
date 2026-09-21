import { describe, expect, it } from "vitest";

import { advance, cutFace, facePoint, type Vec3 } from "./sweep";

const close = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 6);
};

const CENTER: Vec3 = [0.5, 0.5, 0.5];

describe("cutFace", () => {
  // NiiVue's POSTERIOR preset, [0, 0, 0] as depth/azimuth/elevation, is the
  // plane normal [0, 1, 0] at depth 0: the medial coronal cut 09 opens on.
  it("reads a coronal cut left to right and top to bottom", () => {
    const face = cutFace([0, 1, 0, 0], CENTER);
    close(face.origin, [0.5, 0.5, 0.5]);
    close(face.across, [1, 0, 0]);
    close(face.down, [0, 0, -1]);
  });

  it("follows the plane as the wheel nudges its depth", () => {
    // dot(n, p - 0.5) + depth = 0, so a positive depth moves the face to a
    // smaller y: further back on a coronal cut.
    const face = cutFace([0, 1, 0, 0.2], CENTER);
    close(face.origin, [0.5, 0.3, 0.5]);
  });

  it("reads a sagittal cut front-wards, since it has no left-right of its own", () => {
    const face = cutFace([1, 0, 0, 0], CENTER);
    close(face.across, [0, 1, 0]);
    close(face.down, [0, 0, -1]);
  });

  it("reads an axial cut with the front at the top, since it has no up or down", () => {
    const face = cutFace([0, 0, 1, 0], CENTER);
    close(face.across, [1, 0, 0]);
    close(face.down, [0, -1, 0]);
  });

  it("does not care which way the normal points", () => {
    const front = cutFace([0, 1, 0, 0], CENTER);
    const back = cutFace([0, -1, 0, 0], CENTER);
    close(front.across, back.across);
    close(front.down, back.down);
    close(front.origin, back.origin);
  });

  it("falls back to the coronal plane through the crosshair when no plane is set", () => {
    // NiiVue's own "off" is a depth past 1, which its shader treats as no plane.
    const face = cutFace([0, 1, 0, 2], [0.5, 0.7, 0.5]);
    close(face.origin, [0.5, 0.7, 0.5]);
    close(face.across, [1, 0, 0]);
    close(face.down, [0, 0, -1]);
    close(cutFace([], [0.5, 0.7, 0.5]).origin, [0.5, 0.7, 0.5]);
  });
});

describe("facePoint", () => {
  it("spans the whole face on an axis-aligned cut", () => {
    const face = cutFace([0, 1, 0, 0], CENTER);
    close(facePoint(face, 0, 0), [0, 0.5, 1]);
    close(facePoint(face, 1, 1), [1, 0.5, 0]);
    close(facePoint(face, 0.5, 0.5), [0.5, 0.5, 0.5]);
  });

  it("starts at the top left, the way a page is read", () => {
    const face = cutFace([0, 1, 0, 0], CENTER);
    const start = facePoint(face, 0, 0);
    expect(start[0]).toBe(0);
    expect(start[2]).toBe(1);
  });
});

describe("advance", () => {
  it("moves along the line at the given pace", () => {
    close(Object.values(advance({ across: 0, line: 0 }, 1, 4, 0.25)), [0.25, 0]);
  });

  it("steps down a line when it runs off the right edge", () => {
    close(Object.values(advance({ across: 0.9, line: 0 }, 0.8, 4, 0.25)), [0.1, 0.25]);
  });

  it("wraps from the bottom line back to the top", () => {
    const bottom = advance({ across: 0.9, line: 1 }, 0.8, 4, 0.25);
    expect(bottom.line).toBe(0);
  });

  it("reaches the bottom line itself before wrapping", () => {
    let raster = { across: 0, line: 0 };
    const lines: number[] = [];
    for (let i = 0; i < 5; i++) {
      raster = advance(raster, 4, 4, 0.25);
      lines.push(raster.line);
    }
    close(lines, [0.25, 0.5, 0.75, 1, 0]);
  });

  it("leaves the input alone", () => {
    const before = { across: 0.5, line: 0.5 };
    advance(before, 1, 1, 0.1);
    expect(before).toEqual({ across: 0.5, line: 0.5 });
  });
});
