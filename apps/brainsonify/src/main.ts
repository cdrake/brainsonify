import { Niivue, cmapper } from "@niivue/niivue";

import {
  DEFAULT_BOUNDS,
  DEFAULT_RANGE,
  DEFAULT_TAPS,
  Sonifier,
  anteriority,
  contrast,
  boundsFromFrac,
  elevation,
  frequency,
  normalise,
  opacityFromLut,
  pan,
  peakAlpha,
  relativeOpacity,
  soundKey,
  tapRate,
  type Bounds,
  type IntensityRange,
} from "@brainsonify/sonification";

import "./styles.css";
import { RegionCallout, loadAtlas, type Atlas } from "./atlas";
import {
  EXPERIMENTS,
  experimentHref,
  resolveExperiment,
  type Experiment,
} from "./experiments";
import { bonenessAt, densestVoxel, reach, type BoneMap, type Grid } from "./boneness";
import type { BoneReply, BoneRequest } from "./boneness.worker";
import { VoxelSampler, type Sample } from "./sampler";
import { KeyPlayer, browserSpeech } from "./soundkey";
import { Controls, ExperimentNav, Readout, applyChannels, el } from "./ui";

/**
 * Clip depth is a signed distance from the center of the volume: NiiVue treats
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
  demo: { label: "Load MNI152 demo", url: `${DEMOS}mni152.nii.gz`, mni: true },
  demoHead: { label: "Load head + skull T1", url: `${DEMOS}chris_t1.nii.gz`, mni: false },
} as const;

const controls = new Controls();
const readout = new Readout();
const sonifier = new Sonifier();
const key = new KeyPlayer(sonifier, el("keyCaption"), browserSpeech());
const callout = new RegionCallout(browserSpeech());

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

let atlas: Atlas | null = null;
let atlasPending = false;
/**
 * Whether the loaded scan is in the atlas's space. The MNI152 demo is. The
 * whole-head T1 is one person in scanner space and is not, so looking it up
 * would name regions that are not there. A file dropped in is assumed to be
 * MNI: that is the case worth supporting, and the panel says so.
 */
let atlasFits = true;

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
  if (experiment.mode) controls.setMode(experiment.mode);
  key.cancel();
  callout.leave();
  sonifier.silence();

  ensureBoneMap();
  ensureAtlas();
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
const keyBtn = el<HTMLButtonElement>("keyBtn");

audioBtn.addEventListener("click", async () => {
  const on = await sonifier.toggle();
  audioBtn.textContent = on ? "Sound on" : "Enable sound";
  audioBtn.classList.toggle("on", on);
  audioBtn.classList.toggle("primary", !on);
  keyBtn.disabled = !on;
  // Enabling sound is the one moment the listener is certainly waiting for
  // something and has not yet hovered: the key plays here, unasked, every
  // time. Hovering cuts it short for anyone who already knows it.
  if (on) playKey();
  else {
    key.cancel();
    callout.leave();
  }
});

keyBtn.addEventListener("click", playKey);

/**
 * Plays the key for the active condition at the panel's current settings.
 *
 * Built fresh each time rather than once per condition, so moving `Low`,
 * `Octaves`, `Stereo` or `Taps` changes what the key demonstrates: it is a
 * key to the sound as configured, not to the defaults.
 */
function playKey(): void {
  const c = controls.values;
  const channels = active.channels;
  const steps = soundKey(
    {
      stereo: channels.stereo,
      taps: channels.bone ? "bone" : channels.rhythm ? "opacity" : "off",
      depth: channels.depth,
      height: channels.height,
    },
    {
      mode: c.mode,
      lowHz: c.lowHz,
      octaves: c.octaves,
      width: c.width,
      taps: { slowest: active.taps?.slowest ?? DEFAULT_TAPS.slowest, fastest: c.taps },
    },
  );
  void key.play(steps, c);
}

/* ---------------- sonification ---------------- */

/**
 * The line from a sampled voxel to the densest bone the probe actually found
 * there, in world millimeters. Null off the bone channel entirely, and null
 * when nothing within reach cleared zero — a real "nothing here" is drawn as
 * nothing, not as a line to the voxel itself.
 */
let spike: { from: [number, number, number]; to: [number, number, number] } | null = null;

