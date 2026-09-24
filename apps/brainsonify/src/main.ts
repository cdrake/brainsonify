import { MULTIPLANAR_TYPE, NiiVue, SHOW_RENDER, SLICE_TYPE, lookupColorMap } from "@niivue/niivue";

import { ControlAPI, ControlSurface, type ControlState, type KnobScene } from "@brainsonify/control";
import {
  PLANE_ANGLES,
  PLANE_OFF,
  cameraForPlane,
  clipNormal,
  depthThrough,
  matchRegion,
  regionMentions,
  resolvePlane,
} from "niivue-mcp";

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
import { AgentController, type AgentScene, agentUrls } from "./controllers/agent";
import { VirtualController } from "./controllers/virtual";
import {
  EXPERIMENTS,
  experimentHref,
  resolveExperiment,
  type Experiment,
} from "./experiments";
import { bonenessAt, densestVoxel, reach, type BoneMap, type Grid } from "./boneness";
import type { BoneReply, BoneRequest } from "./boneness.worker";
import { type PlanarLayout, planarLayout } from "./layout";
import { VoxelSampler, type Sample } from "./sampler";
import { colormapLut, projectToCanvas, vox2mm } from "./geometry";
import { START, advance, cutFace, facePoint, type Raster } from "./sweep";
import { KeyPlayer, browserSpeech } from "./soundkey";
import { Controls, ExperimentNav, Readout, applyChannels, el, spokenPosition } from "./ui";

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

const nv = new NiiVue({
  backgroundColor: [0, 0, 0, 1],
  crosshairColor: [0.15, 0.6, 1, 1],
  is3DCrosshairVisible: true,
  // The render tile is where the cut face is, so it is the tile a session
  // is run from. Left on AUTO, NiiVue drops it whenever the canvas is wide
  // and short enough that three planar tiles fill a row; ALWAYS keeps it
  // in the layout at every aspect ratio, smaller when it must be.
  showRender: SHOW_RENDER.ALWAYS,
  // NiiVue 1.0 ships the v key (cycle axial, coronal, sagittal, multiplanar,
  // render) switched off, and a press then only logs the version.
  isViewModeHotKeyEnabled: true,
});
nv.attachTo("gl");

const LAYOUTS: Record<PlanarLayout, number> = {
  row: MULTIPLANAR_TYPE.ROW,
  grid: MULTIPLANAR_TYPE.GRID,
  column: MULTIPLANAR_TYPE.COLUMN,
};

const stage = el("stage");
/**
 * NiiVue's canvas, looked up each time rather than kept. Attaching can swap
 * in a fresh element: a canvas that has held a WebGPU context cannot take a
 * WebGL2 one, so where WebGPU is missing NiiVue falls back by cloning the
 * canvas and replacing it, and a reference taken earlier is left detached.
 * Pointer listeners go on the stage for the same reason; the canvas fills it,
 * and nothing else in it takes the pointer.
 */
function glCanvas(): HTMLCanvasElement {
  return nv.canvas ?? el<HTMLCanvasElement>("gl");
}

/**
 * Sizes the canvas to the stage and lays the tiles out for its shape: a row
 * when it is wide, a column when it is tall, a grid otherwise. NiiVue's own
 * AUTO decides from the three planar tiles alone (see layout.ts), so the
 * choice is made here instead.
 *
 * The sizing is done here too, rather than left to NiiVue. NiiVue resizes
 * the canvas's drawing buffer only from its resize observer, and only on the
 * next animation frame; a page that is not visible (a browser pane kept in
 * the background) gets neither, so the buffer stays at the size measured
 * when the canvas was attached, the tiles are laid out for that size, and
 * the browser stretches the picture into the stage: a cropped slice. Sizing
 * synchronously, and checking again before anything is drawn for someone,
 * means the buffer matches the stage whether or not a frame ever ran.
 */
function fitCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const layout = LAYOUTS[planarLayout(stage.clientWidth, stage.clientHeight)];
  const canvas = glCanvas();
  const fitted =
    canvas.width === Math.floor(canvas.offsetWidth * dpr) &&
    canvas.height === Math.floor(canvas.offsetHeight * dpr) &&
    nv.multiplanarType === layout;
  if (fitted) return;
  nv.multiplanarType = layout;
  nv.resize();
  scheduleOverlayDraw();
}
new ResizeObserver(fitCanvas).observe(stage);
window.addEventListener("resize", fitCanvas);
document.addEventListener("visibilitychange", fitCanvas);

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
/** The fetch in flight, shared by whoever asks while it is, and dropped when it fails so a retry is possible. */
let atlasLoading: Promise<Atlas> | null = null;
/**
 * Whether the loaded scan is in the atlas's space. The MNI152 demo is. The
 * whole-head T1 is one person in scanner space and is not, so looking it up
 * would name regions that are not there. A file dropped in is assumed to be
 * MNI: that is the case worth supporting, and the panel says so.
 */
