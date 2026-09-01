import { describe, expect, it } from "vitest";

import {
  DEFAULT_TAPS,
  opacityFromLut,
  peakAlpha,
  relativeOpacity,
  tapRate,
} from "./rhythm";

/** A NiiVue colormap LUT: 256 RGBA quads, alpha ramping to `peak`. */
function ramp(peak: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) lut[i * 4 + 3] = Math.round((i / 255) * peak);
  return lut;
}

describe("opacityFromLut", () => {
  it("reads the alpha channel, not the colour", () => {
    // NiiVue's "gray" ramps alpha to 128, so full intensity is half opaque —
    // the value has to come off the LUT rather than being assumed from norm.
    const lut = ramp(128);
    expect(opacityFromLut(lut, 1)).toBeCloseTo(128 / 255, 3);
    expect(opacityFromLut(lut, 0)).toBe(0);
    expect(opacityFromLut(lut, 0.5)).toBeCloseTo(64 / 255, 2);
  });

  it("clamps an intensity that falls outside the display window", () => {
    const lut = ramp(255);
    expect(opacityFromLut(lut, 2)).toBe(1);
    expect(opacityFromLut(lut, -3)).toBe(0);
  });

  it("reports fully transparent when the LUT is not a 256-entry RGBA table", () => {
    // We cannot say what is being drawn, so we do not claim anything is.
    expect(opacityFromLut(new Uint8ClampedArray(0), 1)).toBe(0);
    expect(opacityFromLut(new Uint8ClampedArray(64), 1)).toBe(0);
  });

  it("follows a colormap whose alpha does not track intensity", () => {
    // The whole reason opacity is its own channel: an alpha ramp that plateaus
    // makes two different intensities equally visible, and pitch alone cannot
    // say so.
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) lut[i * 4 + 3] = i < 128 ? 0 : 255;

    expect(opacityFromLut(lut, 0.4)).toBe(0);
    expect(opacityFromLut(lut, 0.6)).toBe(1);
    expect(opacityFromLut(lut, 1)).toBe(1);
  });
});

describe("peakAlpha", () => {
  it("finds the most a colormap ever shows", () => {
    expect(peakAlpha(ramp(128))).toBeCloseTo(128 / 255, 3);
    expect(peakAlpha(ramp(255))).toBe(1);
  });

  it("reports nothing rather than guessing from a malformed table", () => {
    expect(peakAlpha(new Uint8ClampedArray(64))).toBe(0);
  });
});

describe("relativeOpacity", () => {
  it("spends the whole scale whatever alpha the palette happens to use", () => {
    // gray tops out at 128/255. Its most opaque voxel is still the most opaque
    // thing on screen, and should tap at the top of the range, not halfway.
    const lut = ramp(128);
    const peak = peakAlpha(lut);

    expect(relativeOpacity(opacityFromLut(lut, 1), peak)).toBeCloseTo(1, 3);
    expect(tapRate(relativeOpacity(opacityFromLut(lut, 1), peak))).toBeCloseTo(
      DEFAULT_TAPS.fastest,
      2,
    );
  });

  it("keeps the shape of a ramp that stops tracking intensity", () => {
    // A colormap that plateaus still plateaus after scaling: the flat top is
    // the thing worth hearing, so scaling must not straighten it out.
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) lut[i * 4 + 3] = Math.min(120, i);
    const peak = peakAlpha(lut);

    expect(relativeOpacity(opacityFromLut(lut, 0.6), peak)).toBe(1);
    expect(relativeOpacity(opacityFromLut(lut, 1), peak)).toBe(1);
    expect(relativeOpacity(opacityFromLut(lut, 0.25), peak)).toBeLessThan(1);
  });

  it("stays silent rather than dividing by a colormap that shows nothing", () => {
    expect(relativeOpacity(0.4, 0)).toBe(0);
    expect(Number.isFinite(relativeOpacity(0.4, 0))).toBe(true);
  });
});

describe("tapRate", () => {
  it("spans the range, transparent slow to opaque fast", () => {
    expect(tapRate(0)).toBeCloseTo(DEFAULT_TAPS.slowest, 5);
    expect(tapRate(1)).toBeCloseTo(DEFAULT_TAPS.fastest, 5);
  });

  it("rises with opacity, since bone should rattle and air should tick", () => {
    const rates = [0, 0.25, 0.5, 0.75, 1].map((o) => tapRate(o));
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });

  it("spaces rates geometrically, so equal steps are equal ratios", () => {
    // Tempo is heard as a ratio; a linear ramp would crowd every audible
    // difference into the transparent end of the scale.
    const [a, b, c] = [tapRate(0.25), tapRate(0.5), tapRate(0.75)];
    expect(b / a).toBeCloseTo(c / b, 5);
  });

  it("stays below the rate at which taps fuse into a pitch", () => {
    // Past roughly 20/s a click train is heard as a buzz with a pitch of its
    // own, which would put this channel back on top of the intensity one.
    expect(tapRate(1)).toBeLessThan(20);
  });

  it("honours a custom range", () => {
    expect(tapRate(1, { slowest: 2, fastest: 8 })).toBeCloseTo(8, 5);
    expect(tapRate(0.5, { slowest: 2, fastest: 8 })).toBeCloseTo(4, 5);
  });

  it("returns no rhythm rather than NaN for a degenerate range", () => {
    expect(tapRate(1, { slowest: 0, fastest: 0 })).toBe(0);
    expect(tapRate(1, { slowest: -1, fastest: 8 })).toBe(0);
  });
});
