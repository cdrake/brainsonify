import { describe, expect, it } from "vitest";

import { planarLayout } from "./layout";

describe("planarLayout", () => {
  it("uses a grid on anything near square", () => {
    expect(planarLayout(960, 800)).toBe("grid");
    expect(planarLayout(800, 800)).toBe("grid");
    expect(planarLayout(640, 495)).toBe("grid");
  });

  it("switches to a row once the stage is wider than twice its height", () => {
    expect(planarLayout(1180, 620)).toBe("grid");
    expect(planarLayout(1480, 560)).toBe("row");
    expect(planarLayout(1680, 460)).toBe("row");
  });

  it("switches to a column once the stage is taller than twice its width", () => {
    expect(planarLayout(780, 1400)).toBe("grid");
    expect(planarLayout(680, 1400)).toBe("column");
  });

  it("falls back to a grid before the stage has a size", () => {
    expect(planarLayout(0, 0)).toBe("grid");
    expect(planarLayout(NaN, 500)).toBe("grid");
  });
});