let atlasFits = true;

/**
 * Whether the radar sweep is currently driving the crosshair and the sound on
 * its own. Declared up here, ahead of the sweep itself, because entering a
 * condition needs to know: the sweep stops when a visitor moves to a
 * condition that does not offer it.
 */
let sweeping = false;
/** Identifies one sweep run, so a stopped run's own stale rAF loop knows to stop rather than keep going. */
let sweepToken = 0;

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
// `await nv.view.depthPick(x, y)` is the pick the render hover makes, in
// canvas pixels. The tap layer schedules ahead on the audio clock, so
// `sonifier.rate` is the only way to see it responding to a hover.
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
  if (experiment.clip) nv.setClipPlane(experiment.clip);
  // The sweep belongs to the conditions that offer it; a run left going
  // across a switch would keep sounding a condition the visitor has left.
  el("sweepRow").hidden = !experiment.sweep;
  if (experiment.sweep) controls.setSweepPace(experiment.sweep);
  else if (sweeping) stopSweep();
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

/**
 * Where the currently sampled voxel is, in world millimeters. Unlike
 * `spike`, this is not tied to any one channel -- it exists in every
 * condition, since it answers a question a sighted technician always has
 * during a session: where on screen is the sound the listener is hearing
 * actually coming from. Set from two sources: an ordinary hover, or the
 * radar sweep below driving the crosshair across the cut face on its own.
 * Drawn as a single line across every tile that shows it (see
 * `drawScanLineOverlay`) rather than a crosshair-shaped pair, so it reads
 * from across a room as one clear line, the way a radar sweep reads as one
 * line and not a plus sign.
 */
let scanPoint: [number, number, number] | null = null;

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
    if (scanPoint) {
      scanPoint = null;
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

  scanPoint = sample.mm;

  const spikeVox = active.channels.bone && boneMap ? densestVoxel(boneMap, ...sample.vox) : null;
  const nextSpike = spikeVox
    ? { from: sample.mm, to: mmOf(spikeVox) }
    : null;
  spike = nextSpike;
  // scanPoint moves on every live sample, so this now runs every hover
  // regardless of whether the spike line itself changed.
  scheduleOverlayDraw();

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

/* ---------------- overlays: spike + scan line ---------------- */

/** World millimeters for a full-resolution voxel index, via the same affine `sampler.ts` uses. */
function mmOf(vox: [number, number, number]): [number, number, number] {
  const matRAS = nv.volumes[0]?.matRAS;
  return matRAS ? vox2mm(matRAS, vox) : [0, 0, 0];
}

/** Distinct from the crosshair's own blue, so the two are never mistaken for each other. */
const SPIKE_COLOR = "rgba(255, 153, 38, 0.9)";
/** Distinct from both the crosshair's blue and the spike's orange. */
const SCAN_LINE_COLOR = "rgba(255, 38, 217, 0.85)";
const SCAN_LINE_WIDTH = 1;

const overlay = el<HTMLCanvasElement>("overlay");
const overlayContext = overlay.getContext("2d");

let overlayQueued = false;

/**
 * Asks NiiVue for a frame and redraws the lines over it. NiiVue coalesces
 * its own frames, and so does this, so a fast sweep across a tile costs one
 * redraw per frame rather than one per pointer event.
 */
function scheduleOverlayDraw(): void {
  nv.drawScene();
  queueOverlay();
}

/**
 * Redraws the lines once NiiVue has drawn its next frame.
 *
 * Two animation frames out, not one: NiiVue renders from an animation frame
 * of its own, and whether that one was queued before or after this depends on
 * who asked first. A frame later, the tiles' cameras are the ones just drawn
 * with whichever order it was.
 */
function queueOverlay(): void {
  if (overlayQueued) return;
  overlayQueued = true;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      overlayQueued = false;
      drawOverlays();
    }),
  );
}

/** One tile of the frame NiiVue just drew. */
type Tile = ReturnType<typeof nv.getScreenTiles>[number];

