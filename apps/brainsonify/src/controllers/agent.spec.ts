import { describe, expect, it, vi } from "vitest";

import { serve, type AgentScene } from "./agent";

const scene = (): AgentScene => ({
  listRegions: vi.fn(async (query?: string) => [
    { label: `Match_${query ?? "all"}`, name: "x", centroid: [0, 0, 0] as [number, number, number], voxels: 1 },
  ]),
  goToRegion: vi.fn(async (region: string, plane?: string) => ({ region, plane: plane ?? "current" })),
  whereAmI: vi.fn(() => ({ here: true })),
});

describe("serve", () => {
  it("answers each method with the scene's result under the request's id", async () => {
    const s = scene();
    expect(await serve(s, { id: 1, method: "list_regions", params: {} })).toEqual({
      id: 1,
      result: [{ label: "Match_all", name: "x", centroid: [0, 0, 0], voxels: 1 }],
    });
    expect(await serve(s, { id: 2, method: "go_to_region", params: { region: " Insula_L ", plane: "axial" } })).toEqual({
      id: 2,
      result: { region: "Insula_L", plane: "axial" },
    });
    expect(await serve(s, { id: 3, method: "where_am_i", params: {} })).toEqual({ id: 3, result: { here: true } });
  });

  it("turns a missing region, an unknown method, or a throw into an error in words", async () => {
    const s = scene();
    expect(await serve(s, { id: 4, method: "go_to_region", params: {} })).toEqual({
      id: 4,
      error: "go_to_region needs a region name.",
    });
    expect(await serve(s, { id: 5, method: "shout" as never, params: {} })).toEqual({
      id: 5,
      error: "Unknown method shout.",
    });
    s.whereAmI = () => {
      throw new Error("no volume");
    };
    expect(await serve(s, { id: 6, method: "where_am_i", params: {} })).toEqual({ id: 6, error: "no volume" });
  });
});
