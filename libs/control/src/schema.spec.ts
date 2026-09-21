import { describe, expect, it } from "vitest";

import {
  CONTROL_SCHEMA,
  PANEL_ORDER,
  clampParameter,
  formatValue,
  getParametersForChannel,
  stepParameter,
  validateParameter,
} from "./schema";

describe("CONTROL_SCHEMA", () => {
  it("names every parameter by its own key", () => {
    for (const [key, param] of Object.entries(CONTROL_SCHEMA)) expect(param.id).toBe(key);
  });

  it("keeps every default inside its own range and on its own grid", () => {
    for (const param of Object.values(CONTROL_SCHEMA)) {
      expect(validateParameter(param.id, param.defaultValue)).toEqual({ valid: true });
      if (typeof param.defaultValue === "number") {
        expect(stepParameter(param.id, param.defaultValue, 0)).toBe(param.defaultValue);
        const away = param.defaultValue === param.max ? -1 : 1;
        expect(stepParameter(param.id, param.defaultValue, away)).not.toBe(param.defaultValue);
      }
    }
  });

  it("walks the panel top to bottom, starting from the mapping select", () => {
    expect(PANEL_ORDER[0]).toBe("mode");
    expect(PANEL_ORDER).toHaveLength(Object.keys(CONTROL_SCHEMA).length);
    expect(PANEL_ORDER.indexOf("sweepLine")).toBeLessThan(PANEL_ORDER.indexOf("lowHz"));
    expect(PANEL_ORDER[PANEL_ORDER.length - 1]).toBe("glide");
  });

  it("offers only the mappings the panel offers", () => {
    expect(CONTROL_SCHEMA.mode.enumValues?.map((option) => option.value)).toEqual([
      "tone",
      "noise",
      "texture",
    ]);
  });
});

describe("validateParameter", () => {
  it("rejects an unknown parameter", () => {
    expect(validateParameter("nope", 1).valid).toBe(false);
  });

  it("checks the type against the schema", () => {
    expect(validateParameter("volume", "loud").valid).toBe(false);
    expect(validateParameter("tapsOnly", 1).valid).toBe(false);
    expect(validateParameter("mode", "taps").valid).toBe(false);
    expect(validateParameter("mode", "noise").valid).toBe(true);
  });

  it("checks the range", () => {
    expect(validateParameter("volume", 1.5).valid).toBe(false);
    expect(validateParameter("volume", -0.1).valid).toBe(false);
    expect(validateParameter("volume", 1).valid).toBe(true);
  });
});

describe("clampParameter", () => {
  it("holds a number inside the range and leaves an in-range one alone", () => {
    expect(clampParameter("gate", 2)).toBe(0.5);
    expect(clampParameter("gate", -1)).toBe(0);
    expect(clampParameter("gate", 0.1)).toBe(0.1);
  });
});

describe("stepParameter", () => {
  it("moves by the parameter's step and snaps to it", () => {
    expect(stepParameter("volume", 0.4, 1)).toBe(0.41);
    expect(stepParameter("volume", 0.4, -3)).toBe(0.37);
    expect(stepParameter("taps", 14, 1)).toBe(14.5);
    expect(stepParameter("glide", 0.02, 1)).toBe(0.025);
  });

  it("puts an off-grid value back on the grid after one turn", () => {
    expect(stepParameter("volume", 0.403, 1)).toBe(0.41);
  });

  it("stops at the ends of the range", () => {
    expect(stepParameter("volume", 1, 1)).toBe(1);
    expect(stepParameter("volume", 0, -1)).toBe(0);
    expect(stepParameter("volume", 0.99, 5)).toBe(1);
  });

  it("steps through an enum's options and stops at either end", () => {
    expect(stepParameter("mode", "tone", 1)).toBe("noise");
    expect(stepParameter("mode", "noise", 1)).toBe("texture");
    expect(stepParameter("mode", "texture", 1)).toBe("texture");
    expect(stepParameter("mode", "tone", -1)).toBe("tone");
    expect(stepParameter("sweepDir", "right", 2)).toBe("down");
  });

  it("turns a switch on clockwise and off counter-clockwise", () => {
    expect(stepParameter("tapsOnly", false, 1)).toBe(true);
    expect(stepParameter("tapsOnly", true, 1)).toBe(true);
    expect(stepParameter("tapsOnly", true, -1)).toBe(false);
  });

  it("leaves the value alone for no steps or an unknown parameter", () => {
    expect(stepParameter("volume", 0.4, 0)).toBe(0.4);
    expect(stepParameter("nope", 0.4, 1)).toBe(0.4);
  });
});

describe("formatValue", () => {
  it("prints a number at the step's precision with its unit", () => {
    expect(formatValue("volume", 0.4)).toBe("0.40");
    expect(formatValue("lowHz", 110)).toBe("110 Hz");
    expect(formatValue("glide", 0.02)).toBe("0.020 s");
    expect(formatValue("taps", 14)).toBe("14.0 /s");
  });

  it("names an option and a switch rather than printing the raw value", () => {
    expect(formatValue("mode", "texture")).toBe("White noise");
    expect(formatValue("sweepDir", "down")).toBe("Top to bottom");
    expect(formatValue("tapsOnly", true)).toBe("on");
    expect(formatValue("render3d", false)).toBe("off");
  });
});

describe("getParametersForChannel", () => {
  it("includes the parameters a channel owns and the ones every channel shares", () => {
    const sweep = getParametersForChannel("sweep");
    expect(sweep).toContain("sweepLine");
    expect(sweep).toContain("volume");
    expect(sweep).not.toContain("width");
  });
});
