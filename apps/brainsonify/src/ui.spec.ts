import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { EXPERIMENTS, experimentHref } from "./experiments";
import { Controls, ExperimentNav, Readout, applyChannels, formatPan } from "./ui";

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
    readout.show(137.4, 0.5, 440, [10, -20, 30], -0.62, "volume (254)");

    expect(document.getElementById("rVal")?.textContent).toBe("137.4");
    expect(document.getElementById("rNorm")?.textContent).toBe("0.500");
    expect(document.getElementById("rFreq")?.textContent).toBe("440 Hz");
    expect(document.getElementById("rMM")?.textContent).toBe("10, -20, 30");
    expect(document.getElementById("rPan")?.textContent).toBe("L 62%");
    expect(document.getElementById("rSrc")?.textContent).toBe("volume (254)");
    expect((document.getElementById("barFill") as HTMLElement).style.width).toBe("50%");
  });

  it("clears back to placeholders and empties the bar", () => {
    const readout = new Readout();
    readout.show(137.4, 0.5, 440);
    readout.clear();

    expect(document.getElementById("rVal")?.textContent).toBe("—");
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
  const stereoRows = () => [...document.querySelectorAll<HTMLElement>('[data-requires="stereo"]')];

  it("marks up at least one row per channel, or the flag controls nothing", () => {
    expect(stereoRows().length).toBeGreaterThan(0);
  });

  it("hides the rows a condition does not use, and restores them when it does", () => {
    applyChannels({ stereo: false });
    expect(stereoRows().every((row) => row.hidden)).toBe(true);

    applyChannels({ stereo: true });
    expect(stereoRows().some((row) => row.hidden)).toBe(false);
  });

  it("leaves rows belonging to no channel alone", () => {
    applyChannels({ stereo: false });
    expect(document.getElementById("rFreq")?.closest("div")?.hidden).toBe(false);
  });
});
