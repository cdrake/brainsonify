/**
 * What brainsonify adds over the NiiVue core: the sound.
 *
 * The core knows volumes, the crosshair, the atlas, the cut and the camera.
 * This extension registers the tools that only make sense in an app that
 * sonifies the voxel under the crosshair and talks to a listener: turning
 * the sound on and off, choosing how the voice is made, and saying
 * something to whoever is listening. Each one is answered by the page, the
 * same way the core's are.
 */

import { CONTROL_SCHEMA } from "@brainsonify/control";
import { TAB_ARG, type Extension } from "@niivue/nv-mcp/server";
import { z } from "zod";

const MODES = (CONTROL_SCHEMA.mode.enumValues ?? []).map((choice) => choice.value) as [string, ...string[]];

/** The input schema of each brainsonify tool, by name. */
export const BRAINSONIFY_SCHEMAS = {
  set_sound: { ...TAB_ARG, on: z.boolean().describe("true to start sounding the voxel under the crosshair, false to stop.") },
  list_modes: { ...TAB_ARG },
  set_mode: { ...TAB_ARG, mode: z.enum(MODES).describe("How the continuous voice is made.") },
  announce: { ...TAB_ARG, text: z.string().min(1).max(500).describe("What to say. Spoken only while sound is on.") },
} as const;

export const brainsonify: Extension = {
  name: "brainsonify",
  register(server, context) {
    server.registerTool(
      "set_sound",
      {
        title: "Sound on or off",
        description:
          "Starts or stops the sonification: with sound on, the voxel under the crosshair is " +
          "heard and announcements are spoken; off, the app is silent. Browsers only let a page " +
          "start audio after the person has clicked in it, so the first turn-on may be refused " +
          "until they click Enable sound themselves. Reports whether sound is on afterwards.",
        inputSchema: BRAINSONIFY_SCHEMAS.set_sound,
      },
      async ({ tab, on }) =>
        context.answer("set_sound", { on }, {
          tab,
          lead: (r) => {
            const now = (r as { sounding?: boolean })?.sounding;
            return now === undefined ? undefined : now ? "Sound on." : "Sound off.";
          },
        }),
    );

    server.registerTool(
      "list_modes",
      {
        title: "List sonification modes",
        description:
          "Lists how the continuous voice can be made (pure tone, filtered noise, white noise), " +
          "with which one is in use now.",
        inputSchema: BRAINSONIFY_SCHEMAS.list_modes,
        annotations: { readOnlyHint: true },
      },
      async ({ tab }) => context.answer("list_modes", {}, { tab }),
    );

    server.registerTool(
      "set_mode",
      {
        title: "Choose the sonification mode",
        description: "Chooses how the continuous voice is made, as the panel's Mapping control does.",
        inputSchema: BRAINSONIFY_SCHEMAS.set_mode,
      },
      async ({ tab, mode }) => context.answer("set_mode", { mode }, { tab, lead: () => `Mode: ${mode}.` }),
    );

    server.registerTool(
      "announce",
      {
        title: "Say something to the listener",
        description:
          "Puts a line in the app's status line and live region, and speaks it aloud when sound " +
          "is on: what the app itself says when the knob changes or an agent moves the crosshair. " +
          "Use it to tell the listener what is about to happen.",
        inputSchema: BRAINSONIFY_SCHEMAS.announce,
      },
      async ({ tab, text }) => context.answer("announce", { text }, { tab }),
    );
  },
};
