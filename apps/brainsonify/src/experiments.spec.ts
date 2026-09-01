import { describe, expect, it } from "vitest";

import {
  EXPERIMENTS,
  LATEST,
  PARAM,
  experimentHref,
  resolveExperiment,
} from "./experiments";

describe("the experiment log", () => {
  it("gives every condition a distinct id, since the id is the shared link", () => {
    const ids = EXPERIMENTS.map((experiment) => experiment.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("treats the last entry as the latest", () => {
    expect(LATEST).toBe(EXPERIMENTS[EXPERIMENTS.length - 1]);
  });

  it("keeps the log in the order the experiments were run", () => {
    const numbers = EXPERIMENTS.map((experiment) => experiment.number);
    expect(numbers).toEqual([...numbers].sort());
  });
});

describe("resolveExperiment", () => {
  it("lands a visitor on the latest condition when the URL names none", () => {
    expect(resolveExperiment("")).toBe(LATEST);
    expect(resolveExperiment("?volume=demo")).toBe(LATEST);
  });

  it("selects the condition a link names", () => {
    for (const experiment of EXPERIMENTS) {
      expect(resolveExperiment(`?${PARAM}=${experiment.id}`)).toBe(experiment);
    }
  });

  it("falls back to the latest rather than failing on an id it does not know", () => {
    // A link handed to a participant should still land somewhere usable after
    // the condition it named has been renamed or dropped.
    expect(resolveExperiment(`?${PARAM}=99-telepathy`)).toBe(LATEST);
  });
});

describe("experimentHref", () => {
  it("stays relative, so it survives a GitHub Pages subpath", () => {
    for (const experiment of EXPERIMENTS) {
      expect(experimentHref(experiment).startsWith("./")).toBe(true);
    }
  });

  it("round-trips: the link for a condition resolves back to it", () => {
    for (const experiment of EXPERIMENTS) {
      const search = new URL(experimentHref(experiment), "https://example.test/app/").search;
      expect(resolveExperiment(search)).toBe(experiment);
    }
  });

  it("pins the latest to its own id rather than the bare root", () => {
    // Otherwise every link to today's latest silently becomes a link to
    // tomorrow's, and a result recorded against one condition reads as another.
    expect(experimentHref(LATEST)).toContain(LATEST.id);
  });
});
