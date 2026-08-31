import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { Controls, Readout } from "./ui";

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
});

describe("Readout", () => {
  it("renders a sample and drives the intensity bar", () => {
    const readout = new Readout();
    readout.show(137.4, 0.5, 440, "10, -20, 30");

    expect(document.getElementById("rVal")?.textContent).toBe("137.4");
    expect(document.getElementById("rNorm")?.textContent).toBe("0.500");
    expect(document.getElementById("rFreq")?.textContent).toBe("440 Hz");
    expect(document.getElementById("rMM")?.textContent).toBe("10, -20, 30");
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
