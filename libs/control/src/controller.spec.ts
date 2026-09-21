import { beforeEach, describe, expect, it, vi } from "vitest";

import { ControlAPI } from "./controller";
import { DEFAULT_STATE } from "./state";

// The API warns on a rejected write rather than throwing; the specs below
// exercise rejections on purpose, so the warnings are kept out of the run.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("ControlAPI", () => {
  it("opens at the defaults, or at the defaults with an overlay", () => {
    expect(new ControlAPI().getState()).toEqual(DEFAULT_STATE);
    expect(new ControlAPI({ volume: 0.7 }).getParameter("volume")).toBe(0.7);
  });

  it("throws for an unknown parameter read", () => {
    expect(() => new ControlAPI().getParameter("nope")).toThrow(/Unknown parameter/);
  });

  it("sets a value and reports whether anything changed", () => {
    const api = new ControlAPI();
    expect(api.setParameter("volume", 0.5)).toBe(true);
    expect(api.setParameter("volume", 0.5)).toBe(false);
  });

  it("rejects a value outside the range rather than clamping it", () => {
    const api = new ControlAPI();
    expect(api.setParameter("volume", 5)).toBe(false);
    expect(api.getParameter("volume")).toBe(DEFAULT_STATE.volume);
  });

  it("rejects the wrong type, an unknown id, and an option off the list", () => {
    const api = new ControlAPI();
    expect(api.setParameter("volume", "loud")).toBe(false);
    expect(api.setParameter("nope", 1)).toBe(false);
    expect(api.setParameter("mode", "taps")).toBe(false);
    expect(api.getState()).toEqual(DEFAULT_STATE);
  });

  it("hands a copy out, so a caller cannot write through it", () => {
    const api = new ControlAPI();
    api.getState().volume = 0;
    expect(api.getParameter("volume")).toBe(DEFAULT_STATE.volume);
  });
});

describe("events", () => {
  it("tells parameter listeners the old and new value", () => {
    const api = new ControlAPI();
    const seen = vi.fn();
    api.onParameterChange("gate", seen);
    api.setParameter("gate", 0.1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toMatchObject({
      parameterId: "gate",
      previousValue: 0.04,
      currentValue: 0.1,
    });
  });

  it("tells state listeners the state before and after, and what changed", () => {
    const api = new ControlAPI();
    const seen = vi.fn();
    api.onStateChange(seen);
    api.setParameter("gate", 0.1);
    const event = seen.mock.calls[0][0];
    expect(event.changedParameters).toEqual(["gate"]);
    expect(event.previousState.gate).toBe(0.04);
    expect(event.currentState.gate).toBe(0.1);
  });

  it("batches a partial state into one state event and one event per parameter", () => {
    const api = new ControlAPI();
    const state = vi.fn();
    const gate = vi.fn();
    api.onStateChange(state);
    api.onParameterChange("gate", gate);
    const changed = api.setState({ gate: 0.1, volume: 0.6, mode: "tone" });
    expect(changed).toEqual(["gate", "volume"]);
    expect(state).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledTimes(1);
  });

  it("skips the rejected fields of a batch and keeps the rest", () => {
    const api = new ControlAPI();
    expect(api.setState({ gate: "x" as unknown as number, volume: 0.6 })).toEqual(["volume"]);
  });

  it("stops telling a listener once it unsubscribes", () => {
    const api = new ControlAPI();
    const seen = vi.fn();
    const off = api.onStateChange(seen);
    off();
    api.setParameter("gate", 0.1);
    expect(seen).not.toHaveBeenCalled();
  });

  it("survives a listener that throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const api = new ControlAPI();
    const after = vi.fn();
    api.onStateChange(() => {
      throw new Error("boom");
    });
    api.onStateChange(after);
    expect(api.setParameter("gate", 0.1)).toBe(true);
    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe("applyExperiment", () => {
  it("takes the mode and the tap ceiling from a preset", () => {
    const api = new ControlAPI();
    const seen = vi.fn();
    api.onExperimentApplied(seen);
    api.applyExperiment({ mode: "noise", taps: { slowest: 2, fastest: 20 } });
    expect(api.getParameter("mode")).toBe("noise");
    expect(api.getParameter("taps")).toBe(20);
    expect(seen.mock.calls[0][0].previousState.mode).toBe("tone");
    expect(seen.mock.calls[0][0].appliedState.mode).toBe("noise");
  });

  it("leaves a preset's missing fields alone", () => {
    const api = new ControlAPI({ mode: "texture" });
    api.applyExperiment({});
    expect(api.getParameter("mode")).toBe("texture");
  });
});

describe("undo", () => {
  it("steps back one write at a time and tells the listeners", () => {
    const api = new ControlAPI();
    const seen = vi.fn();
    api.setParameter("gate", 0.1);
    api.setParameter("gate", 0.2);
    api.onStateChange(seen);
    expect(api.undo()).toBe(true);
    expect(api.getParameter("gate")).toBe(0.1);
    expect(seen.mock.calls[0][0]).toMatchObject({ changedParameters: ["gate"] });
    expect(seen.mock.calls[0][0].previousState.gate).toBe(0.2);
    expect(api.undo()).toBe(true);
    expect(api.getParameter("gate")).toBe(0.04);
    expect(api.undo()).toBe(false);
  });

  it("keeps twenty steps and forgets the oldest", () => {
    const api = new ControlAPI();
    for (let i = 1; i <= 30; i++) api.setParameter("lowHz", 100 + i);
    expect(api.getHistorySize()).toBe(20);
    api.clearHistory();
    expect(api.getHistorySize()).toBe(1);
    expect(api.undo()).toBe(false);
  });
});

describe("JSON", () => {
  it("round-trips the state", () => {
    const api = new ControlAPI();
    api.setParameter("volume", 0.75);
    const other = new ControlAPI();
    expect(other.fromJSON(api.toJSON())).toBe(true);
    expect(other.getParameter("volume")).toBe(0.75);
  });

  it("rejects text that is not JSON", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(new ControlAPI().fromJSON("{")).toBe(false);
  });
});
