import type { Mode, VoiceState } from "./audio";
import { frequency } from "./mapping";
import type { TapRange } from "./rhythm";

/**
 * The sound key: a short demonstration of what each sound means, played when
 * sound is enabled so a listener is told the mapping rather than left to infer
 * it from hovering.
 *
 * Every condition assumes the listener already knows that pitch is intensity,
 * that the taps are bone, that the level drop is height. A sighted user reads
 * that off the readout rows; a user working by ear has nothing equivalent
 * without this.
 *
 * The key is data, not audio: an ordered list of steps, each with a label to
 * be spoken and a `voice(t)` that describes what the voice should be doing at
 * fraction `t` of the step. The app plays it through the same `Sonifier` the
 * hover uses, so the key cannot drift from the mapping it explains — a change
 * to the pitch range or the tap ceiling changes the key with it.
 */

/** Which sounds a condition has that need explaining. */
export interface KeyChannels {
  /** Stereo carries anatomical left-right. */
  stereo: boolean;
  /** What drives the tap layer, or `off` when the condition does not tap. */
  taps: "off" | "opacity" | "bone";
  /** Tap brightness carries front-back. Needs a tap layer to ride. */
  depth: boolean;
  /** Loudness carries inferior-superior. */
  height: boolean;
}

/** The parts of the control panel the key has to honour to sound like the real thing. */
export interface KeySettings {
  mode: Mode;
  lowHz: number;
  octaves: number;
  /** Width of the stereo field, 0 mono to 1 hard-panned. */
  width: number;
  /** The tap rates the active condition spends. */
  taps: TapRange;
}

export interface KeyStep {
  /** What is said before the sound plays. */
  label: string;
  /** How long the sound plays, in seconds. */
  seconds: number;
  /**
   * Whether the continuous voice sounds in this step. Off for the tap steps,
   * so the rhythm is heard on its own rather than under a tone.
   */
  tone: boolean;
  /** The voice at fraction `t` (0..1) of the step. */
  voice(t: number): VoiceState;
}

/** How long a sweep from one end of a channel to the other is given. */
const SWEEP_SECONDS = 2;
/** Share of a step spent resting at each end, so the ends are heard as ends. */
const HOLD = 0.15;
/** A countable rate for the step where the taps are only there to be coloured. */
const DEPTH_TAPS_PER_SECOND = 6;

/**
 * Sweeps 0..1 across the middle of a step, holding at each end.
 *
 * Holding matters: a sweep that starts moving on its first sample never lets
 * the listener hear what "low" is before it has become something else.
 */
export function sweep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return Math.min(1, Math.max(0, (clamped - HOLD) / (1 - 2 * HOLD)));
}

const NEUTRAL: VoiceState = { freq: 0, pan: 0, depth: 0, height: 0, taps: 0, open: true };

/**
 * Builds the key for a condition, in the order the channels were added to the
 * study: intensity, then left-right, then the taps, then the two cues that
 * ride on the taps and the level.
 *
 * Each step demonstrates one channel with every other channel held neutral,
 * because a listener learning the mapping needs to hear one thing move at a
 * time. The pitch step is the only one every condition gets.
 */
export function soundKey(channels: KeyChannels, s: KeySettings): KeyStep[] {
  const mid = frequency(0.5, s.lowHz, s.octaves);
  const steps: KeyStep[] = [];

  steps.push({
    label:
      s.mode === "texture"
        ? "Brightness is intensity. Dark tissue is muffled, bright tissue is open."
        : "Pitch is intensity. Dark tissue is a low note, bright tissue is a high note.",
    seconds: SWEEP_SECONDS,
    tone: true,
    voice: (t) => ({ ...NEUTRAL, freq: frequency(sweep(t), s.lowHz, s.octaves) }),
  });

  if (channels.stereo) {
    const width = Math.min(1, Math.max(0, s.width));
    steps.push({
      label: "Left and right is anatomical. The left hemisphere sounds in the left ear.",
      seconds: SWEEP_SECONDS,
      tone: true,
      voice: (t) => ({ ...NEUTRAL, freq: mid, pan: (sweep(t) * 2 - 1) * width }),
    });
  }

  if (channels.taps !== "off") {
    const { slowest, fastest } = s.taps;
    steps.push({
      label:
        channels.taps === "bone"
          ? "Tapping is bone. Soft tissue ticks, the skull flutters."
          : "Tapping is opacity. Transparent tissue ticks, dense tissue rattles.",
      seconds: SWEEP_SECONDS * 1.5,
      tone: false,
      voice: (t) => ({ ...NEUTRAL, freq: mid, taps: slowest + sweep(t) * (fastest - slowest) }),
    });
  }

  if (channels.depth && channels.taps !== "off") {
    steps.push({
      label: "Tap brightness is front and back. The back of the head is dull, the front is bright.",
      seconds: SWEEP_SECONDS,
      tone: false,
      voice: (t) => ({
        ...NEUTRAL,
        freq: mid,
        taps: DEPTH_TAPS_PER_SECOND,
        depth: sweep(t) * 2 - 1,
      }),
    });
  }

  if (channels.height) {
    steps.push({
      label: "Loudness is height. The bottom of the head is quiet, the top is loud.",
      seconds: SWEEP_SECONDS,
      tone: true,
      voice: (t) => ({ ...NEUTRAL, freq: mid, height: sweep(t) * 2 - 1 }),
    });
  }

  return steps;
}
