import { Niivue, cmapper } from "@niivue/niivue";

import {
  DEFAULT_BOUNDS,
  DEFAULT_RANGE,
  DEFAULT_TAPS,
  Sonifier,
  anteriority,
  contrast,
  boundsFromFrac,
  frequency,
  normalise,
  opacityFromLut,
  pan,
  peakAlpha,
  relativeOpacity,
  tapRate,
  type Bounds,
  type IntensityRange,
} from "@brainsonify/sonification";

import "./styles.css";
import {
  EXPERIMENTS,
  experimentHref,
  resolveExperiment,
  type Experiment,
} from "./experiments";
import { bonenessAt, reach, type BoneMap, type Grid } from "./boneness";
import type { BoneReply, BoneRequest } from "./boneness.worker";
import { VoxelSampler, type Sample } from "./sampler";
import { Controls, ExperimentNav, Readout, applyChannels, el } from "./ui";

/**
 * Clip depth is a signed distance from the centre of the volume: NiiVue treats
 * anything past ~1.73 as "no plane", and smaller values cut deeper. These bound
 * the slider onto the useful span — just grazing the surface, through to well
 * past the midline.
 */
const CLIP_OFF = 2;
const CLIP_GRAZE = 0.85;
const CLIP_DEEPEST = -0.45;

const DEMOS = "https://niivue.github.io/niivue-demo-images/";

/**
 * MNI152 is skull-stripped, so its opacity only ever spans brain tissue. The
 * whole-head T1 keeps scalp, marrow and the signal-void of cortical bone, which
 * is the range the rhythm channel was built to carry.
 */
const DEMO_VOLUMES = {
  demo: { label: "Load MNI152 demo", url: `${DEMOS}mni152.nii.gz` },
  demoHead: { label: "Load head + skull T1", url: `${DEMOS}chris_t1.nii.gz` },
} as const;

const controls = new Controls();
const readout = new Readout();
const sonifier = new Sonifier();

const nv = new Niivue({
  backColor: [0, 0, 0, 1],
  crosshairColor: [0.15, 0.6, 1, 1],
  show3Dcrosshair: true,
});
nv.attachTo("gl");

const sampler = new VoxelSampler(nv);
let range: IntensityRange = DEFAULT_RANGE;
let bounds: Bounds = DEFAULT_BOUNDS;
/**
 * The active colormap as 256 RGBA quads. Opacity comes off its alpha channel:
 * no second ray is needed, since the sampler has already resolved which voxel
 * the pointer is over and how visible that voxel is, is a table lookup.
 */
let lut: Uint8ClampedArray = new Uint8ClampedArray();
/** The most alpha `lut` ever gives, so the taps can span their whole range. */
let lutPeak = 0;
let active: Experiment = resolveExperiment(location.search);

/**
 * How bone-like every voxel is, or null when there is none for this volume yet.
 *
 * Precomputed once per volume rather than per hover: the filter is a second of
 * dense float work over the whole grid, but reading one voxel out of the
 * finished map is a table lookup, which is what a pointer move can afford.
 */
let boneMap: BoneMap | null = null;
/**
 * The filter's own output, before the probe widens it.
 *
 * Kept so the `Spike` slider can be dragged freely: widening is three cheap
 * passes over a half-resolution volume, while the filter behind it is a second
 * of work that must not be repeated for a slider drag.
 */
let boneRaw: BoneMap | null = null;
let boneWorker: Worker | null = null;
/** Identifies the volume a reply belongs to, so a superseded one is dropped. */
let boneToken = 0;
let bonePending = false;

// Dev-only handles so the picking and audio paths can be poked from a console:
// `nv.selectedObjectId` should read 254 (VOLUME_ID) after hovering tissue on
// the render, and flipping `nv.opts.show3Dcrosshair` reproduces the shadowed
// pick the sampler works around. The tap layer schedules ahead on the audio
// clock, so `sonifier.rate` is the only way to see it responding to a hover.
if (import.meta.env.DEV) {
  Object.assign(window, { nv, sonifier });
}

/* ---------------- experiment switching ---------------- */

/**
 * Enters a condition: repaints the switcher, hides the channels it does not
 * use, and silences the voice so the previous condition's tone does not run on
 * across the change.
 */
function activate(experiment: Experiment, pushHistory: boolean): void {
  active = experiment;
  nav.show(experiment);
  applyChannels(experiment.channels);
  if (experiment.taps) controls.setTaps(experiment.taps.fastest);
  sonifier.silence();

  ensureBoneMap();
  document.title = `brainsonify — ${experiment.number} ${experiment.name}`;
  if (pushHistory) history.pushState({ id: experiment.id }, "", experimentHref(experiment));
}

