import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioSettings, KeyStep, VoiceState } from "@brainsonify/sonification";

import { KeyPlayer, pickVoice, type KeyVoice, type Speech } from "./soundkey";

const SETTINGS: AudioSettings = { mode: "tone", volume: 0.4, glide: 0.02 };

/** A step that sweeps pitch over one second, with the tone on. */
function step(label: string, tone = true, seconds = 1): KeyStep {
  return {
    label,
    seconds,
    tone,
    voice: (t) => ({ freq: 100 + t * 100, pan: 0, depth: 0, height: 0, taps: tone ? 0 : 5, open: true }),
  };
}

/** Records what the key asked the voice to do. */
class FakeVoice implements KeyVoice {
  updates: { voice: VoiceState; settings: AudioSettings }[] = [];
  silences = 0;
  update(voice: VoiceState, settings: AudioSettings): void {
    this.updates.push({ voice, settings });
  }
  silence(): void {
    this.silences++;
  }
}

/** Speech that takes a fixed time to say anything, and remembers being hushed. */
function fakeSpeech(ms = 100): Speech & { said: string[]; hushed: number } {
  const speech = {
    said: [] as string[],
    hushed: 0,
    say(text: string) {
      speech.said.push(text);
      return new Promise<void>((resolve) => setTimeout(resolve, ms));
    },
    hush() {
      speech.hushed++;
    },
  };
  return speech;
}

let voice: FakeVoice;
let caption: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  voice = new FakeVoice();
  caption = document.createElement("p");
  caption.hidden = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KeyPlayer", () => {
  it("says each label before sounding it, and shows it while it plays", async () => {
    const speech = fakeSpeech();
    const player = new KeyPlayer(voice, caption, speech);
    const done = player.play([step("First."), step("Second.")], SETTINGS);

    await vi.advanceTimersByTimeAsync(50);
    expect(speech.said).toEqual(["First."]);
    expect(caption.hidden).toBe(false);
    expect(caption.textContent).toBe("First.");
    // Still talking: nothing has been asked of the voice yet.
    expect(voice.updates).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(600);
    expect(voice.updates.length).toBeGreaterThan(10);
    expect(speech.said).toEqual(["First."]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(speech.said).toEqual(["First.", "Second."]);
    expect(caption.textContent).toBe("Second.");

    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(player.playing).toBe(false);
    expect(caption.hidden).toBe(true);
    expect(caption.textContent).toBe("");
  });

  it("sweeps a step from its start to its end and lands exactly on the end", async () => {
    const player = new KeyPlayer(voice, caption, fakeSpeech(0));
    const done = player.play([step("Sweep.")], SETTINGS);
    await vi.advanceTimersByTimeAsync(2000);
    await done;

    const freqs = voice.updates.map((u) => u.voice.freq);
    expect(freqs[0]).toBeLessThan(110);
    expect(freqs[freqs.length - 1]).toBe(200);
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]).toBeGreaterThanOrEqual(freqs[i - 1]);
  });

  it("mutes the tone for a tap step by passing the taps mode through", async () => {
    const player = new KeyPlayer(voice, caption, fakeSpeech(0));
    const done = player.play([step("Tone.", true), step("Taps.", false)], SETTINGS);
    await vi.advanceTimersByTimeAsync(4000);
    await done;

    const modes = new Set(voice.updates.map((u) => u.settings.mode));
    expect(modes).toEqual(new Set(["tone", "taps"]));
    const tapUpdates = voice.updates.filter((u) => u.settings.mode === "taps");
    expect(tapUpdates.every((u) => u.voice.taps === 5)).toBe(true);
    // The rest of the settings ride through untouched.
    expect(voice.updates[0].settings.volume).toBe(0.4);
  });

  it("silences the voice between steps and at the end", async () => {
    const player = new KeyPlayer(voice, caption, fakeSpeech(0));
    const done = player.play([step("A."), step("B.")], SETTINGS);
    await vi.advanceTimersByTimeAsync(4000);
    await done;
    // Once after each step, and once more when the key stops.
    expect(voice.silences).toBe(3);
  });

  it("stops where it is when cancelled, and says nothing more", async () => {
    const speech = fakeSpeech();
    const player = new KeyPlayer(voice, caption, speech);
    const done = player.play([step("First."), step("Never.")], SETTINGS);

    await vi.advanceTimersByTimeAsync(400);
    expect(player.playing).toBe(true);
    const before = voice.updates.length;
    expect(before).toBeGreaterThan(0);

    player.cancel();
    expect(player.playing).toBe(false);
    expect(caption.hidden).toBe(true);
    expect(speech.hushed).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(voice.updates.length).toBe(before);
    expect(speech.said).toEqual(["First."]);
  });

  it("is a no-op to cancel when nothing is playing", () => {
    const player = new KeyPlayer(voice, caption, fakeSpeech());
    expect(() => player.cancel()).not.toThrow();
    expect(voice.silences).toBe(0);
  });

  it("lets a new play take over from one still running", async () => {
    const speech = fakeSpeech();
    const player = new KeyPlayer(voice, caption, speech);
    const first = player.play([step("Old."), step("Old two.")], SETTINGS);
    await vi.advanceTimersByTimeAsync(400);

    const second = player.play([step("New.")], SETTINGS);
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all([first, second]);

    expect(speech.said).toEqual(["Old.", "New."]);
    expect(player.playing).toBe(false);
  });
});

describe("pickVoice", () => {
  const voice = (name: string, lang: string) => ({ name, lang });

  it("takes Chrome's Google voice over the macOS default", () => {
    const voices = [
      voice("Samantha", "en-US"),
      voice("Bad News", "en-US"),
      voice("Daniel", "en-GB"),
      voice("Google US English", "en-US"),
      voice("Google UK English Female", "en-GB"),
    ];
    expect(pickVoice(voices)?.name).toBe("Google US English");
  });

  it("takes a natural voice over everything else", () => {
    const voices = [
      voice("Google US English", "en-US"),
      voice("Microsoft David - English (United States)", "en-US"),
      voice("Microsoft Aria Online (Natural) - English (United States)", "en-US"),
    ];
    expect(pickVoice(voices)?.name).toMatch(/Aria/);
  });

  it("takes a downloaded premium voice over a streamed Google one", () => {
    const voices = [
      voice("Google US English", "en-US"),
      voice("Ava (Premium)", "en-US"),
      voice("Samantha", "en-US"),
    ];
    expect(pickVoice(voices)?.name).toBe("Ava (Premium)");
  });

  it("prefers a US voice within a rank, and settles for other English", () => {
    const mixed = [voice("Google UK English Male", "en-GB"), voice("Google US English", "en-US")];
    expect(pickVoice(mixed)?.name).toBe("Google US English");
    const british = [voice("Samantha", "en-US"), voice("Google UK English Female", "en-GB")];
    expect(pickVoice(british)?.name).toBe("Google UK English Female");
  });

  it("ignores a natural voice in another language", () => {
    const voices = [voice("Microsoft Elsa Online (Natural) - Italian", "it-IT"), voice("Samantha", "en-US")];
    expect(pickVoice(voices)).toBeNull();
  });

  it("leaves the default alone when nothing better is on offer", () => {
    expect(pickVoice([voice("Samantha", "en-US"), voice("Fred", "en-US")])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});
