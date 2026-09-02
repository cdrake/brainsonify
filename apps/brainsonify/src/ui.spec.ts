import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { EXPERIMENTS, experimentHref, type Channels } from "./experiments";
import {
  Controls,
  ExperimentNav,
  Readout,
  applyChannels,
  formatClip,
  formatDepth,
  formatPan,
  formatTaps,
} from "./ui";

/**
 * The control panel lives in index.html and is reached by id from TypeScript.
 * These tests run against the real markup so that renaming or dropping an
 * element fails here rather than at runtime in front of a user.
 */
const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");

beforeEach(() => {
  document.documentElement.innerHTML = html;
});

describe("Controls", () => {
  it("binds every control in index.html", () => {
    expect(() => new Controls()).not.toThrow();
  });

  it("reads the panel defaults", () => {
    const { values } = new Controls();
    expect(values).toEqual({
      mode: "tone",
      lowHz: 110,
      octaves: 4,
      gate: 0.04,
      volume: 0.4,
      glide: 0.02,
      width: 0.85,
      spread: 1,
      taps: 14,
      rate: 1,
    });
  });

  it("tracks slider changes and updates the printed label", () => {
    const controls = new Controls();
    const slider = document.getElementById("fLo") as HTMLInputElement;

    slider.value = "300";
    slider.dispatchEvent(new Event("input"));

    expect(controls.values.lowHz).toBe(300);
    expect(document.getElementById("fLoV")?.textContent).toBe("300 Hz");
  });

  it("exposes the 3D toggle, which ships enabled", () => {
    expect(new Controls().sonify3d).toBe(true);
  });

  it("exposes the surface search depth and labels it in voxels", () => {
    const controls = new Controls();
    expect(controls.surfaceDepth).toBe(1);

    const slider = document.getElementById("depth") as HTMLInputElement;
    slider.value = "0";
    slider.dispatchEvent(new Event("input"));

    expect(controls.surfaceDepth).toBe(0);
    expect(document.getElementById("depthV")?.textContent).toBe("0 vox");
  });
});

describe("spike", () => {
  it("ships reaching far enough to find the vault from the scalp", () => {
    // The vault sits 5-8mm under the outer scalp on the demo head.
    expect(new Controls().spike).toBeGreaterThanOrEqual(8);
  });

  it("tracks the slider and labels it in millimetres", () => {
    const controls = new Controls();
    const slider = document.getElementById("spike") as HTMLInputElement;

    slider.value = "12";
    slider.dispatchEvent(new Event("input"));

    expect(controls.spike).toBe(12);
    expect(document.getElementById("spikeV")?.textContent).toBe("12 mm");
  });

  it("names the point read rather than printing a zero distance", () => {
    const controls = new Controls();
    const slider = document.getElementById("spike") as HTMLInputElement;

    slider.value = "0";
    slider.dispatchEvent(new Event("input"));

    expect(controls.spike).toBe(0);
    expect(document.getElementById("spikeV")?.textContent).toBe("point");
  });

  it("belongs to the bone channel alone", () => {
    const row = document.getElementById("spike")?.closest("[data-requires]") as HTMLElement;
    applyChannels({ stereo: true, rhythm: true, bone: false, depth: false });
    expect(row.hidden).toBe(true);

    applyChannels({ stereo: true, rhythm: false, bone: true, depth: false });
    expect(row.hidden).toBe(false);
  });
});

describe("taps-only", () => {
  it("ships off, so a condition sounds complete on arrival", () => {
    expect(new Controls().tapsOnly).toBe(false);
  });

  it("tracks the checkbox", () => {
    const controls = new Controls();
    const box = document.getElementById("tapsOnly") as HTMLInputElement;

    box.checked = true;
    box.dispatchEvent(new Event("input"));

    expect(controls.tapsOnly).toBe(true);
  });

  it("belongs to the tapping conditions, so it hides where there is no rhythm", () => {
    const row = document.getElementById("tapsOnly")?.closest("[data-requires]") as HTMLElement;
    expect(row).toBeTruthy();

    applyChannels({ stereo: true, rhythm: false, bone: false, depth: false });
    expect(row.hidden).toBe(true);

    applyChannels({ stereo: true, rhythm: false, bone: true, depth: false });
    expect(row.hidden).toBe(false);
  });
});

describe("depth", () => {
  it("ships at full spread, so the cue is present to be judged", () => {
    expect(new Controls().values.spread).toBe(1);
  });

  it("tracks the slider and names a collapsed field", () => {
    const controls = new Controls();
    const slider = document.getElementById("spread") as HTMLInputElement;

    slider.value = "0";
    slider.dispatchEvent(new Event("input"));

    expect(controls.values.spread).toBe(0);
    expect(document.getElementById("spreadV")?.textContent).toBe("flat");
  });

  it("belongs to the depth channel alone, so earlier conditions never show it", () => {
    const row = document.getElementById("spread")?.closest("[data-requires]") as HTMLElement;

    applyChannels({ stereo: true, rhythm: false, bone: true, depth: false });
    expect(row.hidden).toBe(true);

    applyChannels({ stereo: true, rhythm: false, bone: true, depth: true });
    expect(row.hidden).toBe(false);
  });
});

