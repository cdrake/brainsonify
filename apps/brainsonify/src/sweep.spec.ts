import { describe, expect, it } from "vitest";

import { START, advance, cutFace, facePoint, lineStep, oriented, type Vec3 } from "./sweep";

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

  it("reads columns from the top left corner downward when the direction is down", () => {
    const face = cutFace([0, 1, 0, 0], CENTER);
    close(facePoint(face, 0, 0, "down"), [0, 0.5, 1]);
    close(facePoint(face, 1, 0, "down"), [0, 0.5, 0]);
    close(facePoint(face, 0, 1, "down"), [1, 0.5, 1]);
  });
});

describe("oriented", () => {
  it("leaves the page alone when reading to the right", () => {
    expect(oriented(0.2, 0.7, "right")).toEqual([0.2, 0.7]);
  });

  it("runs each line the cardinal way: right, left, down, up", () => {
    expect(oriented(1, 0, "right")).toEqual([1, 0]);
    expect(oriented(1, 0, "left")).toEqual([0, 0]);
    expect(oriented(1, 0, "down")).toEqual([0, 1]);
    expect(oriented(1, 0, "up")).toEqual([0, 0]);
  });

  it("covers the face in the same order whichever way a line reads", () => {
    // Rows step top down, columns step left to right, in both directions.
    expect(oriented(0, 1, "right")[1]).toBe(1);
    expect(oriented(0, 1, "left")[1]).toBe(1);
    expect(oriented(0, 1, "down")[0]).toBe(1);
    expect(oriented(0, 1, "up")[0]).toBe(1);
  });

  it("keeps every line the full width of the face", () => {
    for (const direction of ["right", "left", "down", "up"] as const) {
      const [x0, y0] = oriented(0, 0.5, direction);
      const [x1, y1] = oriented(1, 0.5, direction);
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(1, 9);
    }
  });
});

describe("advance", () => {
  const pace = { lineSeconds: 4, lines: 5, restSeconds: 0, direction: "right" as const };

  it("spaces the lines so the top and bottom of the face are both read", () => {
    expect(lineStep(pace)).toBe(0.25);
    expect(lineStep({ ...pace, lines: 1 })).toBe(1);
  });

  it("moves along the line at the given pace", () => {
    const next = advance(START, 1, pace);
    expect(next).toEqual({ across: 0.25, line: 0, rest: 0 });
  });

  it("steps down a line when it runs off the right edge", () => {
    const next = advance({ across: 0.9, line: 0, rest: 0 }, 0.8, pace);
    expect(next.across).toBeCloseTo(0.1, 9);
    expect(next.line).toBe(0.25);
  });

  it("wraps from the bottom line back to the top", () => {
    expect(advance({ across: 0.9, line: 1, rest: 0 }, 0.8, pace).line).toBe(0);
  });

  it("reaches the bottom line itself before wrapping", () => {
    let raster = START;
    const lines: number[] = [];
    for (let i = 0; i < 5; i++) {
      raster = advance(raster, 4, pace);
      lines.push(raster.line);
    }
    close(lines, [0.25, 0.5, 0.75, 1, 0]);
  });

  it("rests between lines when the pace asks for it, and starts the next from its left edge", () => {
    const resting = { ...pace, restSeconds: 0.5 };
    const atEnd = advance({ across: 0.9, line: 0, rest: 0 }, 0.8, resting);
    expect(atEnd).toEqual({ across: 0, line: 0.25, rest: 0.5 });
    const stillResting = advance(atEnd, 0.2, resting);
    expect(stillResting).toEqual({ across: 0, line: 0.25, rest: 0.3 });
    // The rest ends partway through a frame; the remainder moves the line.
    const moving = advance(stillResting, 0.7, resting);
    expect(moving.rest).toBe(0);
    expect(moving.across).toBeCloseTo(0.1, 9);
  });

  it("leaves the input alone", () => {
    const before = { across: 0.5, line: 0.5, rest: 0 };
    advance(before, 1, pace);
    expect(before).toEqual({ across: 0.5, line: 0.5, rest: 0 });
  });
});
