/**
 * Control parameter definitions and schemas for the Brainsonify control API.
 * Defines all available parameters, their types, ranges, and constraints.
 */

import type { Mode } from "@brainsonify/sonification";

/**
 * Definition of a single control parameter.
 * Provides metadata for validation, UI rendering, and control mapping.
 */
export interface ControlParameter {
  /** Unique identifier for this parameter (e.g., 'lowHz', 'volume'). */
  id: string;

  /** Display name for UI and documentation. */
  name: string;

  /** Data type of this parameter. */
  type: "float" | "int" | "enum" | "boolean";

  /** Default value for this parameter. */
  defaultValue: number | string | boolean;

  /** Minimum value (for numeric types). */
  min?: number;

  /** Maximum value (for numeric types). */
  max?: number;

  /** Step size for incremental adjustments. */
  step?: number;

  /** Unit label (e.g., 'Hz', 'dB', 'ms'). */
  unit?: string;

  /** Description of what this parameter controls. */
  description: string;

  /**
   * Which experiment channels are affected by this parameter.
   * E.g., 'stereo' only applies when the experiment has stereo enabled.
   */
  affectedChannels?: string[];

  /**
   * Which audio modes support this parameter.
   * Undefined means all modes support it.
   */
  allowedModes?: Mode[];

  /** For enum types, the list of valid values. */
  enumValues?: Array<{ value: string; label: string }>;

  /**
   * Optional callback to validate or normalize a value before setting.
   * Throws or returns false if invalid.
   */
  validator?: (value: any) => boolean;
}

/**
 * Schema defining all available control parameters.
 *
 * The single source of truth for the control system. Every range, step and
 * default here is the panel's own (`apps/brainsonify/index.html`); a spec in
 * the app reads the markup and fails if the two drift apart. The step is
 * what a knob detent moves the value by.
 */