describe("formatDepth", () => {
  it("names the two ends anatomically", () => {
    expect(formatDepth(-0.4)).toBe("P 40%");
    expect(formatDepth(0.4)).toBe("A 40%");
  });

  it("calls the middle centre rather than a signed zero", () => {
    expect(formatDepth(0)).toBe("centre");
    expect(formatDepth(-0.001)).toBe("centre");
  });
});

describe("rate coefficient", () => {
  it("starts at 1x, leaving each condition's own range as specified", () => {
    expect(new Controls().values.rate).toBe(1);
  });

  it("tracks the slider and prints it as a multiplier", () => {
    const controls = new Controls();
    const slider = document.getElementById("rate") as HTMLInputElement;

    slider.value = "2.5";
    slider.dispatchEvent(new Event("input"));

    expect(controls.values.rate).toBe(2.5);
    expect(document.getElementById("rateV")?.textContent).toBe("2.5\u00d7");
  });

  it("cannot be turned down to silence", () => {
    const slider = document.getElementById("rate") as HTMLInputElement;
    expect(Number(slider.min)).toBeGreaterThan(0);
  });
});

describe("setTaps", () => {
  it("moves the ceiling and the label together", () => {
    const controls = new Controls();
    controls.setTaps(22);

    expect(controls.values.taps).toBe(22);
    expect(document.getElementById("tapsV")?.textContent).toBe("22 /s");
  });

  it("clamps to the slider, so the number never disagrees with the thumb", () => {
    const controls = new Controls();
    const slider = document.getElementById("taps") as HTMLInputElement;

    controls.setTaps(1000);
    expect(controls.values.taps).toBe(Number(slider.max));
  });
});

describe("clip control", () => {
  it("ships with no clipping, so a volume loads whole", () => {
    expect(new Controls().clip).toBe(0);
  });

  it("tracks the slider and labels it as a share of the volume", () => {
    const controls = new Controls();
    const slider = document.getElementById("clip") as HTMLInputElement;

    slider.value = "0.55";
    slider.dispatchEvent(new Event("input"));

    expect(controls.clip).toBe(0.55);
    expect(document.getElementById("clipV")?.textContent).toBe("55%");
  });
});

describe("formatClip", () => {
  it("names the unclipped state rather than printing a zero", () => {
    expect(formatClip(0)).toBe("off");
  });

  it("reports the cut as a percentage", () => {
    expect(formatClip(0.5)).toBe("50%");
    expect(formatClip(1)).toBe("100%");
  });
});

describe("Readout", () => {
  it("renders a sample and drives the intensity bar", () => {
    const readout = new Readout();
    readout.show({
      raw: 137.4,
      norm: 0.5,
      freq: 440,
      mm: [10, -20, 30],
      pan: -0.62,
      opacity: 0.42,
      taps: 7.25,
      source: "volume (254)",
    });

    expect(document.getElementById("rVal")?.textContent).toBe("137.4");
    expect(document.getElementById("rNorm")?.textContent).toBe("0.500");
    expect(document.getElementById("rFreq")?.textContent).toBe("440 Hz");
    expect(document.getElementById("rMM")?.textContent).toBe("10, -20, 30");
    expect(document.getElementById("rPan")?.textContent).toBe("L 62%");
    expect(document.getElementById("rOpacity")?.textContent).toBe("0.42");
    expect(document.getElementById("rTaps")?.textContent).toBe("7.3 /s");
    expect(document.getElementById("rSrc")?.textContent).toBe("volume (254)");
    expect((document.getElementById("barFill") as HTMLElement).style.width).toBe("50%");
  });

  it("clears back to placeholders and empties the bar", () => {
    const readout = new Readout();
    readout.show({ raw: 137.4, norm: 0.5, freq: 440 });
    readout.clear();

    for (const id of ["rVal", "rNorm", "rFreq", "rPan", "rOpacity", "rTaps", "rSrc"]) {
      expect(document.getElementById(id)?.textContent).toBe("—");
    }
    expect((document.getElementById("barFill") as HTMLElement).style.width).toBe("0%");
  });
});

describe("formatPan", () => {
  it("names the side a listener will hear it on", () => {
    expect(formatPan(-1)).toBe("L 100%");
    expect(formatPan(0.4)).toBe("R 40%");
  });

  it("calls dead centre centre rather than a zero-width side", () => {
    expect(formatPan(0)).toBe("centre");
    expect(formatPan(-0.001)).toBe("centre");
  });
});

