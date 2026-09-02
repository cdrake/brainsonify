import type { Mode } from "@brainsonify/sonification";

import type { Channels, Experiment } from "./experiments";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

/** Everything the sonification reads off the control panel. */
export class Controls {
  private mode = el<HTMLSelectElement>("mode");
  private lowHz = el<HTMLInputElement>("fLo");
  private octaves = el<HTMLInputElement>("oct");
  private gate = el<HTMLInputElement>("gate");
  private volume = el<HTMLInputElement>("vol");
  private glide = el<HTMLInputElement>("glide");
  private render3d = el<HTMLInputElement>("render3d");
  private depth = el<HTMLInputElement>("depth");
  private clipDepth = el<HTMLInputElement>("clip");
  private width = el<HTMLInputElement>("width");
  private spread = el<HTMLInputElement>("spread");
  private taps = el<HTMLInputElement>("taps");
  private rate = el<HTMLInputElement>("rate");
  private spikeReach = el<HTMLInputElement>("spike");
  private only = el<HTMLInputElement>("tapsOnly");

  constructor() {
    const inputs = [
      this.mode,
      this.lowHz,
      this.octaves,
      this.gate,
      this.volume,
      this.glide,
      this.depth,
      this.clipDepth,
      this.width,
      this.spread,
      this.taps,
      this.rate,
      this.spikeReach,
      this.only,
    ];
    for (const input of inputs) input.addEventListener("input", () => this.syncLabels());
    this.syncLabels();
  }

  get values() {
    return {
      mode: this.mode.value as Mode,
      lowHz: Number(this.lowHz.value),
      octaves: Number(this.octaves.value),
      gate: Number(this.gate.value),
      volume: Number(this.volume.value),
      glide: Number(this.glide.value),
      width: Number(this.width.value),
      spread: Number(this.spread.value),
      taps: Number(this.taps.value),
      rate: Number(this.rate.value),
    };
  }

  /** How far the bone probe reaches, in millimetres. 0 reads a single voxel. */
  get spike(): number {
    return Number(this.spikeReach.value);
  }

  /** Whether to mute the tone and leave only the tap layer sounding. */
  get tapsOnly(): boolean {
    return this.only.checked;
  }

  get sonify3d(): boolean {
    return this.render3d.checked;
  }

  /** How many voxels the 3D render hit is searched inward. See VoxelSampler. */
  get surfaceDepth(): number {
    return Number(this.depth.value);
  }

  /** How much of the near side to cut away, 0 (no clipping) to 1. */
  get clip(): number {
    return Number(this.clipDepth.value);
  }

  /**
   * Sets the tap ceiling, for a condition that wants a different one.
   *
   * Clamped to the slider's own range so the printed number never disagrees
   * with where the thumb sits.
   */
  setTaps(fastest: number): void {
    const lo = Number(this.taps.min);
    const hi = Number(this.taps.max);
    this.taps.value = String(Math.min(hi, Math.max(lo, fastest)));
    this.syncLabels();
  }

  private syncLabels(): void {
    const v = this.values;
    el("fLoV").textContent = `${v.lowHz} Hz`;
    el("octV").textContent = v.octaves.toFixed(1);
    el("gateV").textContent = v.gate.toFixed(2);
    el("volV").textContent = v.volume.toFixed(2);
    el("glideV").textContent = `${Math.round(v.glide * 1000)} ms`;
    el("depthV").textContent = `${this.surfaceDepth} vox`;
    el("clipV").textContent = formatClip(this.clip);
    el("widthV").textContent = v.width === 0 ? "mono" : v.width.toFixed(2);
    el("spreadV").textContent = v.spread === 0 ? "flat" : v.spread.toFixed(2);
    el("tapsV").textContent = `${v.taps} /s`;
    el("rateV").textContent = `${v.rate.toFixed(1)}\u00d7`;
    el("spikeV").textContent = this.spike > 0 ? `${this.spike} mm` : "point";
  }
}

/** Everything the panel says about the voxel under the pointer. */
export interface Reading {
  raw: number;
  norm: number;
  freq: number;
  /** World coordinate in millimetres. */
  mm?: readonly number[];
  /** Stereo position, -1..1. */
  pan?: number;
  /** Front-back position, -1 posterior to +1 anterior. */
  depth?: number;
  /** Colormap alpha at this voxel, 0..1. */
  opacity?: number;
  /** How bone-like this voxel is, 0..1, or null while the map is still building. */
  bone?: number | null;
  /** Tap rate in taps per second. */
  taps?: number;
  /** Which pick branch produced the sample. */
  source?: string;
}

/** The live numeric panel under the controls. */
export class Readout {
  private value = el("rVal");
  private norm = el("rNorm");
  private freq = el("rFreq");
  private mm = el("rMM");
  private stereo = el("rPan");
  private depth = el("rDepth");
  private opacity = el("rOpacity");
  private bone = el("rBone");
  private taps = el("rTaps");
  private src = el("rSrc");
  private bar = el<HTMLElement>("barFill");

