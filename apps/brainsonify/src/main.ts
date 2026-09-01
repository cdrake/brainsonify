import { Niivue, cmapper } from "@niivue/niivue";

import {
  DEFAULT_BOUNDS,
  DEFAULT_RANGE,
  DEFAULT_TAPS,
  Sonifier,
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
import { VoxelSampler, type Sample } from "./sampler";
import { Controls, ExperimentNav, Readout, applyChannels, el } from "./ui";

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
  sonifier.silence();

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

  const opacity = relativeOpacity(opacityFromLut(lut, norm), lutPeak);
  const taps = active.channels.rhythm
    ? tapRate(opacity, { slowest: DEFAULT_TAPS.slowest, fastest: c.taps })
    : 0;

  readout.show({
    raw: sample.raw,
    norm,
    freq,
    mm: sample.mm,
    pan: position,
    opacity,
    taps,
    source: sample.source,
  });
  sonifier.update({ freq, pan: position, taps, open: norm > c.gate }, c);
}

const canvas = el<HTMLCanvasElement>("gl");
const track = (e: PointerEvent) =>
  sampler.sample(e.offsetX, e.offsetY, controls.sonify3d, controls.surfaceDepth, onSample);

canvas.addEventListener("pointermove", track);
canvas.addEventListener("pointerenter", track);
canvas.addEventListener("pointerleave", () => onSample(null));

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