/**
 * Where a world point lands on a tile, through the camera NiiVue drew that
 * tile with. The 2D tiles are orthographic, so a point off the slice a tile
 * shows still lands on it, as a shadow on the tile's plane rather than a
 * literal point. That is what the spike needs: the whole reason to draw it is
 * that the probe found bone somewhere the sampled slice does not show. Null
 * when the point is off the tile, or behind the render camera.
 */
function project(mm: [number, number, number], tile: Tile): [number, number] | null {
  if (!tile.mvpMatrix || !tile.leftTopWidthHeight) return null;
  return projectToCanvas(mm, tile.mvpMatrix, tile.leftTopWidthHeight);
}

function strokeLine(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number]): void {
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

/**
 * Redraws both lines over the frame NiiVue has just finished.
 *
 * They go on a transparent canvas stacked over NiiVue's rather than into
 * NiiVue's own frame. 1.0 has no line call, and its overlay hook hands over a
 * raw WebGPU pass (and is not called at all on WebGL2), which is a lot of
 * pipeline for two lines.
 */
function drawOverlays(): void {
  if (!overlayContext) return;
  const canvas = glCanvas();
  if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
    overlay.width = canvas.width;
    overlay.height = canvas.height;
  }
  overlayContext.clearRect(0, 0, overlay.width, overlay.height);
  const tiles = nv.getScreenTiles();
  drawSpikeOverlay(overlayContext, tiles);
  drawScanLineOverlay(overlayContext, tiles);
}

// Frames NiiVue draws on its own account move the tiles too: a drag to
// rotate or zoom, a resize, a cut. Following them keeps the lines on the
// picture rather than left where it was.
for (const type of ["azimuthElevationChange", "change", "canvasResize", "clipPlaneChange"] as const) {
  nv.addEventListener(type, queueOverlay);
}

/**
 * Draws a line from the sampled voxel to the densest bone the probe actually
 * found, on every 2D tile that shows it.
 *
 * 2D tiles only, though the render tile can be projected onto as well (the
 * scan line below is): the spike is a bone-channel aid, not the general
 * "where is the sound" indicator that line is. The 2D tiles stay visible
 * during a render hover too, so the line is not lost, only not drawn on top
 * of the render itself.
 */
function drawSpikeOverlay(ctx: CanvasRenderingContext2D, tiles: readonly Tile[]): void {
  if (!spike) return;
  ctx.strokeStyle = SPIKE_COLOR;
  ctx.lineWidth = 2;
  for (const tile of tiles) {
    if (tile.axCorSag === SLICE_TYPE.RENDER) continue;
    const a = project(spike.from, tile);
    const b = project(spike.to, tile);
    if (a && b) strokeLine(ctx, a, b);
  }
}

/**
 * Draws one line through the sampled point, on every tile that shows it,
 * the render tile included. One line, not a crosshair pair: this reads as a
 * radar-style sweep line, at a glance, from across the room -- which a
 * pair of crossing lines reads as a target reticle instead. The line is the
 * line being read: while the sweep runs it is drawn from where the current
 * line began to where the sweep has got, growing like the beam of a
 * scanner along whichever way the lines run, so a technician can
 * see where along the line the sound is coming from -- the spike only
 * marks the point when there is bone within reach, and soft tissue would
 * otherwise leave no mark at all. An ordinary hover draws a single
 * horizontal line, full width, at whatever height it is currently over, so
 * the line means the same thing whether the sweep or the pointer put it
 * there.
 */
function drawScanLineOverlay(ctx: CanvasRenderingContext2D, tiles: readonly Tile[]): void {
  if (!scanPoint) return;
  ctx.strokeStyle = SCAN_LINE_COLOR;
  ctx.lineWidth = SCAN_LINE_WIDTH;
  for (const tile of tiles) {
    const point = project(scanPoint, tile);
    if (!point || !tile.leftTopWidthHeight) continue;
    const [x, y] = point;
    if (sweeping && sweepLineStart) {
      // The line being read, from where it began to where the sweep has
      // got: along whichever cardinal direction the lines run.
      const from = project(sweepLineStart, tile);
      if (from) strokeLine(ctx, from, point);
      continue;
    }
    const [left, , width] = tile.leftTopWidthHeight;
    strokeLine(ctx, [left, y], [sweeping ? x : left + width, y]);
  }
}