export const CONTROL_SCHEMA: Record<string, ControlParameter> = {
  // Audio Mapping & Pitch
  mode: {
    id: "mode",
    name: "Mapping",
    type: "enum",
    defaultValue: "tone",
    description: "How the continuous voice is generated: pure tone, filtered noise, or white noise",
    enumValues: [
      { value: "tone", label: "Pure tone" },
      { value: "noise", label: "Filtered noise" },
      { value: "texture", label: "White noise" },
    ],
  },

  render3d: {
    id: "render3d",
    name: "3D render",
    type: "boolean",
    defaultValue: true,
    description: "Sample the 3D render by depth pick, as well as the slice planes",
  },

  // Sweep Controls
  sweepLine: {
    id: "sweepLine",
    name: "Line",
    type: "float",
    defaultValue: 4,
    min: 0.25,
    max: 8,
    step: 0.25,
    unit: "s",
    description: "Seconds for the sweep to read one line",
    affectedChannels: ["sweep"],
  },

  sweepLines: {
    id: "sweepLines",
    name: "Lines",
    type: "int",
    defaultValue: 21,
    min: 5,
    max: 41,
    step: 1,
    description: "Lines from one edge of the face to the other",
    affectedChannels: ["sweep"],
  },

  sweepRest: {
    id: "sweepRest",
    name: "Rest",
    type: "float",
    defaultValue: 0,
    min: 0,
    max: 3,
    step: 0.05,
    unit: "s",
    description: "Silence between one line and the next",
    affectedChannels: ["sweep"],
  },

  sweepDir: {
    id: "sweepDir",
    name: "Lines run",
    type: "enum",
    defaultValue: "right",
    description: "Which of the four cardinal directions each line is read in",
    affectedChannels: ["sweep"],
    enumValues: [
      { value: "right", label: "Left to right" },
      { value: "left", label: "Right to left" },
      { value: "down", label: "Top to bottom" },
      { value: "up", label: "Bottom to top" },
    ],
  },

  // 3D & Clipping
  depth: {
    id: "depth",
    name: "Surface",
    type: "int",
    defaultValue: 1,
    min: 0,
    max: 6,
    step: 1,
    unit: "vox",
    description: "How many voxels the 3D render hit is searched inward",
  },

  clip: {
    id: "clip",
    name: "Clip",
    type: "float",
    defaultValue: 0,
    min: 0,
    max: 1,
    step: 0.05,
    description: "How much of the near side to cut away (0 = no cut)",
  },

  lowHz: {
    id: "lowHz",
    name: "Low",
    type: "float",
    defaultValue: 110,
    min: 60,
    max: 600,
    step: 1,
    unit: "Hz",
    description: "Base frequency of the pitch range",
    affectedChannels: ["continuous"],
  },

  octaves: {
    id: "octaves",
    name: "Octaves",
    type: "float",
    defaultValue: 4,
    min: 1,
    max: 6,
    step: 0.5,
    description: "Span of the pitch range above the low frequency",
    affectedChannels: ["continuous"],
  },

  // Volume & Gates
  gate: {
    id: "gate",
    name: "Gate",
    type: "float",
    defaultValue: 0.04,
    min: 0,
    max: 0.5,
    step: 0.01,
    description: "Intensity threshold below which the voice is silent",
  },

  volume: {
    id: "volume",
    name: "Volume",
    type: "float",
    defaultValue: 0.4,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Master output level",
  },

  // Spatial Positioning
  width: {
    id: "width",
    name: "Stereo",
    type: "float",
    defaultValue: 0.85,
    min: 0,
    max: 1,
    step: 0.05,
    description: "Stereo field width: 0 = mono, 1 = hemispheres hard left and right",
    affectedChannels: ["stereo"],
  },

  spread: {
    id: "spread",
    name: "Depth",
    type: "float",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.05,
    description: "Front-back depth range: 0 = flat, 1 = full anterior-posterior",
    affectedChannels: ["depth"],
  },

  // Rhythm & Taps
  taps: {
    id: "taps",
    name: "Taps",
    type: "float",
    defaultValue: 14,
    min: 4,
    max: 26,
    step: 0.5,
    unit: "/s",
    description: "Ceiling for tap rate (taps per second)",
    affectedChannels: ["rhythm", "bone"],
  },

  spike: {
    id: "spike",
    name: "Spike",
    type: "int",
    defaultValue: 8,
    min: 0,
    max: 14,
    step: 1,
    unit: "mm",
    description: "How far the bone probe reaches from the voxel under the pointer",
    affectedChannels: ["bone"],
  },

  rate: {
    id: "rate",
    name: "Rate",
    type: "float",
    defaultValue: 1,
    min: 0.5,
    max: 3,
    step: 0.1,
    unit: "x",
    description: "Multiplier on the tap rate",
    affectedChannels: ["rhythm", "bone"],
  },

  tapsOnly: {
    id: "tapsOnly",
    name: "Taps only",
    type: "boolean",
    defaultValue: false,
    description: "Silence the tone and leave only the tap layer",
    affectedChannels: ["rhythm", "bone"],
  },

  glide: {
    id: "glide",
    name: "Glide",
    type: "float",
    defaultValue: 0.02,
    min: 0,
    max: 0.2,
    step: 0.005,
    unit: "s",
    description: "Time constant for pitch changes (frequency glide)",
  },
};

/**
 * The parameters in the order the panel shows them, top to bottom. A
 * controller that walks from one parameter to the next walks this list, so
 * the knob visits them in the same order a sighted technician reads them.
 */
export const PANEL_ORDER: readonly string[] = Object.keys(CONTROL_SCHEMA);

/**
 * Get a control parameter definition by ID.
 * Returns undefined if the parameter doesn't exist.
 */
export function getParameter(id: string): ControlParameter | undefined {
  return CONTROL_SCHEMA[id];
}

