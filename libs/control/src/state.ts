/**
 * Control state interface defining all parameter values.
 */

import type { Mode } from "@brainsonify/sonification";

import { CONTROL_SCHEMA } from "./schema";

/**
 * Complete state of all control parameters.
 * This is what gets passed to the Sonifier and represents
 * the full current configuration.
 */
export interface ControlState {
  // Audio Mapping & Pitch
  mode: Mode;
  lowHz: number;
  octaves: number;

  // Volume & Gates
  gate: number;
  volume: number;
  glide: number;

  // Spatial Positioning
  width: number;
  spread: number;

  // Rhythm & Taps
  taps: number;
  rate: number;
  spike: number;

  // 3D & Clipping
  depth: number;
  clip: number;

  // Sweep Controls
  sweepLine: number;
  sweepLines: number;
  sweepRest: number;
  sweepDir: string;

  // Toggles
  tapsOnly: boolean;
  render3d: boolean;
}

/**
 * Default state: every parameter at the schema's default, which is the
 * panel's. Built from the schema rather than written out again, so there is
 * one place a default lives.
 */
export const DEFAULT_STATE: ControlState = Object.fromEntries(
  Object.values(CONTROL_SCHEMA).map((param) => [param.id, param.defaultValue]),
) as unknown as ControlState;

/**
 * Create a deep copy of a control state.
 */
export function cloneState(state: ControlState): ControlState {
  return { ...state };
}

/**
 * Get the difference between two states.
 * Returns an object containing only the fields that differ.
 */
export function getStateDiff(
  previous: ControlState,
  current: ControlState,
): Partial<ControlState> {
  const diff: Partial<ControlState> = {};
  let hasChanges = false;

  for (const key of Object.keys(current) as Array<keyof ControlState>) {
    if (previous[key] !== current[key]) {
      // Writing through a union key resolves to `never`; the key and value
      // come from the same field, so the widening is sound.
      (diff as Record<string, unknown>)[key] = current[key];
      hasChanges = true;
    }
  }

  return hasChanges ? diff : {};
}

/**
 * Check if two states are equivalent (all values equal).
 */
export function statesEqual(a: ControlState, b: ControlState): boolean {
  return Object.keys(a).every(
    (key) => a[key as keyof ControlState] === b[key as keyof ControlState],
  );
}

/**
 * Merge a partial state into a complete state.
 */
export function mergeState(base: ControlState, partial: Partial<ControlState>): ControlState {
  return {
    ...base,
    ...partial,
  };
}