function onSample(sample: Sample | null): void {
  // A hover means the listener wants the real thing; the key gets out of
  // the way rather than fighting it for the voice.
  if (sample) key.cancel();
  if (!sample) {
    readout.clear();
    callout.leave();
    sonifier.silence();
    if (spike) {
      spike = null;
      scheduleOverlayDraw();
    }
    return;
  }

  const c = controls.values;
  const norm = normalise(sample.raw, range);
  const freq = frequency(norm, c.lowHz, c.octaves);
  const position = active.channels.stereo ? pan(sample.mm[0], bounds.x, c.width) : 0;
  // World Y is the anterior-posterior axis. It rides the tap rather than the
  // tone: the cue is spectral, and a click carries a spectral cue where a
  // sustained sine would only change color.
  const front = active.channels.depth ? anteriority(sample.mm[1], bounds.y, c.spread) : 0;
  const height = active.channels.height ? elevation(sample.mm[2], bounds.z) : 0;

  const opacity = relativeOpacity(opacityFromLut(lut, norm), lutPeak);
  const region = active.channels.atlas && atlas && atlasFits ? atlas.regionAt(sample.mm) : null;
  // Spoken only while sound is on. Enabling sound is the gesture the browser
  // wants before it will speak at all, and a name over silence would be the
  // app talking when it has otherwise been told to be quiet.
  if (sonifier.running) callout.enter(region);
  else callout.leave();
  const bone = boneMap ? bonenessAt(boneMap, ...sample.vox) : null;

  const spikeVox = active.channels.bone && boneMap ? densestVoxel(boneMap, ...sample.vox) : null;
  const nextSpike = spikeVox
    ? { from: sample.mm, to: mmOf(spikeVox) }
    : null;
  if (nextSpike || spike) {
    spike = nextSpike;
    scheduleOverlayDraw();
  }

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
    height,
    opacity,
    bone,
    taps,
    source: sample.source,
    region: atlas && atlasFits ? region : undefined,
  });
  // Muting the tone only makes sense where there is a tap layer to be left
  // with; in a condition that does not tap it would just be silence.
  const mode = tapping && controls.tapsOnly ? "taps" : c.mode;
  sonifier.update(
    { freq, pan: position, depth: front, height, taps, open: norm > c.gate },
    { ...c, mode },
  );
}

/* ---------------- spike overlay ---------------- */

/** World millimeters for a full-resolution voxel index, via the same round-trip `sampler.ts` uses. */
function mmOf(vox: [number, number, number]): [number, number, number] {
  const mm = nv.frac2mm(nv.vox2frac(vox));
  return [mm[0], mm[1], mm[2]];
}

/** Distinct from the crosshair's own blue, so the two are never mistaken for each other. */
const SPIKE_COLOR = [1, 0.6, 0.15, 0.9];

let overlayQueued = false;

/**
 * Redraws on the next frame rather than synchronously, so a fast sweep across
 * a tile costs one redraw per frame rather than one per pointer event.
 */
function scheduleOverlayDraw(): void {
  if (overlayQueued) return;
  overlayQueued = true;
  requestAnimationFrame(() => {
    overlayQueued = false;
    nv.drawScene();
    drawSpikeOverlay();
  });
}

/**
 * Projects a world point onto one 2D tile's own plane, ignoring how far out
 * of that tile's currently-shown slice the point actually sits.
 *
 * NiiVue's own `frac2canvasPos` refuses a point more than ~2mm from the slice
 * a tile is currently showing — the right call for its own click-to-measure
 * ruler, where both ends are meant to be on one slice, but wrong here: the
 * whole reason to draw this line is that the probe found bone somewhere the
 * sampled slice does not show. The math below is the same affine map
 * `frac2canvasPos` uses (`leftTopMM`/`fovMM`/`leftTopWidthHeight` off
 * `nv.screenSlices`), just without its distance-to-slice check — an
 * orthographic projection onto the tile's plane, a shadow rather than a
 * literal point. Null only when the point falls outside the tile's own
 * field of view, not when it is merely on a different slice.
 */
function projectToTile(mm: [number, number, number], tile: (typeof nv.screenSlices)[number]): [number, number] | null {
  // Coronal and sagittal tiles show a different pair of world axes than
  // their own screen X/Y; axial needs no swizzle.
  const [x, y] =
    tile.axCorSag === 1 ? [mm[0], mm[2]] : tile.axCorSag === 2 ? [mm[1], mm[2]] : [mm[0], mm[1]];

  const fracX = (x - tile.leftTopMM[0]) / tile.fovMM[0];
  const fracY = (y - tile.leftTopMM[1]) / tile.fovMM[1];
  if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) return null;

  const ltwh = [...tile.leftTopWidthHeight];
  let mirror = false;
  if (ltwh[2] < 0) {
    mirror = true;
    ltwh[0] += ltwh[2];
    ltwh[2] = -ltwh[2];
  }
  const screenFracX = mirror ? 1 - fracX : fracX;
  const screenFracY = 1 - fracY;
  return [ltwh[0] + screenFracX * ltwh[2], ltwh[1] + screenFracY * ltwh[3]];
}

