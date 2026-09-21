/**
 * The control surface: one knob, and the buttons that decide what it does.
 *
 * The app is used by two people at once. A visually impaired listener turns
 * the knob and hears the result; a sighted technician presses buttons that
 * change what turning does, and the app says out loud what changed so the
 * listener knows. This class is that arrangement, with nothing physical in
 * it: a keyboard, a rotary device over Bluetooth, or a test drives it by
 * calling the same methods, and it drives the app through the two
 * interfaces below.
 *
 * Pressing the knob never changes anything. It only asks the app to say
 * where the listener is, or what the focused parameter reads. A shared
 * device needs one gesture the listener can make freely, and that is it.
 */

import { ControlAPI } from "./controller";
import { PANEL_ORDER, formatValue, getParameter, stepParameter } from "./schema";

/** A crosshair axis in NiiVue's order: left-right, back-front, down-up. */
export type Axis = 0 | 1 | 2;

/**
 * What a turn of the knob moves. The first three step the crosshair along
 * one axis; `plane` slides the cut plane along its own axis, as the mouse
 * wheel does over the render; `parameter` nudges whichever panel control is
 * focused.
 */
export type KnobMode = "left-right" | "back-front" | "down-up" | "plane" | "parameter";

/** The modes in the order the cycle button visits them. */
export const KNOB_MODES: readonly KnobMode[] = [
  "left-right",
  "back-front",
  "down-up",
  "plane",
  "parameter",
];

const AXIS_OF: Partial<Record<KnobMode, Axis>> = { "left-right": 0, "back-front": 1, "down-up": 2 };

/** How far one detent goes. The same three sizes the panel's crosshair buttons offer. */
export type StepSize = "fine" | "medium" | "large";

export const STEP_SIZES: readonly StepSize[] = ["fine", "medium", "large"];

/** One detent as a fraction of the volume, for the crosshair and the plane. */
export const STEP_FRACTION: Record<StepSize, number> = { fine: 0.01, medium: 0.05, large: 0.1 };

/** One detent in schema steps, for a parameter. */
export const STEP_MULTIPLIER: Record<StepSize, number> = { fine: 1, medium: 5, large: 10 };

/**
 * What the surface needs from the scene: the app supplies this over NiiVue.
 * Every distance is a fraction of the volume, signed, so the surface never
 * knows about voxels or millimeters.
 */
export interface KnobScene {
  /** Moves the crosshair along one axis by a fraction of the volume. */
  moveCrosshair(axis: Axis, delta: number): void;
  /** Returns the crosshair to the middle of the volume. */
  centerCrosshair(): void;
  /**
   * Slides the cut plane along its own axis by a fraction of the volume.
   * Returns false when nothing is cut, so there is no plane to move.
   */
  movePlane(delta: number): boolean;
  /** Steps to the next whole plane, as NiiVue's `c` key does; returns its name to say. */
  nextPlane(): string;
  /** Where the crosshair is, in words a listener can use. */
  describe(): string;
}

export interface SurfaceOptions {
  api: ControlAPI;
  scene: KnobScene;
  /** Told everything the listener should hear about what the technician did. */
  announce: (text: string) => void;
  mode?: KnobMode;
  step?: StepSize;
  /** The parameter the knob sets in `parameter` mode. */
  focus?: string;
}

const MODE_SPOKEN: Record<KnobMode, string> = {
  "left-right": "Knob moves left and right.",
  "back-front": "Knob moves back and front.",
  "down-up": "Knob moves down and up.",
  plane: "Knob moves the cut plane.",
  parameter: "",
};

export class ControlSurface {
  private readonly api: ControlAPI;
  private readonly scene: KnobScene;
  private readonly announce: (text: string) => void;
  private currentMode: KnobMode;
  private currentStep: StepSize;
  private focused: string;

  constructor(options: SurfaceOptions) {
    this.api = options.api;
    this.scene = options.scene;
    this.announce = options.announce;
    this.currentMode = options.mode ?? "left-right";
    this.currentStep = options.step ?? "medium";
    const focus = options.focus ?? PANEL_ORDER[0];
    if (!getParameter(focus)) throw new Error(`unknown parameter: ${focus}`);
    this.focused = focus;
  }

  get mode(): KnobMode {
    return this.currentMode;
  }

  get step(): StepSize {
    return this.currentStep;
  }

  /** The parameter a turn sets in `parameter` mode, whatever mode is current. */
  get focus(): string {
    return this.focused;
  }

