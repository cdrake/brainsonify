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
  private width = el<HTMLInputElement>("width");

  constructor() {
    const inputs = [
      this.mode,
      this.lowHz,
      this.octaves,
      this.gate,
      this.volume,
      this.glide,
      this.depth,
      this.width,
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
    };
  }

  get sonify3d(): boolean {
    return this.render3d.checked;
  }

  /** How many voxels the 3D render hit is searched inward. See VoxelSampler. */
  get surfaceDepth(): number {
    return Number(this.depth.value);
  }

  private syncLabels(): void {
    const v = this.values;
    el("fLoV").textContent = `${v.lowHz} Hz`;
    el("octV").textContent = v.octaves.toFixed(1);
    el("gateV").textContent = v.gate.toFixed(2);
    el("volV").textContent = v.volume.toFixed(2);
    el("glideV").textContent = `${Math.round(v.glide * 1000)} ms`;
    el("depthV").textContent = `${this.surfaceDepth} vox`;
    el("widthV").textContent = v.width === 0 ? "mono" : v.width.toFixed(2);
  }
}

/** The live numeric panel under the controls. */
export class Readout {
  private value = el("rVal");
  private norm = el("rNorm");
  private freq = el("rFreq");
  private mm = el("rMM");
  private stereo = el("rPan");
  private src = el("rSrc");
  private bar = el<HTMLElement>("barFill");

  show(
    raw: number,
    norm: number,
    freq: number,
    mm?: readonly number[],
    pan?: number,
    source?: string,
  ): void {
    this.value.textContent = raw.toFixed(1);
    this.norm.textContent = norm.toFixed(3);
    this.freq.textContent = `${Math.round(freq)} Hz`;
    if (mm !== undefined) this.mm.textContent = mm.map((n) => n.toFixed(0)).join(", ");
    this.stereo.textContent = formatPan(pan ?? 0);
    this.src.textContent = source ?? "2D slice";
    this.bar.style.width = `${norm * 100}%`;
  }

  clear(): void {
    this.value.textContent = "—";
    this.norm.textContent = "—";
    this.freq.textContent = "—";
    this.stereo.textContent = "—";
    this.src.textContent = "—";
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

/** Renders a -1..1 stereo position the way a listener hears it. */
export function formatPan(pan: number): string {
  const magnitude = Math.round(Math.abs(pan) * 100);
  if (magnitude === 0) return "centre";
  return `${pan < 0 ? "L" : "R"} ${magnitude}%`;
}

export { el };
