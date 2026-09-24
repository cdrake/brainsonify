/**
 * The intents a controller can send the surface, and the keys that send
 * them. One table serves both the virtual controller (a keyboard) and the
 * physical one: the CrowPanel presents itself as a Bluetooth keyboard and
 * sends these same keys, so the browser cannot tell the two apart. See
 * docs/control/CROWPANEL.md for the device side.
 */

import type { ControlSurface } from "@brainsonify/control";

export type Intent =
  | "clockwise"
  | "counter-clockwise"
  | "press"
  | "left-right"
  | "back-front"
  | "down-up"
  | "plane"
  | "parameter"
  | "cycle-mode"
  | "focus-previous"
  | "focus-next"
  | "cycle-step"
  | "center"
  | "next-plane";

/**
 * Keyboard `key` values to intents. Letters are matched lowercase.
 *
 * Chosen around the keys NiiVue reads while the pointer is over the canvas
 * (a, c, d, h, j, k, l, u, v and Escape), so a key never does two things
 * depending on where the pointer is. The top row is the technician's:
 * a numbered button per mode, and 0 to cycle when the numbers are out of reach.
 */
export const KEY_MAP: Readonly<Record<string, Intent>> = {
  ArrowUp: "clockwise",
  ArrowDown: "counter-clockwise",
  Enter: "press",
  "1": "left-right",
  "2": "back-front",
  "3": "down-up",
  "4": "plane",
  "5": "parameter",
  "0": "cycle-mode",
  "[": "focus-previous",
  "]": "focus-next",
  s: "cycle-step",
  Home: "center",
  n: "next-plane",
};

/** The intent a key sends, or null for a key the controller does not use. */
export function intentOf(key: string): Intent | null {
  return KEY_MAP[key.length === 1 ? key.toLowerCase() : key] ?? null;
}

/** Carries one intent to the surface. */
export function perform(surface: ControlSurface, intent: Intent): void {
  switch (intent) {
    case "clockwise":
      return surface.turn(1);
    case "counter-clockwise":
      return surface.turn(-1);
    case "press":
      return surface.press();
    case "left-right":
    case "back-front":
    case "down-up":
    case "plane":
    case "parameter":
      return surface.setMode(intent);
    case "cycle-mode":
      return surface.cycleMode();
    case "focus-previous":
      return surface.focusPrevious();
    case "focus-next":
      return surface.focusNext();
    case "cycle-step":
      return surface.cycleStep();
    case "center":
      return surface.center();
    case "next-plane":
      return surface.nextPlane();
  }
}

/** Something that feeds intents to the surface for as long as it is attached. */
export interface Controller {
  attach(): void;
  detach(): void;
}