const nav = new ExperimentNav(EXPERIMENTS, experimentHref, (experiment) =>
  activate(experiment, true),
);

// Back and forward move between conditions, since the switcher pushed them.
addEventListener("popstate", () => activate(resolveExperiment(location.search), false));

activate(active, false);

/* ---------------- audio toggle ---------------- */

const audioBtn = el<HTMLButtonElement>("audioBtn");
audioBtn.addEventListener("click", async () => {
  const on = await sonifier.toggle();
  audioBtn.textContent = on ? "Sound on" : "Enable sound";
  audioBtn.classList.toggle("on", on);
  audioBtn.classList.toggle("primary", !on);
});

/* ---------------- sonification ---------------- */

function onSample(sample: Sample | null): void {
  if (!sample) {
    readout.clear();
    sonifier.silence();
    return;
  }

  const c = controls.values;
  const norm = normalise(sample.raw, range);
  const freq = frequency(norm, c.lowHz, c.octaves);
  const position = active.channels.stereo ? pan(sample.mm[0], bounds.x, c.width) : 0;
  // World Y is the anterior-posterior axis. It rides the tap rather than the
  // tone: the cue is spectral, and a click carries a spectral cue where a
  // sustained sine would only change colour.
  const front = active.channels.depth ? anteriority(sample.mm[1], bounds.y, c.spread) : 0;

  const opacity = relativeOpacity(opacityFromLut(lut, norm), lutPeak);
  const bone = boneMap ? bonenessAt(boneMap, ...sample.vox) : null;

  // Both conditions drive the same tap layer; which signal is behind it is the
  // whole difference between them. While the map is still building there is
  // nothing honest to tap, so the layer stays silent rather than reporting a
  // zero that would sound like "no bone here".
  // Boneness answers a yes-or-no question, so its range is pushed to the ends
  // before it becomes a rate; opacity is a genuine quantity and is left alone.
  const driver =
    active.channels.bone ? (bone === null ? null : contrast(bone)) : opacity;
  const tapping = active.channels.rhythm || active.channels.bone;
  const slowest = active.taps?.slowest ?? DEFAULT_TAPS.slowest;
  const taps =
    tapping && driver !== null
      ? tapRate(driver, { slowest, fastest: c.taps }, c.rate)
      : 0;

  readout.show({
    raw: sample.raw,
    norm,
    freq,
    mm: sample.mm,
    pan: position,
    depth: front,
    opacity,
    bone,
    taps,
    source: sample.source,
  });
  // Muting the tone only makes sense where there is a tap layer to be left
  // with; in a condition that does not tap it would just be silence.
  const mode = tapping && controls.tapsOnly ? "taps" : c.mode;
  sonifier.update(
    { freq, pan: position, depth: front, taps, open: norm > c.gate },
    { ...c, mode },
  );
}

const canvas = el<HTMLCanvasElement>("gl");
const track = (e: PointerEvent) =>
  sampler.sample(e.offsetX, e.offsetY, controls.sonify3d, controls.surfaceDepth, onSample);

canvas.addEventListener("pointermove", track);
canvas.addEventListener("pointerenter", track);
canvas.addEventListener("pointerleave", () => onSample(null));

/* ---------------- bone map ---------------- */

/**
 * The volume as the normalised float grid the bone filter expects.
 *
 * The filter reasons about air, tissue and the sheets between them, so it needs
 * intensity on a common 0..1 scale rather than whatever the scanner wrote.
 */
function gridFromVolume(vol: (typeof nv.volumes)[0]): Grid | null {
  const hdr = vol.hdr;
  const img = vol.img;
  if (!hdr || !img) return null;

  const dims = [hdr.dims[1], hdr.dims[2], hdr.dims[3]] as const;
  const count = dims[0] * dims[1] * dims[2];
  // A 4D series has more voxels than one frame; the first frame is what shows.
  if (!(count > 0) || img.length < count) return null;

  const lo = vol.global_min ?? 0;
  const hi = vol.global_max ?? 1;
  const span = hi > lo ? hi - lo : 1;

  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) data[i] = (img[i] - lo) / span;

  return {
    data,
    dims,
    zoom: [
      Math.abs(hdr.pixDims[1]) || 1,
      Math.abs(hdr.pixDims[2]) || 1,
      Math.abs(hdr.pixDims[3]) || 1,
    ],
  };
}

/**
 * Builds the bone map for the loaded volume, if a condition wants one.
 *
 * Only the conditions that tap on bone pay for it, and only once per volume:
 * switching away and back reuses the map, since switching does not reload.
 */
