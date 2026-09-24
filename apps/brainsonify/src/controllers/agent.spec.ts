import { describe, expect, it, vi } from "vitest";

import { brainsonifyHandlers, brainsonifyState, type SoundHost } from "./agent";

function sound(running = false): SoundHost & { mode: string } {
  const host = {
    running,
    mode: "tone",
    sounding: () => host.running,
    setSound: vi.fn(async (on: boolean) => (host.running = on)),
    modes: () => ({
      modes: [
        { value: "tone", label: "Pure tone" },
        { value: "noise", label: "Filtered noise" },
      ],
      current: host.mode,
    }),
    setMode: vi.fn((mode: string) => void (host.mode = mode)),
    announce: vi.fn(),
  };
  return host;
}

describe("brainsonifyHandlers", () => {
  it("turns the sound on and off, and leaves it when it already is", async () => {
    const s = sound();
    const handlers = brainsonifyHandlers(s);
    expect(await handlers.set_sound({ on: true })).toEqual({ sounding: true });
    expect(await handlers.set_sound({ on: true })).toEqual({ sounding: true });
    expect(s.setSound).toHaveBeenCalledTimes(1);
    expect(await handlers.set_sound({ on: false })).toEqual({ sounding: false });
    expect(s.setSound).toHaveBeenLastCalledWith(false);
  });

  it("says so when the browser will not start audio without a click", async () => {
    const s = sound();
    s.setSound = vi.fn(() => new Promise<boolean>(() => {}));
    const handlers = brainsonifyHandlers(s, 5);
    await expect(handlers.set_sound({ on: true })).rejects.toThrow("click Enable sound");
  });

  it("lists the modes with the current one, and sets a known one only", () => {
    const s = sound(true);
    const handlers = brainsonifyHandlers(s);
    expect(handlers.list_modes({})).toEqual({
      modes: [
        { value: "tone", label: "Pure tone" },
        { value: "noise", label: "Filtered noise" },
      ],
      current: "tone",
    });
    expect(handlers.set_mode({ mode: "noise" })).toEqual({ mode: "noise", sounding: true });
    expect(s.setMode).toHaveBeenCalledWith("noise");
    expect(() => handlers.set_mode({ mode: "kazoo" })).toThrow('Unknown mode "kazoo". One of: tone, noise.');
  });

  it("announces, and says whether it was spoken aloud", () => {
    const s = sound();
    const handlers = brainsonifyHandlers(s);
    expect(handlers.announce({ text: " Moving to the insula. " })).toEqual({ said: "Moving to the insula.", spoken: false });
    expect(s.announce).toHaveBeenCalledWith("Moving to the insula.");
    expect(() => handlers.announce({})).toThrow("needs some text");
  });
});

describe("brainsonifyState", () => {
  it("adds the sound to the scene's state", () => {
    const view = {
      canvas: null,
      volumes: [],
      azimuth: 0,
      elevation: 0,
      crosshairPos: [0.5, 0.5, 0.5],
      getCrosshairPos: () => [0, 0, 0],
      getClipPlaneDepthAziElev: () => [2, 0, 0] as [number, number, number],
      setClipPlane: () => {},
      loadVolumes: async () => {},
      drawScene: () => {},
      model: { mm2scene: (mm: number[]) => mm, scene2mm: (f: number[]) => f },
    };
    expect(brainsonifyState({ view }, sound(true))()).toEqual({
      volume: null,
      crosshair: null,
      plane: null,
      sounding: true,
      mode: "tone",
    });
  });
});
