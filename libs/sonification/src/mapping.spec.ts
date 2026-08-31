import { describe, expect, it } from "vitest";

import { DEFAULT_RANGE, frequency, normalise } from "./mapping";

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
