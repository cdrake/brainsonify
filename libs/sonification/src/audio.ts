export type Mode = "tone" | "noise";

export interface AudioSettings {
  mode: Mode;
  /** Master output level, 0..1. */
  volume: number;
  /** Time constant for frequency changes, in seconds. */
  glide: number;
}

/** Everything the voice is being asked to say about one voxel. */
export interface VoiceState {
  /** Pitch in Hz, from intensity. */
  freq: number;
  /** Stereo position, -1 hard left to +1 hard right, from anatomical position. */
  pan: number;
  /** Tap rate in taps per second, from opacity. 0 leaves the tap layer silent. */
  taps: number;
  /** False closes the gate but keeps pitch and position tracking. */
  open: boolean;
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
 * A tap: near-instant attack, short decay, so it reads as a struck surface
 * rather than a pulse of the tone. The whole envelope has to fit inside the
 * shortest gap between taps, which caps the usable rate at ~1/TAP_LENGTH; that
 * is the real reason DEFAULT_TAPS stops where it does.
 */
const TAP_ATTACK = 0.001;
const TAP_DECAY = 0.03;
const TAP_LENGTH = TAP_ATTACK + TAP_DECAY;
/** Taps are struck well above the pitch range so the two channels stay apart. */
const TAP_HZ = 1800;
const TAP_Q = 3;

/** How far ahead taps are scheduled, and how often the scheduler tops up. */
const LOOKAHEAD_S = 0.1;
const PUMP_MS = 25;

/**
 * A single voice describing the voxel under the pointer.
 *
 * Pitch carries intensity, the stereo image carries anatomical position, and a
 * tap layer carries opacity as a rate. The tone sources run continuously and
 * the gate rides a gain node, which avoids the clicks you get from starting and
 * stopping nodes per sample; the taps are the one thing genuinely scheduled,
 * because a tap is an event and pretending otherwise gives you a tremolo.
 */
export class Sonifier {
  private ctx: AudioContext | null = null;
  private osc!: OscillatorNode;
  private filter!: BiquadFilterNode;
  private voice!: GainNode;
  private tapEnv!: GainNode;
  private master!: GainNode;
  private panner!: StereoPannerNode;

  /** Taps per second, already gated: 0 means schedule nothing. */
  private rate = 0;
  /** Context time the next tap is due. */
  private nextTap = 0;
  private pump: ReturnType<typeof setInterval> | null = null;

  running = false;

  private build(): AudioContext {
    const ctx = new AudioContext();

    // Panning is last, so a tap and the tone it belongs to always arrive from
    // the same place; volume sits just ahead of it, shared by both layers.
    this.panner = ctx.createStereoPanner();
    this.panner.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.panner);

    // ---- tone: sine, or pink noise band-passed at the mapped frequency ----

    this.voice = ctx.createGain();
    this.voice.gain.value = 0;
    this.voice.connect(this.master);

    this.osc = ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = 220;
    this.osc.connect(this.voice);

    const noise = ctx.createBufferSource();
    noise.buffer = pinkNoiseBuffer(ctx, 2);
    noise.loop = true;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "bandpass";
    this.filter.Q.value = 6;
    this.filter.frequency.value = 400;
    noise.connect(this.filter);
    this.filter.connect(this.voice);

    // ---- taps: the same noise, struck through a fixed band ----

    this.tapEnv = ctx.createGain();
    this.tapEnv.gain.value = 0;
    this.tapEnv.connect(this.master);

    const tapNoise = ctx.createBufferSource();
    tapNoise.buffer = pinkNoiseBuffer(ctx, 2);
    tapNoise.loop = true;

    const tapBand = ctx.createBiquadFilter();
    tapBand.type = "bandpass";
    tapBand.Q.value = TAP_Q;
    tapBand.frequency.value = TAP_HZ;
    tapNoise.connect(tapBand);
    tapBand.connect(this.tapEnv);

    this.osc.start();
    noise.start();
    tapNoise.start();

    this.pump ??= setInterval(() => this.scheduleTaps(), PUMP_MS);
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

  /** Steers the voice to describe one voxel. */
  update(voice: VoiceState, s: AudioSettings): void {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;

    const t = ctx.currentTime;
    const tau = Math.max(s.glide, 0.001);
    const target = s.mode === "tone" ? this.osc.frequency : this.filter.frequency;
    target.setTargetAtTime(voice.freq, t, tau);

    this.panner.pan.setTargetAtTime(Math.min(1, Math.max(-1, voice.pan)), t, PAN_TAU);
    this.master.gain.setTargetAtTime(s.volume, t, GATE_TAU);

    const level = voice.open ? (s.mode === "noise" ? NOISE_MAKEUP : 1) : 0;
    this.voice.gain.setTargetAtTime(level, t, GATE_TAU);

    // The gate governs the taps too: background voxels are silent, not merely
    // slow. Rate changes land on the next tap due, never mid-tap.
    this.rate = voice.open ? Math.max(0, voice.taps) : 0;
  }

  silence(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.rate = 0;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, SILENCE_TAU);
    this.tapEnv.gain.cancelScheduledValues(ctx.currentTime);
    this.tapEnv.gain.setValueAtTime(0, ctx.currentTime);
  }

  /**
   * Tops up the tap queue out to the lookahead horizon.
   *
   * Taps are scheduled on the audio clock, not fired from the timer: a
   * setInterval jitters by tens of milliseconds, which at these rates is the
   * difference between a rhythm and a stumble. The horizon is short so a rate
   * change is heard almost immediately rather than after a long queue drains.
   */
  private scheduleTaps(): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || this.rate <= 0) return;

    const now = ctx.currentTime;
    // Re-anchor after a silence, so resuming does not fire a burst of taps
    // that came due while nothing was sounding.
    if (this.nextTap < now) this.nextTap = now;

    const period = 1 / this.rate;
    for (const horizon = now + LOOKAHEAD_S; this.nextTap < horizon; this.nextTap += period) {
      this.strike(this.nextTap);
    }
  }

  private strike(at: number): void {
    const env = this.tapEnv.gain;
    env.setValueAtTime(0, at);
    env.linearRampToValueAtTime(1, at + TAP_ATTACK);
    // Exponential decay cannot reach zero, so land near it and snap the rest.
    env.exponentialRampToValueAtTime(0.001, at + TAP_LENGTH);
    env.setValueAtTime(0, at + TAP_LENGTH);
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