const track = (e: PointerEvent) => {
  // The sweep below is driving the crosshair on its own; a stray hover
  // fighting it for the same sample would make both illegible.
  if (sweeping) return;
  sampler.sample(e.clientX, e.clientY, controls.sonify3d, controls.surfaceDepth, onSample);
};

const crosshairStep = el<HTMLSelectElement>("crosshairStep");
const crosshairStatus = el("crosshairStatus");
const sweepBtn = el<HTMLButtonElement>("sweepBtn");

/** Moves the crosshair along one axis by a signed fraction of the volume, and sounds where it lands. */
function moveCrosshair(axis: number, delta: number): void {
  const position = nv.crosshairPos;
  position[axis] = Math.min(1, Math.max(0, position[axis] + delta));
  nv.drawScene();
  sampler.sampleFraction(position, onSample);
}

/** The panel's buttons: one step of the chosen size in one direction. */
function nudgeCrosshair(axis: number, direction: number): void {
  moveCrosshair(axis, direction * Number(crosshairStep.value));
  const axisName = ["left/right", "back/forward", "down/up"][axis];
  const directionName = direction < 0 ? axisName.split("/")[0] : axisName.split("/")[1];
  crosshairStatus.textContent = `Crosshair moved ${directionName}.`;
}

function centerCrosshair(): void {
  const position = nv.crosshairPos;
  position[0] = 0.5;
  position[1] = 0.5;
  position[2] = 0.5;
  nv.drawScene();
  sampler.sampleFraction(position, onSample);
  crosshairStatus.textContent = "Crosshair centered.";
}

/* ---------------- radar sweep ---------------- */

/** Where on the face the sweep has got to. Starts at the top left, the way a page is read. */
let raster: Raster = START;
/** Whether the last frame was in the silence between lines, so the silence is asked for once, not every frame. */
let sweepResting = false;
/**
 * Where the line the sweep is on begins, in world millimeters, so the scan
 * line can be drawn from there to the sampled point whichever way the
 * lines run. Null while resting or when the sweep is not running.
 */
let sweepLineStart: [number, number, number] | null = null;

/**
 * One frame of the sweep: moves along the current line by real elapsed
 * time (not a fixed step per frame, so a line takes as many seconds as the
 * `Line` slider says regardless of frame rate), steps down to the next line
 * when this one runs off the right edge, wraps to the top after the bottom
 * one, and samples there -- the exact call `nudgeCrosshair` already makes
 * by hand, just timed and automatic instead of one press at a time. The
 * pace is read off the sliders every frame, so moving one mid-sweep takes
 * effect on the next frame rather than the next run. A rest between lines
 * is silence: the sweep is at the start of the next line and not sounding,
 * the same "nothing under the pointer" a pointer leaving the canvas is.
 *
 * The face is read afresh every frame from NiiVue's own clip plane rather
 * than once at the start, so the sweep follows the plane when the wheel
 * nudges its depth or `c` jumps it to another preset mid-run: the sweep
 * reads whatever is cut right now, the way the pointer would.
 *
 * The crosshair is moved to the sampled point, so the blue crosshair on
 * every tile follows the sweep and the sampled voxel is the one under it.
 * The sample goes through `onSample` like any hover, so the bone spike's
 * reach is in play: a line across soft tissue still taps where bone sits
 * within the `Spike` distance behind the face.
 *
 * Deliberately does not call `nv.drawScene()` itself, unlike
 * `nudgeCrosshair`: `onSample` below always calls `scheduleOverlayDraw()`
 * for a live sample, which does its own `nv.drawScene()` immediately
 * followed by the overlay lines, as one atomic redraw. A second, independent
 * `drawScene()` call here would race that one every single frame -- one of
 * the two draws wins each tick depending on ordering, so the scan line gets
 * painted and then immediately overdrawn away before the browser ever shows
 * it, which reads as a flicker rather than a steady line.
 */
function sweepFrame(token: number, lastTime: number): void {
  requestAnimationFrame((now) => {
    if (!sweeping || token !== sweepToken) return;
    const dt = (now - lastTime) / 1000;
    const pace = controls.sweepPace;
    raster = advance(raster, dt, pace);
    const resting = raster.rest > 0;
    if (resting) {
      sweepLineStart = null;
      if (!sweepResting) onSample(null);
    } else {
      const position = nv.crosshairPos;
      const face = cutFace(clipPlaneVector(), position);
      const point = facePoint(face, raster.across, raster.line, pace.direction);
      const start = nv.model.scene2mm(facePoint(face, 0, raster.line, pace.direction));
      sweepLineStart = [start[0], start[1], start[2]];
      position[0] = point[0];
      position[1] = point[1];
      position[2] = point[2];
      sampler.sampleFraction(position, onSample);
    }
    sweepResting = resting;
    sweepFrame(token, now);
  });
}