/**
 * Draws a line from the sampled voxel to the densest bone the probe actually
 * found, on every 2D tile that shows it.
 *
 * 2D tiles only (`axCorSag > 2` is the render tile). Drawing on the render
 * tile too would need its own camera's model-view-projection matrix, which
 * NiiVue builds fresh inside its own draw call and does not hand back out;
 * reconstructing it is more reverse-engineering than a first pass is worth.
 * The 2D tiles stay visible during a render hover too, so the line is not
 * lost, only not drawn on top of the render itself.
 *
 * Drawn as a follow-up call after `nv.drawScene()` rather than from inside
 * it, so this line survives every redraw *this app* triggers. It does not
 * survive a redraw NiiVue triggers on its own — dragging to rotate or
 * zoom — since nothing here runs again until the next sampled voxel. That is
 * a real, accepted gap: the overlay is a hover aid, and hovering is exactly
 * what puts it back.
 */
function drawSpikeOverlay(): void {
  if (!spike) return;
  for (const tile of nv.screenSlices) {
    if (tile.axCorSag > 2) continue;
    const a = projectToTile(spike.from, tile);
    const b = projectToTile(spike.to, tile);
    if (!a || !b) continue;
    nv.drawLine([a[0], a[1], b[0], b[1]], 2, SPIKE_COLOR);
  }
}

const canvas = el<HTMLCanvasElement>("gl");
const track = (e: PointerEvent) =>
  sampler.sample(e.offsetX, e.offsetY, controls.sonify3d, controls.surfaceDepth, onSample);

const crosshairStep = el<HTMLSelectElement>("crosshairStep");
const crosshairStatus = el("crosshairStatus");

function nudgeCrosshair(axis: number, direction: number): void {
  const position = nv.scene.crosshairPos;
  position[axis] = Math.min(1, Math.max(0, position[axis] + direction * Number(crosshairStep.value)));
  nv.drawScene();
  sampler.sampleFraction(position, onSample);
  const axisName = ["left/right", "back/forward", "down/up"][axis];
  const directionName = direction < 0 ? axisName.split("/")[0] : axisName.split("/")[1];
  crosshairStatus.textContent = `Crosshair moved ${directionName}.`;
}

function centerCrosshair(): void {
  const position = nv.scene.crosshairPos;
  position[0] = 0.5;
  position[1] = 0.5;
  position[2] = 0.5;
  nv.drawScene();
  sampler.sampleFraction(position, onSample);
  crosshairStatus.textContent = "Crosshair centered.";
}

const centerButton = document.querySelector<HTMLButtonElement>('[data-crosshair-action="center"]');
if (!centerButton) throw new Error('missing center crosshair button');
centerButton.addEventListener("click", centerCrosshair);

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-crosshair-axis]")) {
  button.addEventListener("click", () => {
    nudgeCrosshair(Number(button.dataset.crosshairAxis), Number(button.dataset.crosshairDelta));
  });
  button.addEventListener("keydown", (event) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [2, 1],
      ArrowDown: [2, -1],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      PageUp: [1, 1],
      PageDown: [1, -1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    nudgeCrosshair(...move);
  });
}

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

/* ---------------- atlas ---------------- */
/**
 * Fetches the atlas the first time a condition asks for it, and keeps it: it
 * belongs to no volume, so a new scan does not invalidate it.
 */
function ensureAtlas(): void {
  if (!active.channels.atlas || atlas || atlasPending) return;
  atlasPending = true;
  readout.region("loading atlas…");
  loadAtlas().then(
    (loaded) => {
      atlas = loaded;
      atlasPending = false;
      readout.region(atlasFits ? null : "off: not an MNI scan");
    },
    () => {
      atlasPending = false;
      readout.region("atlas failed (offline?)");
    },
  );
}

/* ---------------- clip plane ---------------- */

/**
 * Cuts the near side off the render so the pointer can reach inside the head.
 *
 * On a whole-head scan the scalp and skull wrap everything, and the depth
 * picker stops at the first voxel the renderer shows — so hovering the render
 * can only ever sound the outside. The picking shader honors clip planes
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
  readout.region(atlasFits ? null : "off: not an MNI scan");
  resetBoneMap();
}

async function loadFile(file: File): Promise<void> {
  try {
    await nv.loadFromFile(file);
  } catch {
    await nv.loadVolumes([{ url: URL.createObjectURL(file), name: file.name }]);
  }
  atlasFits = true;
  refreshRange();
}

el<HTMLInputElement>("file").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void loadFile(file);
});

function wireDemo(id: keyof typeof DEMO_VOLUMES): HTMLButtonElement {
  const { label, url, mni } = DEMO_VOLUMES[id];
  const button = el<HTMLButtonElement>(id);

  button.addEventListener("click", async () => {
    button.textContent = "Loading…";
    try {
      await nv.loadVolumes([{ url, colormap: "gray" }]);
      atlasFits = mni;
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