function ensureBoneMap(): void {
  if (!active.channels.bone || boneMap || bonePending) return;

  const vol = nv.volumes[0];
  if (!vol) return;
  const grid = gridFromVolume(vol);
  if (!grid) return;

  boneWorker ??= new Worker(new URL("./boneness.worker.ts", import.meta.url), {
    type: "module",
  });

  const token = ++boneToken;
  bonePending = true;
  readout.status("finding bone…");

  boneWorker.onmessage = (event: MessageEvent<BoneReply>) => {
    if (event.data.token !== boneToken) return;
    boneRaw = event.data.map;
    applySpike();
    bonePending = false;
    readout.status("ready");
  };

  const request: BoneRequest = { token, grid };
  boneWorker.postMessage(request, [grid.data.buffer]);
}

/** Re-widens the map for the current probe reach. */
function applySpike(): void {
  boneMap = boneRaw ? reach(boneRaw, controls.spike) : null;
}

el<HTMLInputElement>("spike").addEventListener("input", applySpike);

/** A new volume invalidates the map, and any reply still in flight for the old one. */
function resetBoneMap(): void {
  boneMap = null;
  boneRaw = null;
  bonePending = false;
  boneToken++;
  ensureBoneMap();
}

/* ---------------- clip plane ---------------- */

/**
 * Cuts the near side off the render so the pointer can reach inside the head.
 *
 * On a whole-head scan the scalp and skull wrap everything, and the depth
 * picker stops at the first voxel the renderer shows — so hovering the render
 * can only ever sound the outside. The picking shader honours clip planes
 * (`clipSampleRange` skips clipped samples), so cutting the near half away puts
 * brain under the pointer instead. Nothing about the sonification changes: the
 * rhythm channel keeps reading opacity off whatever voxel the cut exposes.
 *
 * The plane tracks the camera rather than sitting in volume space, so the
 * opening stays facing the viewer instead of rotating out of sight.
 */
function applyClip(): void {
  const cut = controls.clip;
  if (!(cut > 0)) {
    nv.setClipPlane([CLIP_OFF, 0, 0]);
    return;
  }
  const depth = CLIP_GRAZE + cut * (CLIP_DEEPEST - CLIP_GRAZE);
  // The plane's normal points *away* from the camera at the camera's own
  // angles, which cuts the far side and leaves the near surface — the part in
  // the way — untouched. Flipping the normal opens the head towards the viewer.
  nv.setClipPlane([depth, nv.scene.renderAzimuth + 180, -nv.scene.renderElevation]);
}

el<HTMLInputElement>("clip").addEventListener("input", applyClip);
nv.onAzimuthElevationChange = () => {
  if (controls.clip > 0) applyClip();
};

/* ---------------- volume loading ---------------- */

/** Prefer the display window; fall back to the full data range. */
function refreshRange(): void {
  const vol = nv.volumes[0];
  if (!vol) return;

  let lo = vol.cal_min ?? NaN;
  let hi = vol.cal_max ?? NaN;
  if (!(hi > lo)) {
    lo = vol.global_min ?? NaN;
    hi = vol.global_max ?? NaN;
  }
  range = hi > lo ? { lo, hi } : DEFAULT_RANGE;
  bounds = boundsFromFrac((frac) => nv.frac2mm(frac));
  lut = cmapper.colormap(vol.colormap, vol.colormapInvert);
  lutPeak = peakAlpha(lut);
  readout.status("ready");
  resetBoneMap();
}

async function loadFile(file: File): Promise<void> {
  try {
    await nv.loadFromFile(file);
  } catch {
    await nv.loadVolumes([{ url: URL.createObjectURL(file), name: file.name }]);
  }
  refreshRange();
}

el<HTMLInputElement>("file").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void loadFile(file);
});

function wireDemo(id: keyof typeof DEMO_VOLUMES): HTMLButtonElement {
  const { label, url } = DEMO_VOLUMES[id];
  const button = el<HTMLButtonElement>(id);

  button.addEventListener("click", async () => {
    button.textContent = "Loading…";
    try {
      await nv.loadVolumes([{ url, colormap: "gray" }]);
      refreshRange();
      button.textContent = label;
    } catch {
      button.textContent = "Load failed (offline?)";
    }
  });

  return button;
}

const demoBtn = wireDemo("demo");
wireDemo("demoHead");

/* ---------------- drag and drop ---------------- */

const body = document.body;
for (const type of ["dragenter", "dragover"] as const) {
  body.addEventListener(type, (e) => {
    e.preventDefault();
    body.classList.add("dragging");
  });
}
for (const type of ["dragleave", "drop"] as const) {
  body.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === "drop" || e.target === body) body.classList.remove("dragging");
  });
}
body.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});

// Something on screen from the first frame; the user can swap in their own volume.
demoBtn.click();
