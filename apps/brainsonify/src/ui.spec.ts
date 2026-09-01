import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { EXPERIMENTS, experimentHref, type Channels } from "./experiments";
import {
  Controls,
  ExperimentNav,
  Readout,
  applyChannels,
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
      volume: 0.25,
      glide: 0.02,
      width: 0.85,
      taps: 14,
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
