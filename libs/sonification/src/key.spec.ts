import { describe, expect, it } from "vitest";

import { BONE_TAPS, DEFAULT_TAPS } from "./rhythm";
import { soundKey, sweep, type KeyChannels, type KeySettings } from "./key";

const SETTINGS: KeySettings = {
  mode: "tone",
  lowHz: 110,
  octaves: 4,
  width: 0.85,
  taps: BONE_TAPS,
};

const NONE: KeyChannels = { stereo: false, taps: "off", depth: false, height: false };
const ALL: KeyChannels = { stereo: true, taps: "bone", depth: true, height: true };

describe("sweep", () => {
  it("rests at each end before and after moving", () => {
    expect(sweep(0)).toBe(0);
    expect(sweep(0.1)).toBe(0);
    expect(sweep(0.9)).toBe(1);
    expect(sweep(1)).toBe(1);
  });

  it("passes through the middle at the middle", () => {
    expect(sweep(0.5)).toBeCloseTo(0.5, 6);
  });

  it("clamps a step that overran its time", () => {
    expect(sweep(1.5)).toBe(1);
    expect(sweep(-1)).toBe(0);
  });
});

describe("soundKey", () => {
  it("is one step for a condition with nothing but pitch", () => {
    const steps = soundKey(NONE, SETTINGS);
    expect(steps).toHaveLength(1);
    expect(steps[0].label).toMatch(/^Pitch is intensity/);
  });

  it("adds one step per channel, in the order the study added them", () => {
    const labels = soundKey(ALL, SETTINGS).map((step) => step.label.split(".")[0]);
    expect(labels).toEqual([
      "Pitch is intensity",
      "Left and right is anatomical",
      "Tapping is bone",
      "Tap brightness is front and back",
      "Loudness is height",
    ]);
  });

  it("names brightness rather than pitch when the voice is unpitched", () => {
    const [first] = soundKey(NONE, { ...SETTINGS, mode: "texture" });
    expect(first.label).toMatch(/^Brightness is intensity/);
  });

  it("says what is driving the taps", () => {
    const opacity = soundKey({ ...NONE, taps: "opacity" }, { ...SETTINGS, taps: DEFAULT_TAPS });
    expect(opacity[1].label).toMatch(/^Tapping is opacity/);
    const bone = soundKey({ ...NONE, taps: "bone" }, SETTINGS);
    expect(bone[1].label).toMatch(/^Tapping is bone/);
  });

  it("has nothing to say about depth without a tap layer for it to ride", () => {
    const steps = soundKey({ ...NONE, depth: true }, SETTINGS);
    expect(steps).toHaveLength(1);
  });

  it("sweeps pitch across the whole configured range", () => {
    const [pitch] = soundKey(NONE, SETTINGS);
    expect(pitch.voice(0).freq).toBeCloseTo(110, 6);
    expect(pitch.voice(1).freq).toBeCloseTo(110 * 16, 6);
    expect(pitch.tone).toBe(true);
  });

  it("pans from hard left to hard right, scaled by the stereo width", () => {
    const [, stereo] = soundKey({ ...NONE, stereo: true }, SETTINGS);
    expect(stereo.voice(0).pan).toBeCloseTo(-0.85, 6);
    expect(stereo.voice(1).pan).toBeCloseTo(0.85, 6);
    expect(stereo.voice(0.5).pan).toBeCloseTo(0, 6);
  });

  it("runs the taps from the condition's slowest rate to its fastest, with the tone off", () => {
    const [, taps] = soundKey({ ...NONE, taps: "bone" }, SETTINGS);
    expect(taps.tone).toBe(false);
    expect(taps.voice(0).taps).toBeCloseTo(BONE_TAPS.slowest, 6);
    expect(taps.voice(1).taps).toBeCloseTo(BONE_TAPS.fastest, 6);
  });

  it("moves only depth during the depth step, at a countable rate", () => {
    const [, , depth] = soundKey({ ...NONE, taps: "bone", depth: true }, SETTINGS);
    expect(depth.tone).toBe(false);
    expect(depth.voice(0).depth).toBe(-1);
    expect(depth.voice(1).depth).toBe(1);
    expect(depth.voice(0).taps).toBe(depth.voice(1).taps);
    expect(depth.voice(0).taps).toBeGreaterThan(0);
    expect(depth.voice(0).taps).toBeLessThan(20);
  });

  it("moves only height during the height step", () => {
    const [, height] = soundKey({ ...NONE, height: true }, SETTINGS);
    expect(height.tone).toBe(true);
    expect(height.voice(0).height).toBe(-1);
    expect(height.voice(1).height).toBe(1);
    expect(height.voice(0).pan).toBe(0);
    expect(height.voice(0).taps).toBe(0);
  });

  it("keeps the gate open and holds every other channel neutral in every step", () => {
    for (const step of soundKey(ALL, SETTINGS)) {
      expect(step.seconds).toBeGreaterThan(0);
      for (const t of [0, 0.5, 1]) {
        const voice = step.voice(t);
        expect(voice.open).toBe(true);
        expect(voice.freq).toBeGreaterThan(0);
        // At most one of the positional cues is away from neutral.
        const moving = [voice.pan, voice.depth, voice.height].filter((v) => v !== 0);
        expect(moving.length).toBeLessThanOrEqual(1);
      }
    }
  });
});
