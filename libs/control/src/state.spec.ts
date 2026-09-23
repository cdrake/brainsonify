import { describe, expect, it } from "vitest";

import { CONTROL_SCHEMA } from "./schema";
import { DEFAULT_STATE, cloneState, getStateDiff, mergeState, statesEqual } from "./state";

describe("DEFAULT_STATE", () => {
  it("has exactly the schema's parameters at the schema's defaults", () => {
    expect(Object.keys(DEFAULT_STATE).sort()).toEqual(Object.keys(CONTROL_SCHEMA).sort());
    for (const param of Object.values(CONTROL_SCHEMA)) {
      expect(DEFAULT_STATE[param.id as keyof typeof DEFAULT_STATE]).toBe(param.defaultValue);
    }
  });
});

describe("cloneState", () => {
  it("returns an equal state that is not the same object", () => {
    const copy = cloneState(DEFAULT_STATE);
    expect(copy).toEqual(DEFAULT_STATE);
    expect(copy).not.toBe(DEFAULT_STATE);
  });
});

describe("getStateDiff", () => {
  it("lists only the fields that changed", () => {
    const changed = mergeState(DEFAULT_STATE, { volume: 0.9, mode: "noise" });
    expect(getStateDiff(DEFAULT_STATE, changed)).toEqual({ volume: 0.9, mode: "noise" });
  });

  it("is empty for equal states", () => {
    expect(getStateDiff(DEFAULT_STATE, cloneState(DEFAULT_STATE))).toEqual({});
  });
});

describe("statesEqual and mergeState", () => {
  it("merges a partial over a base without touching the base", () => {
    const merged = mergeState(DEFAULT_STATE, { gate: 0.2 });
    expect(merged.gate).toBe(0.2);
    expect(DEFAULT_STATE.gate).toBe(0.04);
    expect(statesEqual(merged, DEFAULT_STATE)).toBe(false);
    expect(statesEqual(mergeState(DEFAULT_STATE, {}), DEFAULT_STATE)).toBe(true);
  });
});
