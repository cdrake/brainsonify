import { describe, expect, it } from "vitest";

import { LOUDNESS_REF_HZ, aWeighting, loudnessGain } from "./loudness";

describe("aWeighting", () => {
  it("peaks in the band the ear is most sensitive to", () => {
    const mid = aWeighting(2500);
    expect(mid).toBeGreaterThan(aWeighting(110));
    expect(mid).toBeGreaterThan(aWeighting(12000));
  });

  // The published curve adds +2 dB so that 1 kHz reads 0; this is the bare
  // transfer function, so it sits at -2 there. Only ratios are ever used, and
  // a constant offset cancels in a ratio.
  it("matches the standard at 1 kHz, up to the curve's 2 dB offset", () => {
    expect(20 * Math.log10(aWeighting(1000))).toBeCloseTo(-2, 1);
  });

  it("gives a silent frequency no response rather than a NaN", () => {
    expect(aWeighting(0)).toBe(0);
  });
});

describe("loudnessGain", () => {
  it("leaves the reference frequency alone", () => {
    expect(loudnessGain(LOUDNESS_REF_HZ)).toBeCloseTo(1, 6);
  });

  it("attenuates as pitch climbs into the sensitive band", () => {
    const gains = [220, 440, 880, 1760].map((f) => loudnessGain(f));
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]);
  });

  it("pulls the top of the default range down by about 13 dB", () => {
    expect(20 * Math.log10(loudnessGain(1760))).toBeCloseTo(-13, 0);
  });

  it("never exceeds 1, so it cannot cost headroom or clip", () => {
    for (const f of [1, 20, 60, 110, 1000, 20000]) {
      expect(loudnessGain(f)).toBeLessThanOrEqual(1);
    }
  });

  it("flattens below the reference rather than boosting the bottom end", () => {
    expect(loudnessGain(60)).toBe(1);
  });

  it("does nothing at zero strength, and equalises fully at one", () => {
    expect(loudnessGain(1760, LOUDNESS_REF_HZ, 0)).toBe(1);
    const full = loudnessGain(1760, LOUDNESS_REF_HZ, 1);
    expect(full).toBeCloseTo(aWeighting(LOUDNESS_REF_HZ) / aWeighting(1760), 6);
  });
});