function startSweep(): void {
  if (sweeping) return;
  sweeping = true;
  const token = ++sweepToken;
  // Every run starts at the top left, so a listener always hears a face
  // from its beginning rather than from wherever the last run was stopped.
  raster = START;
  sweepResting = false;
  sweepLineStart = null;
  sweepBtn.textContent = "Stop radar sweep";
  sweepBtn.setAttribute("aria-pressed", "true");
  crosshairStatus.textContent = "Radar sweep started.";
  sweepFrame(token, performance.now());
}

/**
 * Stops the sweep and silences, the same way a pointer leaving the canvas
 * does (`onSample(null)`) -- stopping is "nothing is under the pointer now"
 * for the sweep too, not a pause that leaves the last sweep tone hanging.
 */
function stopSweep(): void {
  if (!sweeping) return;
  sweeping = false;
  sweepToken++;
  sweepLineStart = null;
  sweepBtn.textContent = "Start radar sweep";
  sweepBtn.setAttribute("aria-pressed", "false");
  crosshairStatus.textContent = "Radar sweep stopped.";
  onSample(null);
}

sweepBtn.addEventListener("click", () => (sweeping ? stopSweep() : startSweep()));

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

/* ---------------- the knob ---------------- */

/**
 * The panel and the control API hold the same values, each following the
 * other. A hand on a slider reaches the API through the panel's change
 * listener; the knob reaches the panel through the API's. Neither loops:
 * a value already held is not written again, so each direction ends after
 * one hop.
 */
const api = new ControlAPI(controls.snapshot() as Partial<ControlState>);
controls.onChange((values) => api.setState(values as Partial<ControlState>));
api.onStateChange((event) => {
  const changed: Record<string, number | string | boolean> = {};
  for (const id of event.changedParameters) {
    changed[id] = event.currentState[id as keyof ControlState];
  }
  controls.apply(changed);
});

/**
 * The whole planes `c` cycles through, in NiiVue's own order, so the knob's
 * "next plane" and a `c` on the canvas walk the same ring. The position in
 * this list is NiiVue's `currentClipPlaneIndex`: off first, then posterior,
 * right, left, anterior, inferior, superior (the `C` case of its keydown
 * handler).
 */
const WHOLE_PLANES: ReadonlyArray<{ name: string; plane: [number, number, number] }> = [
  { name: "off", plane: [CLIP_OFF, 0, 0] },
  ...["posterior", "right", "left", "anterior", "inferior", "superior"].map((wanted) => {
    const { name, azimuth, elevation } = PLANE_ANGLES.find((p) => p.name === wanted)!;
    return { name, plane: [0, azimuth, elevation] as [number, number, number] };
  }),
];

/**
 * Where the cut now sits on the ring, read back from the scene rather than
 * remembered, so the knob and `c` stay in step however the plane was last
 * moved. A plane at any depth is placed by its angles; one at angles off the
 * ring counts as off, so the next step from it is the first whole plane.
 */
function ringIndex(): number {
  const [depth, azimuth, elevationDeg] = currentPlane();
  if (depth >= PLANE_OFF) return 0;
  const at = WHOLE_PLANES.findIndex(
    ({ plane }, i) => i > 0 && samePlane([plane[1], plane[2]], [azimuth, elevationDeg]),
  );
  return Math.max(at, 0);
}

/** The plane that is cut now, by the name the knob says: a side, "off", or "custom". */
function cutName(): string {
  const [depth] = currentPlane();
  if (depth >= PLANE_OFF) return "off";
  const at = ringIndex();
  return at > 0 ? WHOLE_PLANES[at].name : "custom";
}

// NiiVue's `c` steps its own counter rather than reading the plane, so a
// plane set any other way (the knob, an agent, the Clip slider, a condition)
// would leave the next `c` stepping on from wherever it was last. Every cut,
// NiiVue's own included, fires this, so the counter is kept on the plane.
nv.addEventListener("clipPlaneChange", () => {
  nv.currentClipPlaneIndex = ringIndex();
});

function currentPlane(): [number, number, number] {
  return nv.getClipPlaneDepthAziElev(0);
}