describe("experiment tap ranges", () => {
  it("gives every tapping condition a range, and none to the ones that do not tap", () => {
    for (const experiment of EXPERIMENTS) {
      const taps = experiment.channels.rhythm || experiment.channels.bone;
      expect(Boolean(experiment.taps)).toBe(taps);
    }
  });

  it("asks for a ceiling the slider can actually reach", () => {
    const slider = document.getElementById("taps") as HTMLInputElement;
    for (const experiment of EXPERIMENTS) {
      if (!experiment.taps) continue;
      expect(experiment.taps.fastest).toBeLessThanOrEqual(Number(slider.max));
      expect(experiment.taps.slowest).toBeGreaterThan(0);
    }
  });
});

describe("ExperimentNav", () => {
  const nav = () => new ExperimentNav(EXPERIMENTS, experimentHref, () => {});
  const links = () =>
    [...document.querySelectorAll<HTMLAnchorElement>("#experiments a")];

  it("offers every condition as a real link", () => {
    nav();

    expect(links().map((a) => a.dataset.experiment)).toEqual(
      EXPERIMENTS.map((experiment) => experiment.id),
    );
    for (const link of links()) expect(link.getAttribute("href")).toMatch(/^\.\/\?experiment=/);
  });

  it("marks the condition a visitor is in, and only that one", () => {
    const [first, second] = EXPERIMENTS;
    const switcher = nav();

    switcher.show(second);
    expect(links().filter((a) => a.hasAttribute("aria-current")).map((a) => a.dataset.experiment))
      .toEqual([second.id]);

    switcher.show(first);
    expect(links().filter((a) => a.hasAttribute("aria-current")).map((a) => a.dataset.experiment))
      .toEqual([first.id]);
  });

  it("announces the condition, since the listener cannot see the panel change", () => {
    const switcher = nav();
    switcher.show(EXPERIMENTS[0]);

    const announcement = document.getElementById("expAnnounce");
    expect(announcement?.getAttribute("role")).toBe("status");
    expect(announcement?.textContent).toContain(EXPERIMENTS[0].name);
    expect(document.getElementById("expSummary")?.textContent).toBe(EXPERIMENTS[0].summary);
  });
});

describe("applyChannels", () => {
  /** Every channel any condition declares — so a new one is covered here too. */
  const names = [
    ...new Set(EXPERIMENTS.flatMap((e) => Object.keys(e.channels))),
  ] as (keyof Channels)[];
  const rowsFor = (channel: string) =>
    [...document.querySelectorAll<HTMLElement>(`[data-requires="${channel}"]`)];
  const all = (on: boolean) =>
    Object.fromEntries(names.map((name) => [name, on])) as unknown as Channels;

  it("marks up at least one row per channel, or the flag controls nothing", () => {
    for (const channel of names) expect(rowsFor(channel).length).toBeGreaterThan(0);
  });

  it("hides the rows a condition does not use, and restores them when it does", () => {
    applyChannels(all(false));
    for (const channel of names) expect(rowsFor(channel).every((row) => row.hidden)).toBe(true);

    applyChannels(all(true));
    for (const channel of names) expect(rowsFor(channel).every((row) => row.hidden)).toBe(false);
  });

  it("hides only the channel that is off", () => {
    applyChannels({ ...all(true), stereo: false });

    expect(rowsFor("stereo").every((row) => row.hidden)).toBe(true);
    expect(rowsFor("rhythm").every((row) => row.hidden)).toBe(false);
  });

  it("shows a row listing several channels when any one of them is on", () => {
    const shared = [...document.querySelectorAll<HTMLElement>('[data-requires~="rhythm"]')].filter(
      (row) => (row.dataset.requires ?? "").split(/\s+/).length > 1,
    );
    expect(shared.length).toBeGreaterThan(0);

    applyChannels({ ...all(false), rhythm: true });
    for (const row of shared) expect(row.hidden).toBe(false);

    applyChannels({ ...all(false), bone: true });
    for (const row of shared) expect(row.hidden).toBe(false);

    applyChannels(all(false));
    for (const row of shared) expect(row.hidden).toBe(true);
  });

  it("leaves rows belonging to no channel alone", () => {
    applyChannels(all(false));
    expect(document.getElementById("rFreq")?.closest("div")?.hidden).toBe(false);
  });
});

describe("formatTaps", () => {
  it("gives the rate the way a listener would count it", () => {
    expect(formatTaps(7.25)).toBe("7.3 /s");
    expect(formatTaps(1.5)).toBe("1.5 /s");
  });

  it("calls a stopped tap silent rather than zero per second", () => {
    expect(formatTaps(0)).toBe("silent");
  });
});