/**
 * Validate a value against a parameter definition.
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateParameter(
  id: string,
  value: any,
): { valid: true } | { valid: false; error: string } {
  const param = getParameter(id);
  if (!param) {
    return { valid: false, error: `Unknown parameter: ${id}` };
  }

  // Type checking
  const actualType = typeof value;
  const expectedType =
    param.type === "boolean" ? "boolean" : param.type === "enum" ? "string" : "number";

  if (actualType !== expectedType) {
    return {
      valid: false,
      error: `Parameter ${id} expects ${expectedType}, got ${actualType}`,
    };
  }

  // Enum validation
  if (param.type === "enum" && param.enumValues) {
    if (!param.enumValues.some((e) => e.value === value)) {
      return {
        valid: false,
        error: `Invalid enum value for ${id}: ${value}`,
      };
    }
  }

  // Numeric range validation
  if (typeof value === "number") {
    if (param.min !== undefined && value < param.min) {
      return {
        valid: false,
        error: `Parameter ${id} must be >= ${param.min}`,
      };
    }
    if (param.max !== undefined && value > param.max) {
      return {
        valid: false,
        error: `Parameter ${id} must be <= ${param.max}`,
      };
    }
  }

  // Custom validator
  if (param.validator && !param.validator(value)) {
    return {
      valid: false,
      error: `Custom validation failed for ${id}`,
    };
  }

  return { valid: true };
}

/**
 * Clamp a value to a parameter's valid range.
 */
export function clampParameter(id: string, value: number): number {
  const param = getParameter(id);
  if (!param || typeof value !== "number") return value;

  const min = param.min ?? -Infinity;
  const max = param.max ?? Infinity;
  return Math.min(max, Math.max(min, value));
}

/**
 * Get all parameter IDs for a given channel.
 */
export function getParametersForChannel(channel: string): string[] {
  return Object.values(CONTROL_SCHEMA)
    .filter((p) => !p.affectedChannels || p.affectedChannels.includes(channel))
    .map((p) => p.id);
}

/**
 * Get all parameter IDs for a given audio mode.
 */
export function getParametersForMode(mode: Mode): string[] {
  return Object.values(CONTROL_SCHEMA)
    .filter((p) => !p.allowedModes || p.allowedModes.includes(mode))
    .map((p) => p.id);
}

/** How many decimals a step needs, so 0.05 prints as 0.05 and 1 prints as 1. */
function decimalsOf(step: number): number {
  const text = String(step);
  const point = text.indexOf(".");
  return point < 0 ? 0 : text.length - point - 1;
}

/**
 * Moves a value by a number of steps, the way a knob detent or a slider
 * arrow does: snapped to the parameter's step and held inside its range.
 *
 * Enums step through their options and stop at either end rather than
 * wrapping, so a knob turned past the last option stays there. Booleans
 * turn on for a clockwise step and off for a counter-clockwise one.
 */
export function stepParameter(
  id: string,
  value: number | string | boolean,
  steps: number,
): number | string | boolean {
  const param = getParameter(id);
  if (!param || steps === 0) return value;

  if (param.type === "boolean") return steps > 0;

  if (param.type === "enum") {
    const options = param.enumValues ?? [];
    const at = options.findIndex((option) => option.value === value);
    const next = Math.min(options.length - 1, Math.max(0, (at < 0 ? 0 : at) + steps));
    return options[next]?.value ?? value;
  }

  if (typeof value !== "number") return value;
  const step = param.step ?? 1;
  const moved = value + steps * step;
  // Snapping first, so a value that arrived off-grid (from a preset, say)
  // lands on the grid after one turn rather than staying a little off.
  const snapped = Number((Math.round(moved / step) * step).toFixed(decimalsOf(step)));
  return clampParameter(id, snapped);
}

/**
 * A value as it should be spoken or printed: at the step's precision, with
 * the unit after it, or the option's label, or "on" and "off".
 */
export function formatValue(id: string, value: number | string | boolean): string {
  const param = getParameter(id);
  if (!param) return String(value);
  if (param.type === "boolean") return value ? "on" : "off";
  if (param.type === "enum") {
    return param.enumValues?.find((option) => option.value === value)?.label ?? String(value);
  }
  if (typeof value !== "number") return String(value);
  const text = value.toFixed(decimalsOf(param.step ?? 1));
  return param.unit ? `${text} ${param.unit}` : text;
}
