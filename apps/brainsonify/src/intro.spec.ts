import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { END_CONFIRM_MS, type IntroActions, TechnicianIntro } from "./intro";

/** The real page, so the intro is tested against the markup it ships with. */
const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");

function actions(): IntroActions & { [K in keyof IntroActions]: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(async () => {}),
    start: vi.fn(),
    experiment: vi.fn(() => "A Pitch only"),
    end: vi.fn(),
  };
}

const click = (id: string) => (document.getElementById(id) as HTMLButtonElement).click();

beforeEach(() => {
  document.documentElement.innerHTML = html;
});

describe("the technician intro", () => {
  it("ends the session on a second tap of End session, not the first", () => {
    const a = actions();
    new TechnicianIntro(a);
    click("endBtn");
    expect(a.end).not.toHaveBeenCalled();
    expect(document.getElementById("endBtn")?.textContent).toBe("Tap again to end");
    click("endBtn");
    expect(a.end).toHaveBeenCalledOnce();
    expect(document.getElementById("endBtn")?.textContent).toBe("End session");
  });

  it("stands End session down if the second tap does not come", () => {
    vi.useFakeTimers();
    try {
      const a = actions();
      new TechnicianIntro(a);
      click("endBtn");
      vi.advanceTimersByTime(END_CONFIRM_MS);
      expect(document.getElementById("endBtn")?.classList.contains("armed")).toBe(false);
      click("endBtn");
      expect(a.end).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("walks the five steps in order", () => {
    new TechnicianIntro(actions());
    const steps = [...document.querySelectorAll("#intro .introSteps > li h2")].map((h) => h.textContent);
    expect(steps).toEqual([
      "Load the image",
      "Fit the headphones",
      "Hand over the Helm",
      "Explain the Helm",
      "Start the session",
    ]);
  });

  it("adds no form inputs, so the panel's control order is untouched", () => {
    expect(document.querySelectorAll("#intro input, #intro select")).toHaveLength(0);
  });

  it("starts the session and closes on Start session", () => {
    const a = actions();
    const intro = new TechnicianIntro(a);
    intro.open();
    click("introStart");
    expect(a.start).toHaveBeenCalledOnce();
    expect(intro.isOpen).toBe(false);
  });

  it("closes on Skip without starting anything", () => {
    const a = actions();
    const intro = new TechnicianIntro(a);
    intro.open();
    click("introSkip");
    expect(a.start).not.toHaveBeenCalled();
    expect(intro.isOpen).toBe(false);
  });

  it("reopens from the panel and names the active condition", () => {
    const intro = new TechnicianIntro(actions());
    click("introBtn");
    expect(intro.isOpen).toBe(true);
    expect(document.getElementById("introExperiment")?.textContent).toBe("A Pitch only");
  });

  it("loads the demo its button names", () => {
    const a = actions();
    new TechnicianIntro(a);
    (document.querySelector('[data-intro-load="demoHead"]') as HTMLButtonElement).click();
    expect(a.load).toHaveBeenCalledWith("demoHead", undefined);
  });

  it("shows what the page reports, and marks a failure", () => {
    const intro = new TechnicianIntro(actions());
    const status = document.getElementById("introVolume");
    intro.volume("Loaded the MNI152 demo.");
    expect(status?.textContent).toBe("Loaded the MNI152 demo.");
    expect(status?.classList.contains("failed")).toBe(false);
    intro.volume("It did not load.", true);
    expect(status?.classList.contains("failed")).toBe(true);
  });

  it("keeps knob keys pressed in the dialog from reaching the window", () => {
    new TechnicianIntro(actions());
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    document.querySelector("#intro p")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    window.removeEventListener("keydown", heard);
    expect(heard).not.toHaveBeenCalled();
  });
});
