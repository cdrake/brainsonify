/**
 * The Helm tutorial: every control, one at a time, before any quiz.
 *
 * The app speaks each step to the listener and the panel shows the
 * technician the same step and what to press, so both learn the Helm
 * together. A step ends when it is done, not when someone presses Next:
 * the listener presses or turns, the technician presses a mode key, and
 * for a mode the listener then turns to feel what it moves. The
 * technician can skip a step or stop.
 *
 * The keys keep doing what they always do while it runs. The tutorial only
 * watches the intents go by and decides what to say next.
 *
 * Speaking a line cancels the one before it, so the surface's own words
 * ("Helm moves back and front.") would be cut off by the tutorial's next
 * prompt. While it runs, the surface's words come here first and are said
 * in one breath with the prompt that follows.
 */

import type { Intent } from "./controllers/keys";

export interface TutorialStep {
  /** The control this step teaches. */
  teaches: Intent;
  /** What the technician reads on the panel: who presses what. */
  technician: string;
  /** Said to the listener as the step begins. */
  say: string;
  /** When set, the step goes on after `teaches` until the listener turns, and this is said first. */
  turn?: string;
}

/** Every Helm control, in an order where each builds on the last. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    teaches: "press",
    technician: "The listener presses the Helm (Enter).",
    say: "Press the Helm. It tells you where you are, and never changes anything.",
  },
  {
    teaches: "clockwise",
    technician: "The listener turns the Helm clockwise (↑).",
    say: "Turn the Helm clockwise. Right now that moves you to the right.",
  },
  {
    teaches: "counter-clockwise",
    technician: "The listener turns the Helm counter-clockwise (↓).",
    say: "Now turn it counter-clockwise, back to the left.",
  },
  {
    teaches: "back-front",
    technician: "Press 2 (back/front), then the listener turns.",
    say: "Listen. What the Helm moves is about to change.",
    turn: "Turn clockwise to go toward the front, counter-clockwise toward the back.",
  },
  {
    teaches: "down-up",
    technician: "Press 3 (down/up), then the listener turns.",
    say: "Listen for the next change.",
    turn: "Clockwise goes up, counter-clockwise goes down.",
  },
  {
    teaches: "left-right",
    technician: "Press 1 (left/right), then the listener turns.",
    say: "Listen for the next change.",
    turn: "Back to left and right. Turn to check.",
  },
  {
    teaches: "cycle-step",
    technician: "Press s (step size), then the listener turns.",
    say: "Listen. How far one turn goes is about to change.",
    turn: "Turn a few times and notice how far each one takes you.",
  },
  {
    teaches: "center",
    technician: "Press Home (center).",
    say: "Listen. You are about to be brought back to the middle.",
  },
  {
    teaches: "next-plane",
    technician: "Press n (next whole plane).",
    say: "Listen. The scan is about to be cut along a whole plane, and you will hear its name.",
  },
  {
    teaches: "plane",
    technician: "Press 4 (cut plane), then the listener turns.",
    say: "Listen for the next change.",
    turn: "Turning now slides the cut through the scan. Try it.",
  },
  {
    teaches: "parameter",
    technician: "Press 5 (parameter), then the listener turns.",
    say: "Listen. The Helm is about to set part of the sound instead of moving you.",
    turn: "Turn to change it. Pressing tells you its value.",
  },
  {
    teaches: "focus-next",
    technician: "Press ] (next parameter), then the listener turns.",
    say: "Listen for the next setting.",
    turn: "Turn to hear this one change.",
  },
  {
    teaches: "focus-previous",
    technician: "Press [ (previous parameter).",
    say: "Listen. You are going back to the setting before.",
  },
  {
    teaches: "cycle-mode",
    technician: "Press 0 (next mode).",
    say: "Listen. The modes can also be stepped through one at a time.",
  },
];

/** Said when the last step is done. */
export const TUTORIAL_DONE = "That is every control. Press the Helm whenever you lose track.";

export interface TutorialOptions {
  /** Says a line to the listener and shows it to the technician, as the page's announce does. */
  say(text: string): void;
  /** Shows the technician the current step, or null when the tutorial is not running. */
  show(line: string | null): void;
  steps?: readonly TutorialStep[];
}

const TURNS: ReadonlySet<Intent> = new Set(["clockwise", "counter-clockwise"]);

export class HelmTutorial {
  private readonly steps: readonly TutorialStep[];
  /** The step running, or -1 when stopped. */
  private at = -1;
  /** Whether the current step has seen its control and now waits for a turn. */
  private turning = false;
  /** What the surface said and has not been spoken yet. */
  private pending: string[] = [];
  private flushQueued = false;

  constructor(private readonly options: TutorialOptions) {
    this.steps = options.steps ?? TUTORIAL_STEPS;
  }

  get active(): boolean {
    return this.at >= 0;
  }

  /** Index of the step running, from 0, or -1. */
  get step(): number {
    return this.at;
  }

  /**
   * Starts from the first step. `reset` runs once the tutorial is listening,
   * so what the surface says while resetting is said with the first prompt
   * rather than cut off by it.
   */
  start(reset?: () => void): void {
    this.at = 0;
    this.pending = [];
    reset?.();
    this.begin(0, this.take());
  }

  stop(): void {
    this.at = -1;
    this.turning = false;
    this.pending = [];
    this.options.show(null);
  }

  /** Moves on without the step being done: for a control the technician cannot use right now. */
  skip(): void {
    if (this.active) this.begin(this.at + 1, this.take());
  }

  /**
   * The surface's announce while the tutorial may be running. Held until the
   * intent that caused it has been seen, so it can be said with the next
   * prompt; anything nobody claims is said on its own straight after.
   */
  heard(text: string): void {
    if (!this.active) {
      this.options.say(text);
      return;
    }
    this.pending.push(text);
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      const left = this.take();
      if (left.length) this.options.say(left.join(" "));
    });
  }

  /** Told every intent after the surface has carried it out. */
  intent(intent: Intent): void {
    if (!this.active) return;
    const step = this.steps[this.at];
    if (this.turning) {
      if (TURNS.has(intent)) this.begin(this.at + 1, this.take());
      return;
    }
    if (intent !== step.teaches) return;
    if (step.turn) {
      this.turning = true;
      this.speak([...this.take(), step.turn]);
      this.showStep();
      return;
    }
    this.begin(this.at + 1, this.take());
  }

  private begin(index: number, before: string[]): void {
    this.turning = false;
    if (index >= this.steps.length) {
      this.at = -1;
      this.speak([...before, TUTORIAL_DONE]);
      this.options.show(null);
      return;
    }
    this.at = index;
    this.speak([...before, this.steps[index].say]);
    this.showStep();
  }

  private showStep(): void {
    const step = this.steps[this.at];
    const now = this.turning ? "Now the listener turns the Helm." : step.technician;
    this.options.show(`Step ${this.at + 1} of ${this.steps.length}: ${now}`);
  }

  private speak(parts: string[]): void {
    this.options.say(parts.join(" "));
  }

  private take(): string[] {
    const taken = this.pending;
    this.pending = [];
    return taken;
  }
}
