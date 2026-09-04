import type { AudioSettings, KeyStep, VoiceState } from "@brainsonify/sonification";

/**
 * Plays the sound key: says each step's label, then drives the voice through
 * that step's sweep, one channel at a time.
 *
 * The label is said *before* the sound rather than over it. The whole point
 * of a step is to hear one sound cleanly, and speech on top of it is exactly
 * the competition the key exists to remove.
 */

/** The part of `Sonifier` the key drives. Narrow so a test can stand in for it. */
export interface KeyVoice {
  update(voice: VoiceState, settings: AudioSettings): void;
  silence(): void;
}

/** Says a label and resolves once it has been said; `hush` cuts it short. */
export interface Speech {
  say(text: string): Promise<void>;
  hush(): void;
}

/** How often the sweep is re-aimed. Audio glides between updates, so this is not a step size. */
const TICK_MS = 16;
/** Silence between steps, so each ends before the next is announced. */
const GAP_MS = 400;

export class KeyPlayer {
  /** Bumped on every play and every cancel; a loop that sees a different value stops. */
  private run = 0;
  private active = false;

  constructor(
    private voice: KeyVoice,
    /** Where the current label is written, for anyone reading rather than listening. */
    private caption: HTMLElement,
    private speech: Speech,
  ) {}

  get playing(): boolean {
    return this.active;
  }

  /** Plays the whole key, resolving when it ends or is cancelled. A new play cancels the old. */
  async play(steps: readonly KeyStep[], settings: AudioSettings): Promise<void> {
    const run = ++this.run;
    this.active = true;
    this.speech.hush();
    this.caption.hidden = false;

    for (const step of steps) {
      this.caption.textContent = step.label;
      await this.speech.say(step.label);
      if (run !== this.run) return;

      await this.sound(step, settings, run);
      if (run !== this.run) return;

      this.voice.silence();
      await delay(GAP_MS);
      if (run !== this.run) return;
    }

    this.stop();
  }

  /** Stops the key wherever it is. Safe to call when nothing is playing. */
  cancel(): void {
    if (!this.active) return;
    this.run++;
    this.stop();
  }

  private stop(): void {
    this.active = false;
    this.speech.hush();
    this.voice.silence();
    this.caption.textContent = "";
    this.caption.hidden = true;
  }

  /**
   * Drives one step's sweep on a timer.
   *
   * A timer rather than an animation frame: this is audio, not drawing, and a
   * background tab throttles frames to nothing while the sound should still
   * finish. The tap steps mute the voice by passing the `taps` mode through,
   * the same switch `Taps only` uses.
   */
  private sound(step: KeyStep, settings: AudioSettings, run: number): Promise<void> {
    const mode = step.tone ? settings.mode : "taps";
    const started = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (run !== this.run) {
          clearInterval(timer);
          resolve();
          return;
        }
        const t = (Date.now() - started) / (step.seconds * 1000);
        this.voice.update(step.voice(Math.min(1, t)), { ...settings, mode });
        if (t >= 1) {
          clearInterval(timer);
          resolve();
        }
      }, TICK_MS);
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** With no speech engine, how long a caption is left on screen to be read. */
const READ_MS = 1500;
/** Longer than any label takes to say; stops a lost `end` event hanging the key. */
const SPEECH_TIMEOUT_MS = 10_000;

/**
 * Voice names that mark a better engine than the platform default, best first.
 *
 * The default voice on every platform is the oldest one it ships: Samantha on
 * macOS, David on Windows. The ones worth having announce themselves in the
 * name — Windows and Edge label their neural voices `Natural`, macOS labels a
 * downloaded high-quality voice `Premium` or `Enhanced`, and Chrome carries
 * its own Google voices, which are streamed and need the network but are a
 * clear step up from Samantha. Nothing here matches a novelty voice.
 */
const PREFERRED_VOICES: readonly RegExp[] = [
  /natural/i,
  /premium|enhanced/i,
  /^google us english$/i,
  /^google/i,
];

/**
 * The most natural English voice on offer, or null to leave the default alone.
 *
 * A US voice is preferred within each rank, since the labels are written in
 * US English and a British voice reads them with the wrong stress on the odd
 * word; failing that, any English will do.
 */
export function pickVoice(
  voices: readonly Pick<SpeechSynthesisVoice, "name" | "lang">[],
): Pick<SpeechSynthesisVoice, "name" | "lang"> | null {
  const english = voices.filter((voice) => /^en\b/i.test(voice.lang));
  const american = english.filter((voice) => /^en[-_]us/i.test(voice.lang));
  for (const pattern of PREFERRED_VOICES) {
    const hit =
      american.find((voice) => pattern.test(voice.name)) ??
      english.find((voice) => pattern.test(voice.name));
    if (hit) return hit;
  }
  return null;
}

/**
 * The browser's own speech engine, or a silent stand-in that leaves the
 * caption up long enough to read.
 *
 * `speechSynthesis` is the first spoken audio in the app. It is used rather
 * than recorded clips because the labels depend on the condition and the
 * `Mapping` mode, and because a clip cannot be edited in a text file.
 */
export function browserSpeech(): Speech {
  const synth = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
  if (!synth) {
    return { say: () => delay(READ_MS), hush: () => {} };
  }

  return {
    say(text) {
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        // Chosen per utterance, not once: Chrome fills the voice list
        // asynchronously, and a choice made at startup would usually be made
        // from an empty list.
        const voice = pickVoice(synth.getVoices()) as SpeechSynthesisVoice | null;
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang ?? "en-US";
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          resolve();
        };
        const guard = setTimeout(finish, SPEECH_TIMEOUT_MS);
        utterance.onend = finish;
        utterance.onerror = finish;
        // Clearing first: some engines leave a cancelled utterance queued and
        // never start the next one.
        synth.cancel();
        synth.speak(utterance);
      });
    },
    hush() {
      synth.cancel();
    },
  };
}