/**
 * The cutting plane as the render shader sees it, `[nx, ny, nz, -depth]` in
 * fraction space: what `cutFace` reads the sweep's face from.
 */
function clipPlaneVector(): number[] {
  const at = nv.activeClipPlaneIndex * 4;
  return nv.model.clipPlanes.slice(at, at + 4);
}

/**
 * Whether two planes' angles name the same plane. NiiVue 1.0 keeps a plane
 * as its normal and works the angles back out of it when asked, so a plane
 * set at an azimuth of 270 can come back as -90, give or take rounding:
 * comparing the normals is what survives the round trip.
 */
function samePlane(a: readonly [number, number], b: readonly [number, number]): boolean {
  const n = clipNormal(a[0], a[1]);
  const m = clipNormal(b[0], b[1]);
  return n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0.9999;
}

/**
 * Turns the render camera to look straight at the face a plane at these
 * angles exposes. Called *before* the plane is cut: the camera turn fires
 * `azimuthElevationChange`, and when the Clip slider is above zero that
 * re-cuts the plane the slider's way, which the cut that follows overrides.
 */
function facePlane(azimuth: number, elevationDeg: number): void {
  const camera = cameraForPlane(azimuth, elevationDeg);
  nv.azimuth = camera.azimuth;
  nv.elevation = camera.elevation;
}

/** Where the render camera is looking from, for a reply. */
function describeCamera(): { azimuth: number; elevation: number } {
  return { azimuth: nv.azimuth, elevation: nv.elevation };
}

/** The scene as the control surface sees it: fractions in, words out. */
const knobScene: KnobScene = {
  moveCrosshair(axis, delta) {
    moveCrosshair(axis, delta);
  },
  centerCrosshair,
  movePlane(delta) {
    const [depth, azimuth, elevationDeg] = currentPlane();
    if (depth >= PLANE_OFF) return false;
    // The wheel over the render moves the same number; its own limits are kept.
    nv.setClipPlane([Math.min(1.5, Math.max(-1.5, depth + delta)), azimuth, elevationDeg]);
    return true;
  },
  nextPlane() {
    const next = WHOLE_PLANES[(ringIndex() + 1) % WHOLE_PLANES.length];
    // A whole plane is cut to expose a face; turn to it, so the face is the
    // near side and a depth pick over the render lands on it. Turning the
    // plane off leaves the camera where it is.
    if (next.plane[0] < PLANE_OFF) facePlane(next.plane[1], next.plane[2]);
    nv.setClipPlane([...next.plane]);
    return next.name;
  },
  describe() {
    const mm = nv.getCrosshairPos();
    const where = [
      spokenPosition(pan(mm[0], bounds.x, 1), "left", "right"),
      spokenPosition(anteriority(mm[1], bounds.y, 1), "back", "front"),
      spokenPosition(elevation(mm[2], bounds.z), "down", "up"),
    ].join(", ");
    const region = atlas && atlasFits ? atlas.regionAt(mm) : null;
    return region ? `${region}. ${where}.` : `${where}.`;
  },
};

const knobStatus = el("knobStatus");
const knobSpeech = browserSpeech();
/**
 * Tells the listener something changed that they did not do themselves: what
 * the knob does now, or where an agent has taken them.
 *
 * The status line is for the technician's eyes; the live region and the
 * voice are for the listener, who otherwise has no way to know. Spoken only
 * while sound is on, the same rule the region callout keeps: silence means
 * the app was told to be quiet.
 */
function announce(text: string): void {
  crosshairStatus.textContent = text;
  showKnob();
  if (sonifier.running) void knobSpeech.say(text);
}
const surface = new ControlSurface({ api, scene: knobScene, announce });
/** The technician's line: what the knob does now, and what its parameter reads. */
const showKnob = () => {
  knobStatus.textContent = `${surface.describeMode()} ${surface.describeStep()}`;
};
showKnob();
// A numeric nudge is silent, so the line follows the state as well as the voice.
api.onStateChange(showKnob);
new VirtualController(surface).attach();

/* ---------------- agents ---------------- */

/** The plane that is cut now, by the name the knob would say, or "off". */
function describePlane(): { name: string; depth: number; azimuth: number; elevation: number } {
  const [depth, azimuth, elevation] = currentPlane();
  return { name: cutName(), depth, azimuth, elevation };
}

/** The atlas, fetched if it has not been, whatever the condition. Throws in words. */
async function requireAtlas(): Promise<Atlas> {
  if (atlas) return atlas;
  try {
    return await loadAtlasOnce();
  } catch {
    throw new Error("The atlas could not be fetched. Is the machine online?");
  }
}

