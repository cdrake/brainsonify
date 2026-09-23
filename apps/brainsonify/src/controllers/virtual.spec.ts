import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ControlAPI, ControlSurface, type KnobScene } from "@brainsonify/control";

import { KEY_MAP, intentOf } from "./keys";
import { VirtualController } from "./virtual";

function scene(): KnobScene & { moves: Array<[number, number]> } {
  const moves: Array<[number, number]> = [];
  return {
    moves,
    moveCrosshair: (axis, delta) => {
      moves.push([axis, delta]);
    },
    centerCrosshair: () => {},
    movePlane: () => true,
    nextPlane: () => "left",
    describe: () => "here",
  };
}

let api: ControlAPI;
let stage: ReturnType<typeof scene>;
let said: string[];
let surface: ControlSurface;
let controller: VirtualController;

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '<canvas id="gl" tabindex="0"></canvas><input type="range" id="vol"><button id="b">b</button>';
  api = new ControlAPI();
  stage = scene();
  said = [];
  surface = new ControlSurface({ api, scene: stage, announce: (text) => said.push(text) });
  controller = new VirtualController(surface, window);
  controller.attach();
});

// A controller left on the window would answer the next test's keys first
// and mark them handled, so the one under test would ignore them.
afterEach(() => controller.detach());

describe("KEY_MAP", () => {
  it("stays off the keys NiiVue reads on a focused canvas", () => {
    for (const key of ["h", "j", "k", "l", "m", "c", "v", "u", "d", "ArrowLeft", "ArrowRight"]) {
      expect(intentOf(key), key).toBeNull();
    }
  });

  it("matches letters either case and everything else exactly", () => {
    expect(intentOf("S")).toBe("cycle-step");
    expect(intentOf("N")).toBe("next-plane");
    expect(intentOf("home")).toBeNull();
    expect(Object.keys(KEY_MAP)).toContain("Home");
  });
});

describe("VirtualController", () => {
  it("turns the knob with the up and down arrows", () => {
    press("ArrowUp");
    press("ArrowDown");
    press("ArrowDown");
    expect(stage.moves).toEqual([
      [0, 0.05],
      [0, -0.05],
      [0, -0.05],
    ]);
  });

  it("uses the event, so the page does not scroll under it", () => {
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    expect(press("x").defaultPrevented).toBe(false);
  });

  it("gives the technician the numbered modes and the cycle key", () => {
    press("3");
    expect(surface.mode).toBe("down-up");
    press("0");
    expect(surface.mode).toBe("plane");
    press("5");
    expect(surface.mode).toBe("parameter");
    expect(said.at(-1)).toBe("Knob sets Mapping, Pure tone.");
  });

  it("walks the parameters and nudges the focused one", () => {
    press("5");
    press("]");
    expect(surface.focus).toBe("render3d");
    press("[");
    press("[");
    expect(surface.focus).toBe("glide");
    press("ArrowUp");
    expect(api.getParameter("glide")).toBe(0.045);
  });

  it("presses, centers, changes step and steps the plane", () => {
    press("Enter");
    expect(said.at(-1)).toBe("here");
    press("s");
    expect(surface.step).toBe("large");
    press("Home");
    expect(said.at(-1)).toBe("Crosshair centered.");
    press("n");
    expect(said.at(-1)).toBe("Cut plane: left.");
  });

  it("works with the canvas focused", () => {
    press("ArrowUp", {}, document.getElementById("gl")!);
    expect(stage.moves).toHaveLength(1);
  });

  it("leaves keys alone inside a form control or with a modifier held", () => {
    press("ArrowUp", {}, document.getElementById("vol")!);
    press("Enter", {}, document.getElementById("b")!);
    press("ArrowUp", { ctrlKey: true });
    press("ArrowUp", { metaKey: true });
    expect(stage.moves).toEqual([]);
    expect(said).toEqual([]);
  });

  it("stops listening once detached", () => {
    controller.detach();
    press("ArrowUp");
    expect(stage.moves).toEqual([]);
  });
});
