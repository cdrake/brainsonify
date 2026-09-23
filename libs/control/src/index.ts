/**
 * @brainsonify/control - Control API for Brainsonify
 *
 * A decoupled parameter management system that allows flexible control
 * of Brainsonify sonification parameters from multiple input sources
 * (keyboard, mouse, hardware controllers), and the control surface that
 * turns one knob and a few buttons into changes to those parameters and
 * to the scene.
 */

export { ControlAPI } from "./controller";
export type {
  ExperimentPreset,
  ParameterChangeListener,
  StateChangeListener,
  ExperimentAppliedListener,
} from "./controller";

export {
  CONTROL_SCHEMA,
  PANEL_ORDER,
  getParameter,
  validateParameter,
  clampParameter,
  stepParameter,
  formatValue,
  getParametersForChannel,
  getParametersForMode,
} from "./schema";
export type { ControlParameter } from "./schema";

export {
  DEFAULT_STATE,
  cloneState,
  getStateDiff,
  mergeState,
  statesEqual,
} from "./state";
export type { ControlState } from "./state";

export {
  ControlSurface,
  KNOB_MODES,
  STEP_SIZES,
  STEP_FRACTION,
  STEP_MULTIPLIER,
} from "./surface";
export type { Axis, KnobMode, KnobScene, StepSize, SurfaceOptions } from "./surface";

export {
  PLANE_ALIASES,
  PLANE_ANGLES,
  PLANE_OFF,
  cameraForPlane,
  clipNormal,
  depthThrough,
  matchRegion,
  regionMentions,
  resolvePlane,
  viewDirection,
} from "./agent";
export type { AgentMethod, AgentRequest, AgentResponse, Nameable, RegionSummary } from "./agent";