/**
 * The scene as an agent sees it: names in, a landing out.
 *
 * Going to a region does what a technician would do by hand with the panel
 * and the `c` key, in one move: the crosshair to the region's centroid, the
 * cut through that same point so the region is on the exposed face, the
 * voxel there sounded, and the place announced as the knob would announce it.
 */
const agentScene: AgentScene = {
  async listRegions(query) {
    const loaded = await requireAtlas();
    const wanted = query?.trim();
    const regions = wanted ? loaded.regions().filter((r) => regionMentions(r, wanted)) : loaded.regions();
    return regions.map(({ label, name, centroid, voxels }) => ({ label, name, centroid, voxels }));
  },

  async goToRegion(query, planeName) {
    if (!nv.volumes[0]) throw new Error("No volume is loaded yet.");
    fitCanvas();
    const loaded = await requireAtlas();
    if (!atlasFits) {
      throw new Error("The loaded scan is not in MNI space, so the atlas does not apply to it. Load the MNI152 demo.");
    }
    const plane = resolvePlane(planeName, currentPlane());
    if (!plane) throw new Error(`Unknown plane "${planeName}".`);
    const region = matchRegion(loaded.regions(), query);
    if (!region) throw new Error(`No region matches "${query}". Call list_regions to see the names.`);

    // A curved region's mean can lie outside it; land inside rather than on
    // the neighbour that happens to be there.
    let target = region.centroid;
    let snapped = false;
    if (loaded.valueAt(target) !== region.value) {
      const inside = loaded.nearestIn(region.value, target);
      if (inside) {
        target = inside;
        snapped = true;
      }
    }

    const at = nv.model.mm2scene([target[0], target[1], target[2]]);
    const frac: [number, number, number] = [at[0], at[1], at[2]];
    if (frac.some((f) => f < 0 || f > 1)) {
      throw new Error(`${region.name} lies outside the loaded volume.`);
    }

    const normal = clipNormal(plane.azimuth, plane.elevation);
    const depth = depthThrough(normal, frac);
    // Face the cut, so the exposed face with the region on it is the near
    // side rather than hidden behind the part the cut keeps.
    facePlane(plane.azimuth, plane.elevation);
    nv.setClipPlane([depth, plane.azimuth, plane.elevation]);
    const position = nv.crosshairPos;
    position[0] = frac[0];
    position[1] = frac[1];
    position[2] = frac[2];
    nv.drawScene();
    sampler.sampleFraction(position, onSample);

    const description = knobScene.describe();
    announce(description);
    return {
      region: { label: region.label, name: region.name, centroid: region.centroid, voxels: region.voxels },
      landed: { mm: target, frac },
      snapped,
      plane: { name: plane.name, depth, azimuth: plane.azimuth, elevation: plane.elevation },
      camera: describeCamera(),
      description,
      sounding: sonifier.running,
    };
  },

  whereAmI() {
    fitCanvas();
    const frac = nv.crosshairPos;
    const mm = nv.getCrosshairPos();
    const region = atlas && atlasFits ? atlas.regionAt(mm) : null;
    return {
      volume: nv.volumes[0]?.name ?? null,
      atlas: atlas ? (atlasFits ? "ready" : "not an MNI scan") : "not loaded",
      crosshair: { mm, frac: Array.from(frac) },
      region,
      plane: describePlane(),
      camera: describeCamera(),
      description: nv.volumes[0] ? knobScene.describe() : "No volume is loaded yet.",
      sounding: sonifier.running,
    };
  },
};

// The socket is opened only when asked for: in development always, since
// that is where an agent is tried out, and otherwise by `?agent` in the
// address, with an optional address of its own for a server elsewhere.
const agentParam = new URLSearchParams(location.search).get("agent");
if (import.meta.env.DEV || agentParam !== null) {
  const agentStatus = el("agentStatus");
  new AgentController(agentScene, agentParam ? [agentParam] : agentUrls(), (connected) => {
    agentStatus.textContent = connected ? "agent server connected" : "agent server not reached";
    agentStatus.hidden = false;
  }).attach();
}

stage.addEventListener("pointermove", track);
stage.addEventListener("pointerenter", track);
stage.addEventListener("pointerleave", () => {
  if (!sweeping) onSample(null);
});

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

  const lo = vol.globalMin ?? 0;
  const hi = vol.globalMax ?? 1;
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
  if (!active.channels.atlas || atlas || atlasLoading) return;
  void loadAtlasOnce().catch(() => {});
}

