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
  private taps = el<HTMLInputElement>("taps");

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
      this.taps,
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
      taps: Number(this.taps.value),
    };
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
    el("tapsV").textContent = `${v.taps} /s`;
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
  /** Colormap alpha at this voxel, 0..1. */
  opacity?: number;
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
  private opacity = el("rOpacity");
  private taps = el("rTaps");
  private src = el("rSrc");
  private bar = el<HTMLElement>("barFill");

  show(r: Reading): void {
    this.value.textContent = r.raw.toFixed(1);
    this.norm.textContent = r.norm.toFixed(3);
    this.freq.textContent = `${Math.round(r.freq)} Hz`;
    if (r.mm !== undefined) this.mm.textContent = r.mm.map((n) => n.toFixed(0)).join(", ");
    this.stereo.textContent = formatPan(r.pan ?? 0);
    this.opacity.textContent = (r.opacity ?? 0).toFixed(2);
    this.taps.textContent = formatTaps(r.taps ?? 0);
    this.src.textContent = r.source ?? "2D slice";
    this.bar.style.width = `${r.norm * 100}%`;
  }

  clear(): void {
    for (const node of [this.value, this.norm, this.freq, this.stereo, this.opacity, this.taps, this.src]) {
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
 * is an HTML attribute rather than another branch in here.
 */
export function applyChannels(channels: Channels, root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-requires]")) {
    const channel = node.dataset.requires as keyof Channels;
    node.hidden = !channels[channel];
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

/** Renders a -1..1 stereo position the way a listener hears it. */
export function formatPan(pan: number): string {
  const magnitude = Math.round(Math.abs(pan) * 100);
  if (magnitude === 0) return "centre";
  return `${pan < 0 ? "L" : "R"} ${magnitude}%`;
}

export { el };
