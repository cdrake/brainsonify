/**
 * A page without a browser, for the integration test.
 *
 * Runs under Bun as its own process, as a real tab would be, and connects
 * to the server with the real client over a fake NiiVue: a volume 200 mm
 * across centred on the origin, a four-region atlas, a canvas that hands
 * back a fixed PNG, and a sound that remembers whether it is on. Which
 * server, what id and what title come from the environment.
 */

import { AgentClient, coreHandlers, sceneState, type AtlasLike, type AtlasRegion, type Handlers, type View } from "niivue-mcp/browser";

const port = process.env.PAGE_PORT ?? "4242";
const id = process.env.PAGE_ID ?? "fake";
const title = process.env.PAGE_TITLE ?? "fake page";

const REGIONS: AtlasRegion[] = [
  { label: "Insula_L", name: "left insula", centroid: [-36, 6, 2], voxels: 100, value: 29 },
  { label: "Insula_R", name: "right insula", centroid: [38, 6, 2], voxels: 100, value: 30 },
  { label: "Precentral_L", name: "left precentral gyrus", centroid: [-40, -6, 50], voxels: 300, value: 1 },
  { label: "Hippocampus_L", name: "left hippocampus", centroid: [-24, -20, -14], voxels: 200, value: 37 },
];
const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 10;
const atlas: AtlasLike = {
  regions: () => REGIONS,
  regionAt: (mm) => REGIONS.find((r) => near(r.centroid, mm))?.name ?? null,
  valueAt: (mm) => {
    const region = REGIONS.find((r) => near(r.centroid, mm));
    return !region || region.label === "Hippocampus_L" ? 0 : region.value;
  },
  nearestIn: (value, mm) => (value === 37 ? [mm[0], mm[1] - 6, mm[2]] : null),
};

// A 1×1 transparent PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const crosshairPos = [0.5, 0.5, 0.5];
let plane: [number, number, number] = [2, 0, 0];
const volumes: Array<{ name: string }> = [];
const view: View = {
  canvas: { width: 320, height: 240, toDataURL: () => `data:image/png;base64,${PNG}` } as unknown as HTMLCanvasElement,
  volumes,
  azimuth: 110,
  elevation: 15,
  crosshairPos,
  getCrosshairPos: () => Array.from(crosshairPos).map((f) => (f - 0.5) * 200),
  getClipPlaneDepthAziElev: () => plane,
  setClipPlane: (next) => {
    plane = [next[0], next[1], next[2]];
  },
  loadVolumes: async ([volume]) => {
    if (volume.url.includes("missing")) throw new Error("404 Not Found");
    volumes.splice(0, volumes.length, { name: volume.name ?? volume.url });
  },
  drawScene: () => {},
  model: {
    mm2scene: (mm) => mm.map((v) => v / 200 + 0.5),
    scene2mm: (frac) => frac.map((f) => (f - 0.5) * 200),
  },
};

let mni = true;
let sounding = false;
let mode = "tone";
const announced: string[] = [];

const host = {
  view,
  atlas: async () => atlas,
  atlasApplies: () => mni,
  describe: () => {
    const mm = view.getCrosshairPos();
    const region = atlas.regionAt(Array.from(mm));
    return `${region ?? "no region"} at ${Array.from(mm).map((v) => Math.round(v)).join(", ")} mm.`;
  },
  announce: (text: string) => announced.push(text),
  loaded: ({ mni: isMni }: { mni: boolean }) => {
    mni = isMni;
  },
  extraState: () => ({ sounding, mode }),
};

const sound: Handlers = {
  set_sound: (params) => {
    sounding = params.on === true;
    return { sounding };
  },
  list_modes: () => ({ modes: [{ value: "tone", label: "Pure tone" }, { value: "noise", label: "Filtered noise" }], current: mode }),
  set_mode: (params) => {
    mode = String(params.mode);
    return { mode, sounding };
  },
  announce: (params) => {
    announced.push(String(params.text));
    return { said: String(params.text), spoken: sounding, announced: [...announced] };
  },
};

const client = new AgentClient(
  { ...coreHandlers(host), ...sound },
  {
    urls: [`ws://127.0.0.1:${port}/app`],
    id,
    title: () => title,
    url: () => `http://fake/${id}`,
    state: () => ({ ...sceneState(host), sounding, mode }),
    onStatus: (connected) => console.log(connected ? "page connected" : "page disconnected"),
  },
);
client.attach();
