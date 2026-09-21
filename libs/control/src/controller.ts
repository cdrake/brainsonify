/**
 * Main Control API - decoupled parameter management for Brainsonify.
 * Provides a centralized interface for getting, setting, and observing control parameters.
 */

import { clampParameter, validateParameter, getParameter } from "./schema";
import type { ControlParameter } from "./schema";
import { DEFAULT_STATE, cloneState, getStateDiff, mergeState, type ControlState } from "./state";
import type { Mode, TapRange } from "@brainsonify/sonification";

/**
 * The part of an experiment the controller reads when one is applied: the
 * mode it opens in and the tap range it spends. The full `Experiment` type
 * lives in the app's registry; this library only depends on the sonification
 * core, so it names just the fields it needs, and the app's experiments
 * satisfy it structurally.
 */
export interface ExperimentPreset {
  mode?: Mode;
  taps?: TapRange;
}

/**
 * Listener type for parameter change events.
 */
export type ParameterChangeListener = (event: {
  parameterId: string;
  previousValue: any;
  currentValue: any;
  timestamp: number;
}) => void;

/**
 * Listener type for state change events.
 */
export type StateChangeListener = (event: {
  previousState: ControlState;
  currentState: ControlState;
  changedParameters: string[];
  timestamp: number;
}) => void;

/**
 * Listener type for experiment application events.
 */
export type ExperimentAppliedListener = (event: {
  experiment: ExperimentPreset;
  previousState: ControlState;
  appliedState: ControlState;
  timestamp: number;
}) => void;

/**
 * Central API for controlling Brainsonify parameters.
 * Decouples parameter management from UI and audio engine.
 */
export class ControlAPI {
  private state: ControlState;
  private parameterListeners: Map<string, Set<ParameterChangeListener>> = new Map();
  private stateListeners: Set<StateChangeListener> = new Set();
  private experimentListeners: Set<ExperimentAppliedListener> = new Set();
  private historyStack: ControlState[] = [];
  private maxHistory = 20;
  private isApplyingExperiment = false;

  constructor(initialState?: Partial<ControlState>) {
    this.state = mergeState(DEFAULT_STATE, initialState ?? {});
    this.historyStack.push(cloneState(this.state));
  }

  /**
   * Get the current value of a single parameter.
   * Throws if the parameter doesn't exist.
   */
  getParameter(id: string): any {
    const value = this.state[id as keyof ControlState];
    if (value === undefined) {
      throw new Error(`Unknown parameter: ${id}`);
    }
    return value;
  }

  /**
   * Set a single parameter value.
   * Validates the value, clamps numeric values, and emits change events.
   * Returns true if the value was changed, false if it was rejected or unchanged.
   */
  setParameter(id: string, value: any): boolean {
    // Validate parameter exists
    const param = getParameter(id);
    if (!param) {
      console.warn(`Attempted to set unknown parameter: ${id}`);
      return false;
    }

    // Validate and clamp the value
    const validation = validateParameter(id, value);
    if (!validation.valid) {
      console.warn(`Failed to set ${id}: ${validation.error}`);
      return false;
    }

    // Clamp numeric values
    const clampedValue =
      typeof value === "number" ? clampParameter(id, value) : value;

    // Check if value actually changed
    const previousValue = this.state[id as keyof ControlState];
    if (previousValue === clampedValue) {
      return false; // No change, don't emit events
    }

    // Update state
    const previousState = cloneState(this.state);
    this.write(id, clampedValue);

    // Add to history
    this.addToHistory();

    // Emit parameter-specific event
    this.emitParameterChange(id, previousValue, clampedValue);

    // Emit general state change event (unless we're applying an experiment)
    if (!this.isApplyingExperiment) {
      this.emitStateChange([id], previousState);
    }

    return true;
  }

  /**
   * Get the complete current state.
   */
  getState(): ControlState {
    return cloneState(this.state);
  }

  /**
   * Set multiple parameters at once (batch operation).
   * More efficient than calling setParameter multiple times.
   */
  setState(partial: Partial<ControlState>): string[] {
    const previousState = cloneState(this.state);
    const changedParameters: string[] = [];

    // Validate and apply all changes
    for (const [id, value] of Object.entries(partial)) {
      const validation = validateParameter(id, value);
      if (!validation.valid) {
        console.warn(`Skipping ${id}: ${validation.error}`);
        continue;
      }

      const clampedValue =
        typeof value === "number" ? clampParameter(id, value) : value;
      const currentValue = this.state[id as keyof ControlState];

      if (currentValue !== clampedValue) {
        this.write(id, clampedValue);
        changedParameters.push(id);
      }
    }

    if (changedParameters.length === 0) {
      return []; // No changes
    }

    // Add to history
    this.addToHistory();

    // Emit individual parameter change events
    for (const id of changedParameters) {
      this.emitParameterChange(
        id,
        previousState[id as keyof ControlState],
        this.state[id as keyof ControlState],
      );
    }

    // Emit state change event
    this.emitStateChange(changedParameters, previousState);

    return changedParameters;
  }

