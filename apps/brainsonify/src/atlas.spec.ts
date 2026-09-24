import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DWELL_MS, RegionCallout, labelStats, nearestVoxel, regionName, speakable, spokenName } from "./atlas";
import { SPOKEN_NAMES } from "niivue-mcp";
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

describe("spokenName", () => {
  it("says a region in anatomical English, side first", () => {
    expect(spokenName("Precentral_L")).toBe("left precentral gyrus");
    expect(spokenName("Frontal_Inf_Tri_L")).toBe("left inferior frontal gyrus, triangular part");
    expect(spokenName("Temporal_Sup_R")).toBe("right superior temporal gyrus");
    expect(spokenName("Heschl_L")).toBe("left Heschl's gyrus");
    expect(spokenName("Cingulum_Ant_R")).toBe("right anterior cingulate gyrus");
    expect(spokenName("Cerebelum_Crus1_L")).toBe("left cerebellum, crus 1");
    expect(spokenName("Vermis_4_5")).toBe("vermis, lobules 4 and 5");
  });

  it("falls back to the generated name for a label the table does not have", () => {
    expect(spokenName("Frontal_Inf_Oper_L")).toBe(SPOKEN_NAMES.Frontal_Inf_Oper_L);
    expect(spokenName("Frontal_New_Oper_L")).toBe("Left frontal new opercular");
    expect(spokenName("Made_Up")).toBe(speakable("Made_Up"));
  });
});

describe("regionName", () => {
  const names = ["Air", "left precentral gyrus", "right precentral gyrus"];

  it("names a labelled value", () => {
    expect(regionName(names, 1)).toBe("left precentral gyrus");
    expect(regionName(names, 2)).toBe("right precentral gyrus");
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

describe("labelStats", () => {
  // A 3 x 2 x 2 grid, x fastest: label 1 fills the front slab (z = 0), label
  // 2 is one voxel at (2, 1, 1), and label 3 is absent.
  const img = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 2];
  const dims: [number, number, number] = [3, 2, 2];

  it("counts and averages each label's voxels, skipping background", () => {
    expect(labelStats(img, dims)).toEqual([
      { value: 1, voxels: 6, centroid: [1, 0.5, 0] },
      { value: 2, voxels: 1, centroid: [2, 1, 1] },
    ]);
  });

  it("finds the nearest voxel of a label, or nothing for a label with none", () => {
    expect(nearestVoxel(img, dims, 1, [2, 1, 1])).toEqual([2, 1, 0]);
    expect(nearestVoxel(img, dims, 2, [0, 0, 0])).toEqual([2, 1, 1]);
    expect(nearestVoxel(img, dims, 3, [0, 0, 0])).toBeNull();
  });
});
