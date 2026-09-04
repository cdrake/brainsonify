import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DWELL_MS, RegionCallout, regionName, speakable } from "./atlas";
import type { Speech } from "./soundkey";

describe("speakable", () => {
  it("puts the side first and spells the abbreviations out", () => {
    expect(speakable("Precentral_L")).toBe("Left precentral");
    expect(speakable("Frontal_Inf_Oper_R")).toBe("Right frontal inferior opercular");
    expect(speakable("Supp_Motor_Area_L")).toBe("Left supplementary motor area");
    expect(speakable("Cingulum_Ant_R")).toBe("Right cingulum anterior");
  });

  it("joins a lobule that spans two numbers with 'and'", () => {
    expect(speakable("Cerebelum_4_5_R")).toBe("Right cerebellum 4 and 5");
    expect(speakable("Vermis_1_2")).toBe("Vermis 1 and 2");
    expect(speakable("Cerebelum_7b_L")).toBe("Left cerebellum 7b");
  });

  it("leaves a name with no side or abbreviation alone, apart from case", () => {
    expect(speakable("Vermis_10")).toBe("Vermis 10");
    expect(speakable("Cerebelum_Crus1_L")).toBe("Left cerebellum crus 1");
    expect(speakable("Insula_R")).toBe("Right insula");
  });
});

describe("regionName", () => {
  const names = ["Air", "Left precentral", "Right precentral"];

  it("names a labelled value", () => {
    expect(regionName(names, 1)).toBe("Left precentral");
    expect(regionName(names, 2)).toBe("Right precentral");
  });

  it("calls zero unlabelled whatever the table says", () => {
    expect(regionName(names, 0)).toBeNull();
  });

  it("has no name for a value outside the table or off the grid", () => {
    expect(regionName(names, 3)).toBeNull();
    expect(regionName(names, -1)).toBeNull();
    expect(regionName(names, 1.5)).toBeNull();
    expect(regionName(names, NaN)).toBeNull();
  });
});

/** Speech that remembers what it was asked to say, and when it was hushed. */
function fakeSpeech(): Speech & { said: string[]; hushed: number } {
  const speech = {
    said: [] as string[],
    hushed: 0,
    say(text: string) {
      speech.said.push(text);
      return Promise.resolve();
    },
    hush() {
      speech.hushed++;
    },
  };
  return speech;
}

describe("RegionCallout", () => {
  let speech: ReturnType<typeof fakeSpeech>;
  let callout: RegionCallout;

  beforeEach(() => {
    vi.useFakeTimers();
    speech = fakeSpeech();
    callout = new RegionCallout(speech);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says a region's name once the pointer has rested in it", () => {
    callout.enter("Left insula");
    vi.advanceTimersByTime(DWELL_MS - 1);
    expect(speech.said).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(speech.said).toEqual(["Left insula"]);
  });

  it("says nothing for a region the pointer only passed through", () => {
    callout.enter("Left insula");
    vi.advanceTimersByTime(DWELL_MS / 2);
    callout.enter("Left putamen");
    vi.advanceTimersByTime(DWELL_MS / 2);
    expect(speech.said).toEqual([]);
    vi.advanceTimersByTime(DWELL_MS / 2);
    expect(speech.said).toEqual(["Left putamen"]);
  });

  it("does not repeat a region the pointer is still in", () => {
    callout.enter("Left insula");
    vi.advanceTimersByTime(DWELL_MS);
    callout.enter("Left insula");
    callout.enter("Left insula");
    vi.advanceTimersByTime(DWELL_MS * 2);
    expect(speech.said).toEqual(["Left insula"]);
  });

  it("announces a region again when the pointer comes back to it", () => {
    callout.enter("Left insula");
    vi.advanceTimersByTime(DWELL_MS);
    callout.enter(null);
    callout.enter("Left insula");
    vi.advanceTimersByTime(DWELL_MS);
    expect(speech.said).toEqual(["Left insula", "Left insula"]);
  });

  it("is silent over unlabelled tissue and after the pointer leaves", () => {
    callout.enter(null);
    vi.advanceTimersByTime(DWELL_MS);
    callout.enter("Left insula");
    callout.leave();
    vi.advanceTimersByTime(DWELL_MS);
    expect(speech.said).toEqual([]);
  });

  it("cuts a name still being said before starting the next", () => {
    callout.enter("Left insula");
    vi.advanceTimersByTime(DWELL_MS);
    callout.enter("Left putamen");
    vi.advanceTimersByTime(DWELL_MS);
    expect(speech.hushed).toBe(2);
    expect(speech.said).toEqual(["Left insula", "Left putamen"]);
  });
});
