import { describe, expect, it } from "vitest";

import { DEFAULT_RANGE, boundsFromFrac, frequency, normalise, pan } from "./mapping";

describe("normalise", () => {
  const range = { lo: 0, hi: 200 };

  it("maps the window onto 0..1", () => {
    expect(normalise(0, range)).toBe(0);
    expect(normalise(100, range)).toBe(0.5);
    expect(normalise(200, range)).toBe(1);
  });

  it("clamps values outside the window", () => {
    expect(normalise(-50, range)).toBe(0);
    expect(normalise(999, range)).toBe(1);
  });

  it("collapses to silence-adjacent zero for a degenerate window", () => {
    expect(normalise(42, { lo: 5, hi: 5 })).toBe(0);
    expect(normalise(42, { lo: 10, hi: 1 })).toBe(0);
  });

  it("has a sane default window", () => {
    expect(normalise(0.5, DEFAULT_RANGE)).toBe(0.5);
  });
});

describe("frequency", () => {
  it("returns the floor at zero intensity", () => {
    expect(frequency(0, 110, 4)).toBe(110);
  });

  it("spans exactly the requested number of octaves", () => {
    expect(frequency(1, 110, 4)).toBeCloseTo(110 * 16);
    expect(frequency(0.5, 110, 2)).toBeCloseTo(220);
  });

  it("is monotonic in intensity", () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map((n) => frequency(n, 110, 4));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1]!);
    }
  });
});

/** MNI152-ish: left-right runs -90..90 mm, so the midline sits at 0. */
const LR = { lo: -90, hi: 90 };

describe("pan", () => {
  it("puts the midline dead centre and the extremes hard over", () => {
    expect(pan(0, LR, 1)).toBeCloseTo(0);
    expect(pan(-90, LR, 1)).toBeCloseTo(-1);
    expect(pan(90, LR, 1)).toBeCloseTo(1);
  });

  it("keeps the left hemisphere in the left ear", () => {
    expect(pan(-45, LR, 1)).toBeCloseTo(-0.5);
    expect(pan(45, LR, 1)).toBeCloseTo(0.5);
  });

  it("scales the field by width, collapsing to mono at zero", () => {
    expect(pan(-90, LR, 0.5)).toBeCloseTo(-0.5);
    expect(pan(-90, LR, 0)).toBeCloseTo(0);
  });

  it("clamps rather than running past the speakers", () => {
    expect(pan(-500, LR, 1)).toBe(-1);
    expect(pan(500, LR, 1)).toBe(1);
    expect(pan(-90, LR, 4)).toBeCloseTo(-1);
  });

  it("stays centred for a degenerate extent instead of pinning hard left", () => {
    // normalise returns 0 for an empty span; naively reusing it here would
    // map every voxel to -1 and silently mute one channel.
    expect(pan(10, { lo: 5, hi: 5 }, 1)).toBe(0);
  });
});

describe("boundsFromFrac", () => {
  it("recovers the box of an axis-aligned volume", () => {
    const b = boundsFromFrac((f) => [f[0] * 180 - 90, f[1] * 216 - 126, f[2] * 180 - 72]);
    expect(b.x).toEqual({ lo: -90, hi: 90 });
    expect(b.y).toEqual({ lo: -126, hi: 90 });
    expect(b.z).toEqual({ lo: -72, hi: 108 });
  });

  it("brackets an oblique volume, where one edge is not enough", () => {
    // A 45-degree rotation in the XY plane: the extreme X corners are the ones
    // that vary in *both* fractional axes, which a two-corner probe misses.
    const b = boundsFromFrac((f) => [f[0] - f[1], f[0] + f[1], f[2]]);
    expect(b.x).toEqual({ lo: -1, hi: 1 });
    expect(b.y).toEqual({ lo: 0, hi: 2 });
  });
});
