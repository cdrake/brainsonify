import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { CONTROL_SCHEMA, PANEL_ORDER } from "@brainsonify/control";

/**
 * The control schema in libs/control describes the panel in index.html: the
 * same ranges, steps, defaults and options. Nothing enforces that at runtime,
 * so this does. Renaming a control on the page or changing a slider's range
 * fails here rather than leaving the knob stepping a value the slider cannot
 * show.
 */
const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");

/** Page ids for the three controls whose schema id is not their element id. */
const PAGE_ID: Readonly<Record<string, string>> = { lowHz: "fLo", octaves: "oct", volume: "vol" };

beforeEach(() => {
  document.documentElement.innerHTML = html;
});

describe("the schema against the panel", () => {
  it("has one element per parameter, in panel order", () => {
    const seen: number[] = [];
    for (const id of PANEL_ORDER) {
      const node = document.getElementById(PAGE_ID[id] ?? id);
      expect(node, id).not.toBeNull();
      seen.push(Array.prototype.indexOf.call(document.querySelectorAll("input, select"), node));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("matches every slider's range, step and default", () => {
    for (const param of Object.values(CONTROL_SCHEMA)) {
      if (param.type !== "float" && param.type !== "int") continue;
      const input = document.getElementById(PAGE_ID[param.id] ?? param.id) as HTMLInputElement;
      expect(input.type, param.id).toBe("range");
      expect(Number(input.min), `${param.id} min`).toBe(param.min);
      expect(Number(input.max), `${param.id} max`).toBe(param.max);
      expect(Number(input.step || 1), `${param.id} step`).toBe(param.step);
      expect(Number(input.value), `${param.id} default`).toBe(param.defaultValue);
    }
  });

  it("matches every select's options and default", () => {
    for (const param of Object.values(CONTROL_SCHEMA)) {
      if (param.type !== "enum") continue;
      const select = document.getElementById(param.id) as HTMLSelectElement;
      expect([...select.options].map((option) => option.value), param.id).toEqual(
        param.enumValues?.map((option) => option.value),
      );
      expect(select.value, `${param.id} default`).toBe(param.defaultValue);
    }
  });

  it("matches every checkbox's default", () => {
    for (const param of Object.values(CONTROL_SCHEMA)) {
      if (param.type !== "boolean") continue;
      const input = document.getElementById(param.id) as HTMLInputElement;
      expect(input.type, param.id).toBe("checkbox");
      expect(input.checked, `${param.id} default`).toBe(param.defaultValue);
    }
  });
});
