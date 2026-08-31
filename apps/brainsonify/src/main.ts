import { Niivue } from "@niivue/niivue";

import {
  DEFAULT_RANGE,
  Sonifier,
  frequency,
  normalise,
  type IntensityRange,
} from "@brainsonify/sonification";

import "./styles.css";
import { VoxelSampler, type Sample } from "./sampler";
import { Controls, Readout, el } from "./ui";

const DEMO_VOLUME = "https://niivue.github.io/niivue-demo-images/mni152.nii.gz";

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

// Dev-only handle so the picking path can be poked from a console:
// `nv.selectedObjectId` should read 254 (VOLUME_ID) after hovering tissue on
// the render, and flipping `nv.opts.show3Dcrosshair` reproduces the shadowed
// pick the sampler works around.
if (import.meta.env.DEV) {
  (window as unknown as { nv: Niivue }).nv = nv;
}

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

  readout.show(sample.raw, norm, freq, sample.mm, sample.source);
  sonifier.update(freq, norm > c.gate, c);
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

const demoBtn = el<HTMLButtonElement>("demo");
demoBtn.addEventListener("click", async () => {
  demoBtn.textContent = "Loading…";
  try {
    await nv.loadVolumes([{ url: DEMO_VOLUME, colormap: "gray" }]);
    refreshRange();
    demoBtn.textContent = "Load MNI152 demo";
  } catch {
    demoBtn.textContent = "Load failed (offline?)";
  }
});

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
