export type Mode = "tone" | "noise";

export interface AudioSettings {
  mode: Mode;
  /** Master output level, 0..1. */
  volume: number;
  /** Time constant for frequency changes, in seconds. */
  glide: number;
}

const SILENCE_TAU = 0.02;
const GATE_TAU = 0.015;
/**
 * Panning follows the pointer faster than pitch glides — position should feel
 * attached to the cursor — but not instantly, since stepping the pan parameter
 * per pointer event is audible as a zipper on wideband material.
 */
const PAN_TAU = 0.012;
/** Noise is perceptually quieter than a sine at the same gain. */
const NOISE_MAKEUP = 1.6;

/**
 * A single voice that is either a sine oscillator or band-passed pink noise.
 * Both sources run continuously; the gate rides the shared output gain, which
 * avoids the clicks you get from starting and stopping nodes per sample.
 *
 * The voice is panned by anatomical position, so the stereo image carries the
 * left-right axis while pitch carries intensity.
 */
export class Sonifier {
  private ctx: AudioContext | null = null;
  private osc!: OscillatorNode;
  private filter!: BiquadFilterNode;
  private gain!: GainNode;
  private panner!: StereoPannerNode;

  running = false;

  private build(): AudioContext {
    const ctx = new AudioContext();

    // Panning sits after the gate so a closed gate is silent in both ears
    // rather than merely quiet on one side.
    this.panner = ctx.createStereoPanner();
    this.panner.connect(ctx.destination);

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.panner);

    this.osc = ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = 220;
    this.osc.connect(this.gain);

    const noise = ctx.createBufferSource();
    noise.buffer = pinkNoiseBuffer(ctx, 2);
    noise.loop = true;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "bandpass";
    this.filter.Q.value = 6;
    this.filter.frequency.value = 400;
    noise.connect(this.filter);
    this.filter.connect(this.gain);

    this.osc.start();
    noise.start();
    return ctx;
  }

  /** Resumes (or creates) the graph and flips the on/off state. Returns the new state. */
  async toggle(): Promise<boolean> {
    this.ctx ??= this.build();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = !this.running;
    if (!this.running) this.silence();
    return this.running;
  }

  /**
   * Steers the voice to `freq` at stereo position `pan` (-1 left to +1 right);
   * `open` false closes the gate but keeps pitch and position tracking.
   */
  update(freq: number, pan: number, open: boolean, s: AudioSettings): void {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;

    const t = ctx.currentTime;
    const tau = Math.max(s.glide, 0.001);
    const target = s.mode === "tone" ? this.osc.frequency : this.filter.frequency;
    target.setTargetAtTime(freq, t, tau);

    this.panner.pan.setTargetAtTime(Math.min(1, Math.max(-1, pan)), t, PAN_TAU);

    const level = open ? s.volume * (s.mode === "noise" ? NOISE_MAKEUP : 1) : 0;
    this.gain.gain.setTargetAtTime(level, t, GATE_TAU);
  }

  silence(): void {
    if (!this.ctx) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, SILENCE_TAU);
  }
}

/** Voss-McCartney style pink noise, close enough for a texture source. */
function pinkNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  return buffer;
}
