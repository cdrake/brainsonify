import { beforeEach, describe, expect, it } from "vitest";

import { ControlAPI } from "./controller";
import { PANEL_ORDER } from "./schema";
import { ControlSurface, KNOB_MODES, type KnobScene } from "./surface";

function fakeScene(cut = true): KnobScene & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    moveCrosshair(axis, delta) {
      calls.push(`move ${axis} ${delta.toFixed(2)}`);
    },
    centerCrosshair() {
      calls.push("center");
    },
    movePlane(delta) {
      calls.push(`plane ${delta.toFixed(2)}`);
      return cut;
    },
    nextPlane() {
      calls.push("next");
      return "left";
    },
    describe() {
      return "Left 20 percent.";
    },
  };
}

let api: ControlAPI;
let scene: ReturnType<typeof fakeScene>;
let said: string[];
let surface: ControlSurface;

beforeEach(() => {
  api = new ControlAPI();
  scene = fakeScene();
  said = [];
  surface = new ControlSurface({ api, scene, announce: (text) => said.push(text) });
});

describe("the knob", () => {
  it("moves the crosshair left and right by medium steps to begin with", () => {
    expect(surface.mode).toBe("left-right");
    expect(surface.step).toBe("medium");
    surface.turn(1);
    surface.turn(-2);
    expect(scene.calls).toEqual(["move 0 0.05", "move 0 -0.10"]);
    expect(said).toEqual([]);
  });

  it("moves along whichever axis the technician chose", () => {
    surface.setMode("down-up");
    surface.turn(1);
    expect(scene.calls).toEqual(["move 2 0.05"]);
  });

  it("slides the cut plane in plane mode, and says so when there is no plane", () => {
    surface.setMode("plane");
    surface.turn(3);
    expect(scene.calls).toEqual(["plane 0.15"]);
    const open = new ControlSurface({ api, scene: fakeScene(false), announce: (t) => said.push(t), mode: "plane" });
    open.turn(1);
    expect(said.at(-1)).toBe("No plane is cut.");
  });

  it("ignores a turn of nothing", () => {
    surface.turn(0);
    surface.turn(Number.NaN);
    expect(scene.calls).toEqual([]);
  });

  it("says where the listener is on a press, and never changes anything", () => {
    surface.press();
    expect(said).toEqual(["Left 20 percent."]);
    expect(scene.calls).toEqual([]);
    expect(api.getState()).toEqual(new ControlAPI().getState());
  });
});

describe("the technician's buttons", () => {
  it("announces each mode as it is set", () => {
    surface.setMode("back-front");
    expect(said.at(-1)).toBe("Knob moves back and front.");
    surface.setMode("plane");
    expect(said.at(-1)).toBe("Knob moves the cut plane.");
  });

  it("cycles through every mode and back to the first", () => {
    const seen = [surface.mode];
    for (let i = 0; i < KNOB_MODES.length; i++) {
      surface.cycleMode();
      seen.push(surface.mode);
    }
    expect(seen).toEqual([...KNOB_MODES, KNOB_MODES[0]]);
  });

  it("announces a step size with its percentage", () => {
    surface.setStep("fine");
    expect(said.at(-1)).toBe("Fine steps, 1 percent.");
    surface.cycleStep();
    expect(surface.step).toBe("medium");
    surface.cycleStep();
    expect(said.at(-1)).toBe("Large steps, 10 percent.");
    surface.turn(1);
    expect(scene.calls.at(-1)).toBe("move 0 0.10");
  });

  it("centers the crosshair and steps to the next plane through the scene", () => {
    surface.center();
    surface.nextPlane();
    expect(scene.calls).toEqual(["center", "next"]);
    expect(said).toEqual(["Crosshair centered.", "Cut plane: left."]);
  });

  it("rejects a mode, step or parameter it does not know", () => {
    expect(() => surface.setMode("sideways" as never)).toThrow(/knob mode/);
    expect(() => surface.setStep("huge" as never)).toThrow(/step size/);
    expect(() => surface.setFocus("nope")).toThrow(/parameter/);
  });
});

describe("parameter mode", () => {
  it("opens on the first panel control and names it with its value", () => {
    surface.setMode("parameter");
    expect(surface.focus).toBe(PANEL_ORDER[0]);
    expect(said.at(-1)).toBe("Knob sets Mapping, Pure tone.");
  });

  it("focusing a parameter switches to parameter mode", () => {
    surface.setFocus("volume");
    expect(surface.mode).toBe("parameter");
    expect(said.at(-1)).toBe("Knob sets Volume, 0.40.");
  });

  it("walks the panel in order, wrapping at both ends", () => {
    surface.setFocus(PANEL_ORDER[0]);
    surface.focusPrevious();
    expect(surface.focus).toBe(PANEL_ORDER[PANEL_ORDER.length - 1]);
    surface.focusNext();
    expect(surface.focus).toBe(PANEL_ORDER[0]);
    surface.focusNext();
    expect(surface.focus).toBe(PANEL_ORDER[1]);
  });

  it("nudges a number by the schema step times the step size, silently", () => {
    surface.setFocus("volume");
    said.length = 0;
    surface.turn(1);
    expect(api.getParameter("volume")).toBe(0.45);
    surface.setStep("fine");
    surface.turn(-1);
    expect(api.getParameter("volume")).toBe(0.44);
    surface.setStep("large");
    surface.turn(1);
    expect(api.getParameter("volume")).toBe(0.54);
    expect(said.filter((text) => text.startsWith("Volume"))).toEqual([]);
  });

  it("says when a number is against its limit", () => {
    surface.setFocus("volume");
    surface.setStep("large");
    for (let i = 0; i < 6; i++) surface.turn(1);
    expect(api.getParameter("volume")).toBe(1);
    expect(said.at(-1)).toBe("Large steps, 10 percent.");
    surface.turn(1);
    expect(said.at(-1)).toBe("Volume is at its highest, 1.00.");
    api.setParameter("volume", 0);
    surface.turn(-1);
    expect(said.at(-1)).toBe("Volume is at its lowest, 0.00.");
  });

  it("names an option or a switch as it changes, one step at a time", () => {
    surface.setFocus("mode");
    surface.setStep("large");
    surface.turn(1);
    expect(api.getParameter("mode")).toBe("noise");
    expect(said.at(-1)).toBe("Mapping, Filtered noise.");
    surface.setFocus("tapsOnly");
    surface.turn(1);
    expect(api.getParameter("tapsOnly")).toBe(true);
    expect(said.at(-1)).toBe("Taps only, on.");
    surface.turn(1);
    expect(said.at(-1)).toBe("Taps only is at its highest, on.");
  });

  it("reads the focused control on a press", () => {
    surface.setFocus("lowHz");
    surface.press();
    expect(said.at(-1)).toBe("Low, 110 Hz.");
  });

  it("keeps the focus while the knob is on an axis, for coming back", () => {
    surface.setFocus("gate");
    surface.setMode("down-up");
    surface.setMode("parameter");
    expect(said.at(-1)).toBe("Knob sets Gate, 0.04.");
  });
});