/** One fetch of the atlas, shared by the condition and any agent that asks during it. */
function loadAtlasOnce(): Promise<Atlas> {
  if (atlas) return Promise.resolve(atlas);
  if (atlasLoading) return atlasLoading;
  readout.region("loading atlas…");
  atlasLoading = loadAtlas().then(
    (loaded) => {
      atlas = loaded;
      atlasLoading = null;
      readout.region(atlasFits ? null : "off: not an MNI scan");
      return loaded;
    },
    (error: unknown) => {
      atlasLoading = null;
      readout.region("atlas failed (offline?)");
      throw error;
    },
  );
  return atlasLoading;
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
  nv.setClipPlane([depth, nv.azimuth + 180, -nv.elevation]);
}

el<HTMLInputElement>("clip").addEventListener("input", applyClip);
/**
 * Whether the slider's cut was on when last announced. A drag is silent, as a
 * knob nudge is, since the sound is the feedback; only turning it on or off
 * is said.
 */
let sliderCut = controls.clip > 0;
el<HTMLInputElement>("clip").addEventListener("input", () => {
  if (controls.clip > 0 === sliderCut) return;
  sliderCut = controls.clip > 0;
  announce(sliderCut ? "Cut plane: facing you." : "Cut plane: off.");
});
nv.addEventListener("azimuthElevationChange", () => {
  if (controls.clip > 0) applyClip();
});

/** Whether the pointer is over the canvas, which is when NiiVue listens for its keys. */
let pointerOnCanvas = false;
stage.addEventListener("pointerenter", () => (pointerOnCanvas = true));
stage.addEventListener("pointerleave", () => (pointerOnCanvas = false));

// NiiVue's own `c` over the canvas walks the same six whole planes as the
// knob's next plane. NiiVue cuts on the key going down, from a window
// listener that ignores keys typed into a field and keys pressed with the
// pointer elsewhere; this one follows the same rules on the key's release,
// after the cut, and turns the camera to whichever plane NiiVue just cut, as
// the knob does.
window.addEventListener("keyup", (event) => {
  if (event.key.toUpperCase() !== "C" || !pointerOnCanvas) return;
  const target = event.composedPath()[0];
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  ) {
    return;
  }
  const [depth, azimuth, elevationDeg] = currentPlane();
  if (depth < PLANE_OFF) facePlane(azimuth, elevationDeg);
  announce(`Cut plane: ${cutName()}.`);
});

const VIEW_NAMES: Readonly<Record<number, string>> = {
  [SLICE_TYPE.AXIAL]: "axial",
  [SLICE_TYPE.CORONAL]: "coronal",
  [SLICE_TYPE.SAGITTAL]: "sagittal",
  [SLICE_TYPE.MULTIPLANAR]: "all views",
  [SLICE_TYPE.RENDER]: "3D render",
};
// NiiVue's `v` over the canvas is the only thing that changes the view, and
// the picture is all it changes, so the listener is told.
nv.addEventListener("sliceTypeChange", () => {
  announce(`View: ${VIEW_NAMES[nv.sliceType] ?? "other"}.`);
});

/* ---------------- volume loading ---------------- */

/** Prefer the display window; fall back to the full data range. */
function refreshRange(): void {
  const vol = nv.volumes[0];
  if (!vol) return;
  fitCanvas();
  if (active.clip) nv.setClipPlane(active.clip);

  let lo = vol.calMin ?? NaN;
  let hi = vol.calMax ?? NaN;
  if (!(hi > lo)) {
    lo = vol.globalMin ?? NaN;
    hi = vol.globalMax ?? NaN;
  }
  range = hi > lo ? { lo, hi } : DEFAULT_RANGE;
  bounds = boundsFromFrac((frac) => nv.model.scene2mm(frac));
  // An unknown name falls back to gray, as NiiVue's own renderer does.
  const colormap = lookupColorMap(vol.colormap ?? "gray") ?? lookupColorMap("gray");
  lut = colormap ? colormapLut(colormap, vol.isColormapInverted) : new Uint8ClampedArray();
  lutPeak = peakAlpha(lut);
  readout.status("ready");
  readout.region(atlasFits ? null : "off: not an MNI scan");
  resetBoneMap();
}

async function loadFile(file: File): Promise<void> {
  try {
    await nv.loadImage(file);
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
