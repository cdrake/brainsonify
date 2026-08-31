import type { Mode } from "@brainsonify/sonification";

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

  constructor() {
    const inputs = [this.mode, this.lowHz, this.octaves, this.gate, this.volume, this.glide];
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
    };
  }

  get sonify3d(): boolean {
    return this.render3d.checked;
  }

  private syncLabels(): void {
    const v = this.values;
    el("fLoV").textContent = `${v.lowHz} Hz`;
    el("octV").textContent = v.octaves.toFixed(1);
    el("gateV").textContent = v.gate.toFixed(2);
    el("volV").textContent = v.volume.toFixed(2);
    el("glideV").textContent = `${Math.round(v.glide * 1000)} ms`;
  }
}

/** The live numeric panel under the controls. */
export class Readout {
  private value = el("rVal");
  private norm = el("rNorm");
  private freq = el("rFreq");
  private mm = el("rMM");
  private bar = el<HTMLElement>("barFill");

  show(raw: number, norm: number, freq: number, mm?: string): void {
    this.value.textContent = raw.toFixed(1);
    this.norm.textContent = norm.toFixed(3);
    this.freq.textContent = `${Math.round(freq)} Hz`;
    if (mm !== undefined) this.mm.textContent = mm;
    this.bar.style.width = `${norm * 100}%`;
  }

  clear(): void {
    this.value.textContent = "—";
    this.norm.textContent = "—";
    this.freq.textContent = "—";
    this.bar.style.width = "0%";
  }

  status(text: string): void {
    this.value.textContent = text;
  }
}

export { el };