  /**
   * Apply an experiment's preset values to the control state.
   * This should be called when switching experiments.
   */
  applyExperiment(experiment: ExperimentPreset, presetOverrides?: Partial<ControlState>): void {
    this.isApplyingExperiment = true;

    try {
      const previousState = cloneState(this.state);

      // Apply experiment-specific mode if it has one
      if (experiment.mode) {
        this.state.mode = experiment.mode;
      }

      // Apply experiment-specific tap ceiling if it has one
      if (experiment.taps) {
        this.state.taps = experiment.taps.fastest;
      }

      // Apply preset overrides if provided
      if (presetOverrides) {
        this.setState(presetOverrides);
      }

      this.addToHistory();

      // Emit experiment applied event
      this.emitExperimentApplied(experiment, previousState);
    } finally {
      this.isApplyingExperiment = false;
    }
  }

  /**
   * Subscribe to changes on a specific parameter.
   */
  onParameterChange(
    parameterId: string,
    listener: ParameterChangeListener,
  ): () => void {
    if (!this.parameterListeners.has(parameterId)) {
      this.parameterListeners.set(parameterId, new Set());
    }
    this.parameterListeners.get(parameterId)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.parameterListeners.get(parameterId)?.delete(listener);
    };
  }

  /**
   * Subscribe to any state change.
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to experiment application.
   */
  onExperimentApplied(listener: ExperimentAppliedListener): () => void {
    this.experimentListeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.experimentListeners.delete(listener);
    };
  }

  /**
   * Get the definition of a parameter.
   */
  getParameterDef(id: string): ControlParameter | undefined {
    return getParameter(id);
  }

  /**
   * Undo to the previous state (if history available).
   */
  undo(): boolean {
    if (this.historyStack.length <= 1) {
      return false;
    }

    this.historyStack.pop(); // Remove current state
    const restored = this.historyStack[this.historyStack.length - 1];

    const before = this.state;
    const newState = cloneState(restored);
    const diff = getStateDiff(before, newState);
    const changedParameters = Object.keys(diff);

    this.state = newState;

    // Emit change events, per parameter and for the state as a whole
    for (const id of changedParameters) {
      this.emitParameterChange(
        id,
        before[id as keyof ControlState],
        this.state[id as keyof ControlState],
      );
    }
    if (changedParameters.length > 0) {
      this.emitStateChange(changedParameters, before);
    }

    return true;
  }

  /**
   * Clear the undo history.
   */
  clearHistory(): void {
    this.historyStack = [cloneState(this.state)];
  }

  /**
   * Get history stack length (for debugging).
   */
  getHistorySize(): number {
    return this.historyStack.length;
  }

  /**
   * Export the entire state as JSON (for persistence).
   */
  toJSON(): string {
    return JSON.stringify(this.state);
  }

  /**
   * Import state from JSON (from persistence).
   */
  fromJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      const changedParameters = this.setState(parsed);
      return changedParameters.length > 0;
    } catch (error) {
      console.error("Failed to import state from JSON:", error);
      return false;
    }
  }

  // ============ Private helpers ============

  /**
   * Writes one field of the state by id. Assigning through a union key
   * resolves to `never` in TypeScript; the id has already been validated
   * against the schema, and the value against that id's type.
   */
  private write(id: string, value: unknown): void {
    (this.state as unknown as Record<string, unknown>)[id] = value;
  }

  private emitParameterChange(
    parameterId: string,
    previousValue: any,
    currentValue: any,
  ): void {
    const listeners = this.parameterListeners.get(parameterId);
    if (!listeners) return;

    const event = {
      parameterId,
      previousValue,
      currentValue,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`Error in parameter change listener for ${parameterId}:`, error);
      }
    });
  }

  private emitStateChange(changedParameters: string[], previousState: ControlState): void {
    const event = {
      previousState,
      currentState: cloneState(this.state),
      changedParameters,
      timestamp: Date.now(),
    };

    this.stateListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in state change listener:", error);
      }
    });
  }

  private emitExperimentApplied(
    experiment: ExperimentPreset,
    previousState: ControlState,
  ): void {
    const event = {
      experiment,
      previousState,
      appliedState: cloneState(this.state),
      timestamp: Date.now(),
    };

    this.experimentListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in experiment applied listener:", error);
      }
    });
  }

  private addToHistory(): void {
    // Keep history stack to max size
    if (this.historyStack.length >= this.maxHistory) {
      this.historyStack.shift();
    }
    this.historyStack.push(cloneState(this.state));
  }
}
