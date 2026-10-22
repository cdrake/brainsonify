import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ControlAPI, ControlSurface, type KnobScene } from "@brainsonify/control";

import { KEY_MAP, type Intent } from "./controllers/keys";
import { VirtualController } from "./controllers/virtual";
import { HelmTutorial, TUTORIAL_DONE, TUTORIAL_STEPS } from "./tutorial";

const scene: KnobScene = {
  moveCrosshair: () => {},
  centerCrosshair: () => {},
  movePlane: () => true,
  nextPlane: () => "left",
  describe: () => "Here.",
};

/** The key that sends an intent, from the one table the page uses. */
const keyFor = (intent: Intent) => Object.entries(KEY_MAP).find(([, i]) => i === intent)![0];

let said: string[];
let shown: Array<string | null>;
let tutorial: HelmTutorial;
let surface: ControlSurface;
let controller: VirtualController;

/** Lets the microtask that speaks unclaimed surface words run. */
const settle = () => Promise.resolve();

function press(intent: Intent): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: keyFor(intent), cancelable: true }));
}

beforeEach(() => {
  said = [];
  shown = [];
  tutorial = new HelmTutorial({ say: (text) => said.push(text), show: (line) => shown.push(line) });
  surface = new ControlSurface({ api: new ControlAPI(), scene, announce: (text) => tutorial.heard(text) });
  controller = new VirtualController(surface, window, (intent) => tutorial.intent(intent));
  controller.attach();
});

afterEach(() => controller.detach());

describe("the Helm tutorial", () => {
  it("teaches every control exactly once", () => {
    const taught = TUTORIAL_STEPS.map((step) => step.teaches).sort();
    expect(taught).toEqual([...new Set(Object.values(KEY_MAP))].sort());
  });

  it("passes the surface's words straight through when it is not running", async () => {
    press("back-front");
    await settle();
    expect(said).toEqual(["Helm moves back and front."]);
  });

  it("runs to the end when each step is done, turning after a mode", async () => {
    tutorial.start();
    for (const step of TUTORIAL_STEPS) {
      press(step.teaches);
      if (step.turn) press("clockwise");
    }
    await settle();
    expect(tutorial.active).toBe(false);
    expect(said.at(-1)).toBe(`Helm moves left and right. ${TUTORIAL_DONE}`);
    expect(shown.at(-1)).toBeNull();
  });

  it("says a mode's own announcement in one line with the prompt that follows", async () => {
    tutorial.start();
    press("press");
    press("clockwise");
    press("counter-clockwise");
    said = [];
    press("back-front");
    await settle();
    // One utterance: the next one would cut the first off.
    expect(said).toEqual([`Helm moves back and front. ${TUTORIAL_STEPS[3].turn}`]);
    expect(shown.at(-1)).toBe(`Step 4 of ${TUTORIAL_STEPS.length}: Now the listener turns the Helm.`);
  });

  it("holds a step until its own control comes, and still says what other keys did", async () => {
    tutorial.start();
    said = [];
    press("cycle-step");
    await settle();
    expect(tutorial.step).toBe(0);
    expect(said).toEqual(["Large steps, 10 percent."]);
  });

  it("does not finish a mode step on a press, only a turn", () => {
    tutorial.start();
    for (const intent of ["press", "clockwise", "counter-clockwise", "back-front", "press"] as const) press(intent);
    expect(tutorial.step).toBe(3);
    press("counter-clockwise");
    expect(tutorial.step).toBe(4);
  });

  it("says what resetting the Helm announced in one line with the first prompt", async () => {
    tutorial.start(() => surface.setMode("left-right"));
    await settle();
    expect(said).toEqual([`Helm moves left and right. ${TUTORIAL_STEPS[0].say}`]);
  });

  it("skips a step and stops when told", () => {
    tutorial.start();
    tutorial.skip();
    expect(tutorial.step).toBe(1);
    expect(said.at(-1)).toBe(TUTORIAL_STEPS[1].say);
    tutorial.stop();
    expect(tutorial.active).toBe(false);
    expect(shown.at(-1)).toBeNull();
  });
});