  /* ---------------- the listener's knob ---------------- */

  /** Turns the knob: positive is clockwise, and each unit is one detent. */
  turn(steps: number): void {
    if (!Number.isFinite(steps) || steps === 0) return;
    const axis = AXIS_OF[this.currentMode];
    if (axis !== undefined) {
      this.scene.moveCrosshair(axis, steps * STEP_FRACTION[this.currentStep]);
      return;
    }
    if (this.currentMode === "plane") {
      if (!this.scene.movePlane(steps * STEP_FRACTION[this.currentStep])) {
        this.announce("No plane is cut.");
      }
      return;
    }
    this.turnParameter(steps);
  }

  /** Presses the knob: says where the listener is, or what the focused control reads. */
  press(): void {
    if (this.currentMode === "parameter") {
      this.announce(this.reading());
      return;
    }
    this.announce(this.scene.describe());
  }

  /* ---------------- the technician's buttons ---------------- */

  setMode(mode: KnobMode): void {
    if (!KNOB_MODES.includes(mode)) throw new Error(`unknown knob mode: ${mode}`);
    this.currentMode = mode;
    this.announce(this.describeMode());
  }

  cycleMode(): void {
    const at = KNOB_MODES.indexOf(this.currentMode);
    this.setMode(KNOB_MODES[(at + 1) % KNOB_MODES.length]);
  }

  setStep(size: StepSize): void {
    if (!STEP_SIZES.includes(size)) throw new Error(`unknown step size: ${size}`);
    this.currentStep = size;
    this.announce(this.describeStep());
  }

  cycleStep(): void {
    const at = STEP_SIZES.indexOf(this.currentStep);
    this.setStep(STEP_SIZES[(at + 1) % STEP_SIZES.length]);
  }

  /** Points the knob at one parameter, and puts it in `parameter` mode if it was not. */
  setFocus(id: string): void {
    if (!getParameter(id)) throw new Error(`unknown parameter: ${id}`);
    this.focused = id;
    this.currentMode = "parameter";
    this.announce(this.describeMode());
  }

  focusNext(): void {
    this.setFocus(PANEL_ORDER[(this.focusIndex() + 1) % PANEL_ORDER.length]);
  }

  focusPrevious(): void {
    this.setFocus(PANEL_ORDER[(this.focusIndex() - 1 + PANEL_ORDER.length) % PANEL_ORDER.length]);
  }

  center(): void {
    this.scene.centerCrosshair();
    this.announce("Crosshair centered.");
  }

  nextPlane(): void {
    this.announce(`Cut plane: ${this.scene.nextPlane()}.`);
  }

  /* ---------------- words ---------------- */

  /** What the knob does right now, as a sentence. */
  describeMode(): string {
    if (this.currentMode === "parameter") return `Knob sets ${this.reading()}`;
    return MODE_SPOKEN[this.currentMode];
  }

  describeStep(): string {
    const size = this.currentStep;
    const percent = Math.round(STEP_FRACTION[size] * 100);
    return `${size[0].toUpperCase()}${size.slice(1)} steps, ${percent} percent.`;
  }

  /** The focused parameter and its value: "Volume, 0.40." */
  private reading(): string {
    const param = getParameter(this.focused);
    const value = this.api.getParameter(this.focused) as number | string | boolean;
    return `${param?.name ?? this.focused}, ${formatValue(this.focused, value)}.`;
  }

  private focusIndex(): number {
    return Math.max(0, PANEL_ORDER.indexOf(this.focused));
  }

  private turnParameter(steps: number): void {
    const id = this.focused;
    const param = getParameter(id);
    if (!param) return;
    const before = this.api.getParameter(id) as number | string | boolean;
    const multiplier = param.type === "float" || param.type === "int" ? STEP_MULTIPLIER[this.currentStep] : 1;
    const after = stepParameter(id, before, steps * multiplier);
    if (after === before) {
      // A numeric value against its limit, or an option at the end of the
      // list: say so, since a knob that turns and changes nothing is otherwise
      // indistinguishable from one that is not connected.
      this.announce(`${param.name} is at its ${steps > 0 ? "highest" : "lowest"}, ${formatValue(id, before)}.`);
      return;
    }
    this.api.setParameter(id, after);
    // A number is heard in the sound; an option or a switch is a discrete
    // change that can be silent until much later, so it is named as it happens.
    if (param.type === "enum" || param.type === "boolean") this.announce(this.reading());
  }
}
