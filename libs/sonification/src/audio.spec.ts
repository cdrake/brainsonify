import { describe, expect, it } from "vitest";

import { heightGain, tapBand, tapLength } from "./audio";

/**
 * The tap envelope, which is the part of the audio engine that can be reasoned
 * about without a Web Audio context. Everything else in `audio.ts` is node
 * graph wiring and belongs in a browser.
 */
describe("tapLength", () => {
  it("gives a slow tap the full envelope", () => {
    // A whole second between taps: nothing is competing for the room.
    expect(tapLength(1)).toBeCloseTo(0.031, 6);
  });

  it("always leaves silence between taps, however fast they come", () => {
    for (const rate of [1, 5, 14, 22, 40, 66, 120]) {
      const period = 1 / rate;
      expect(tapLength(period)).toBeLessThan(period);
    }
  });

  it("shortens the decay rather than the attack, so a fast tap still strikes", () => {
    const fast = tapLength(1 / 66);
    expect(fast).toBeGreaterThan(0.001);
    expect(fast).toBeLessThan(0.031);
  });

  it("never grows past the full envelope, however long the gap", () => {
    expect(tapLength(10)).toBeCloseTo(0.031, 6);
  });

  it("falls back to the full envelope for a nonsense period", () => {
    expect(tapLength(0)).toBeCloseTo(0.031, 6);
    expect(tapLength(-1)).toBeCloseTo(0.031, 6);
  });
});

describe("tapBand", () => {
  it("leaves a centered tap on the neutral band", () => {
    expect(tapBand(0)).toBe(1800);
  });

  it("spends an octave either way, so the ends are a factor of four apart", () => {
    expect(tapBand(1)).toBe(3600);
    expect(tapBand(-1)).toBe(900);
    expect(tapBand(1) / tapBand(-1)).toBe(4);
  });

  it("is geometric, so equal steps of position are equal ratios of color", () => {
    // Half way forward is half an octave up, not half the frequency span.
    expect(tapBand(0.5)).toBeCloseTo(1800 * Math.SQRT2, 6);
    expect(tapBand(0.5) / tapBand(0)).toBeCloseTo(tapBand(0) / tapBand(-0.5), 6);
  });

  it("stays above the pitch channel at its dullest", () => {
    // The tone tops out at 1760 Hz on the shipped defaults; the taps have to
    // remain a separate object even at the posterior extreme.
    expect(tapBand(-1)).toBeGreaterThan(600);
  });

  it("clamps, so a miscalculated position cannot put the band out of hearing", () => {
    expect(tapBand(9)).toBe(3600);
    expect(tapBand(-9)).toBe(900);
  });
});

describe("heightGain", () => {
  it("maps low, center, and high positions through a bounded window", () => {
    expect(heightGain(-1)).toBeCloseTo(0.6);
    expect(heightGain(0)).toBeCloseTo(0.8);
    expect(heightGain(1)).toBe(1);
  });

  it("clamps positions and never boosts above the master volume", () => {
    expect(heightGain(-9)).toBeCloseTo(0.6);
    expect(heightGain(9)).toBe(1);
  });
});
