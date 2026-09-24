/**
 * The agent controller: what brainsonify adds to the NiiVue core's tools.
 *
 * The socket, the hello and the core tools live in `niivue-mcp/browser`;
 * this file adds the handlers for the sound, which only this app has, and
 * wraps the client as a controller like the keyboard and the knob, so
 * `main.ts` attaches it the same way.
 */

import { AgentClient, agentUrls, coreHandlers, sceneState, type Handlers, type NiiVueHost } from "niivue-mcp/browser";

import type { Controller } from "./keys";

export { agentUrls };

/** How long a sound request waits on the browser before giving up. */
export const SOUND_WAIT_MS = 1500;

/** The sound, as the agent's tools reach it. */
export interface SoundHost {
  /** Whether the voxel under the crosshair is being sounded now. */
  sounding(): boolean;
  /** Turns the sound on or off, as the Enable sound button does. Resolves with the state after. */
  setSound(on: boolean): Promise<boolean>;
  /** The modes the Mapping control offers, and the one in use. */
  modes(): { modes: Array<{ value: string; label: string }>; current: string };
  setMode(mode: string): void;
  /** Says something to the listener, as the knob does when it changes. */
  announce(text: string): void;
}

/** The handlers for brainsonify's own tools. */
export function brainsonifyHandlers(sound: SoundHost, waitMs: number = SOUND_WAIT_MS): Handlers {
  return {
    async set_sound(params) {
      const on = params.on === true || params.on === "true";
      if (sound.sounding() !== on) {
        // A browser will not start audio until the person has clicked in
        // the page; until then resuming the context hangs rather than
        // failing, so wait a little and then say so.
        const stalled = new Promise<"stalled">((resolve) => setTimeout(() => resolve("stalled"), waitMs));
        const outcome = await Promise.race([sound.setSound(on), stalled]);
        if (outcome === "stalled") {
          throw new Error(
            "The browser will not start audio until the person has clicked in the page. " +
              "Ask them to click Enable sound, then try again.",
          );
        }
      }
      return { sounding: sound.sounding() };
    },
    list_modes() {
      return sound.modes();
    },
    set_mode(params) {
      const wanted = String(params.mode ?? "").trim();
      const { modes } = sound.modes();
      if (!modes.some((mode) => mode.value === wanted)) {
        throw new Error(`Unknown mode "${wanted}". One of: ${modes.map((mode) => mode.value).join(", ")}.`);
      }
      sound.setMode(wanted);
      return { mode: wanted, sounding: sound.sounding() };
    },
    announce(params) {
      const text = String(params.text ?? "").trim();
      if (!text) throw new Error("announce needs some text.");
      sound.announce(text);
      return { said: text, spoken: sound.sounding() };
    },
  };
}

/** The scene's state with the sound's added, for the server to watch between calls. */
export function brainsonifyState(host: NiiVueHost, sound: SoundHost) {
  return () => ({ ...sceneState(host), sounding: sound.sounding(), mode: sound.modes().current });
}

export class AgentController implements Controller {
  private readonly client: AgentClient;

  constructor(
    host: NiiVueHost,
    sound: SoundHost,
    urls: readonly string[] = agentUrls(),
    /** Told when the server is reached and when it is lost, for a status line. */
    onStatus: (connected: boolean) => void = () => {},
  ) {
    this.client = new AgentClient(
      { ...coreHandlers(host), ...brainsonifyHandlers(sound) },
      { urls, state: brainsonifyState(host, sound), onStatus },
    );
  }

  /** The id this tab says hello with; `list_tabs` shows it. */
  get id(): string {
    return this.client.id;
  }

  attach(): void {
    this.client.attach();
  }

  detach(): void {
    this.client.detach();
  }
}