  show(r: Reading): void {
    this.value.textContent = r.raw.toFixed(1);
    this.norm.textContent = r.norm.toFixed(3);
    this.freq.textContent = `${Math.round(r.freq)} Hz`;
    if (r.mm !== undefined) this.mm.textContent = r.mm.map((n) => n.toFixed(0)).join(", ");
    this.stereo.textContent = formatPan(r.pan ?? 0);
    this.depth.textContent = formatDepth(r.depth ?? 0);
    this.opacity.textContent = (r.opacity ?? 0).toFixed(2);
    this.bone.textContent = r.bone === undefined || r.bone === null ? "…" : r.bone.toFixed(2);
    this.taps.textContent = formatTaps(r.taps ?? 0);
    this.src.textContent = r.source ?? "2D slice";
    this.bar.style.width = `${r.norm * 100}%`;
  }

  clear(): void {
    const rows = [
      this.value,
      this.norm,
      this.freq,
      this.stereo,
      this.depth,
      this.opacity,
      this.bone,
      this.taps,
      this.src,
    ];
    for (const node of rows) {
      node.textContent = "—";
    }
    this.bar.style.width = "0%";
  }

  status(text: string): void {
    this.value.textContent = text;
  }
}

/**
 * The experiment switcher: one link per condition, in the order they were run.
 *
 * The links are real anchors with real hrefs, so they can be shared, bookmarked
 * and opened in a new tab. A plain left click is intercepted and the condition
 * swapped in place instead: a full navigation would refetch the volume and
 * discard a file the listener had dropped in, which is the wrong thing to do
 * when the whole point is comparing two mappings of the same scan.
 */
export class ExperimentNav {
  private nav = el("experiments");
  private summary = el("expSummary");
  private announcement = el("expAnnounce");

  constructor(
    experiments: readonly Experiment[],
    href: (experiment: Experiment) => string,
    onPick: (experiment: Experiment) => void,
  ) {
    for (const experiment of experiments) {
      const link = document.createElement("a");
      link.href = href(experiment);
      link.dataset.experiment = experiment.id;
      link.title = experiment.summary;
      link.append(tag("b", experiment.number), tag("span", experiment.name));

      link.addEventListener("click", (e) => {
        // Leave modified clicks alone; they mean "open this somewhere else".
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onPick(experiment);
      });

      this.nav.append(link);
    }
  }

  show(active: Experiment): void {
    for (const link of this.nav.querySelectorAll<HTMLAnchorElement>("a")) {
      if (link.dataset.experiment === active.id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }

    this.summary.textContent = active.summary;
    // The panel changes shape between conditions, and the listener this is
    // built for cannot see that happen — so say which condition they are in.
    this.announcement.textContent = `Experiment ${active.number}, ${active.name}. ${active.summary}`;
  }
}

/**
 * Shows only the controls and readout rows the active condition uses.
 *
 * Marked up in index.html as `data-requires="<channel>"`, so adding a channel
 * is an HTML attribute rather than another branch in here. Several channels may
 * be listed, space separated, and the row shows if any of them is on: the tap
 * controls are wanted by every condition that taps, whatever is driving it.
 */
export function applyChannels(channels: Channels, root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-requires]")) {
    const required = (node.dataset.requires ?? "").split(/\s+/).filter(Boolean);
    node.hidden = !required.some((channel) => channels[channel as keyof Channels]);
  }
}

function tag(name: string, text: string): HTMLElement {
  const node = document.createElement(name);
  node.textContent = text;
  return node;
}

/**
 * Renders the clip depth as a share of the volume rather than a raw depth.
 *
 * The underlying units are a signed distance from the centre of the volume,
 * which is meaningless to someone deciding how far to cut.
 */
export function formatClip(cut: number): string {
  if (!(cut > 0)) return "off";
  return `${Math.round(cut * 100)}%`;
}

/** Renders a tap rate as the listener would count it. */
export function formatTaps(rate: number): string {
  if (!(rate > 0)) return "silent";
  return `${rate.toFixed(1)} /s`;
}

/**
 * Renders a -1..1 front-back position anatomically.
 *
 * A and P rather than front and back, to read the same way as the L and R of
 * the stereo row and to match how the axis is named on the images.
 */
export function formatDepth(depth: number): string {
  const magnitude = Math.round(Math.abs(depth) * 100);
  if (magnitude === 0) return "centre";
  return `${depth < 0 ? "P" : "A"} ${magnitude}%`;
}

/** Renders a -1..1 stereo position the way a listener hears it. */
export function formatPan(pan: number): string {
  const magnitude = Math.round(Math.abs(pan) * 100);
  if (magnitude === 0) return "centre";
  return `${pan < 0 ? "L" : "R"} ${magnitude}%`;
}

export { el };
