/**
 * The on-screen Helm: the dial and the technician's buttons in a window
 * that floats over the render and can be dragged out of the way.
 *
 * It is a third input to the same surface, beside the keyboard and the
 * physical Helm, for anyone driving the app with a mouse or a touchscreen
 * and no device or key map. Every gesture becomes an intent and goes through
 * `perform`, as a key does, so the window keeps no mode or step of its own;
 * what it shows it reads back from the surface and the status line.
 *
 * The window sits on the body, outside the stage, so the pointer over it is
 * not sampled as if it were over the canvas beneath.
 */

import { KNOB_MODES, type ControlSurface, type KnobMode } from "@brainsonify/control";

import { KEY_MAP, perform, type Controller, type Intent } from "./keys";

/** How far the dial turns per detent while dragged around its center. Tuned by feel. */
export const DETENT_DEGREES = 15;

/**
 * Wheel travel, in pixels, that counts as one notch. A notch is one detent
 * however far one event reports, so a fast wheel cannot skip ahead; a
 * trackpad's run of small deltas adds up to a notch.
 */
export const WHEEL_NOTCH_PIXELS = 50;

const STORAGE_KEY = "brainsonify.virtualHelm";

/** The intents the dial itself sends; every other entry in KEY_MAP is a button. */
type DialIntent = "clockwise" | "counter-clockwise" | "press";

/**
 * The technician's buttons, by what they do, in the order the window lays
 * them out: the modes as numbered, then the rest. Each takes its key from
 * KEY_MAP. A new intent will not typecheck without one.
 */
const BUTTON_LABEL: Record<Exclude<Intent, DialIntent>, string> = {
  "left-right": "Left / right",
  "back-front": "Back / front",
  "down-up": "Down / up",
  plane: "Cut plane",
  parameter: "Parameter",
  "cycle-mode": "Next mode",
  "focus-previous": "Prev param",
  "focus-next": "Next param",
  "cycle-step": "Step size",
  center: "Center",
  "next-plane": "Next plane",
};

interface Saved {
  x: number;
  y: number;
  open: boolean;
}

export interface OnScreenHelmOptions {
  surface: ControlSurface;
  /** Told each intent once the surface has carried it out, as the keyboard tells the tutorial. */
  onIntent?: (intent: Intent) => void;
  /** The line under the buttons: what the Helm does now. */
  status: () => string;
  /** Told when the window opens or closes, so a toggle can show it. */
  onToggle?: (open: boolean) => void;
  /** Where the window goes. The body, so the stage never sees the pointer over it. */
  parent?: HTMLElement;
  /** Where position and open state are kept; null, or one that throws, keeps nothing. */
  storage?: () => Storage | null;
}

export class OnScreenHelm implements Controller {
  private readonly surface: ControlSurface;
  private readonly onIntent: (intent: Intent) => void;
  private readonly status: () => string;
  private readonly onToggle: (open: boolean) => void;
  private readonly parent: HTMLElement | undefined;
  private readonly storage: () => Storage | null;

  private root: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private tick: HTMLElement | null = null;
  private line: HTMLElement | null = null;
  private readonly buttons = new Map<Intent, HTMLButtonElement>();
  private x = 24;
  private y = 24;
  private shown = false;
  /** The tick's angle, for the eye only: it says nothing about the step size. */
  private spin = 0;
  private wheel = 0;

  private readonly onResize = () => this.place(this.x, this.y);

  constructor(options: OnScreenHelmOptions) {
    this.surface = options.surface;
    this.onIntent = options.onIntent ?? (() => {});
    this.status = options.status;
    this.onToggle = options.onToggle ?? (() => {});
    this.parent = options.parent;
    this.storage = options.storage ?? (() => window.localStorage);
  }

  get isOpen(): boolean {
    return this.shown;
  }

  attach(): void {
    if (this.root) return;
    const saved = this.load();
    if (saved) {
      this.x = saved.x;
      this.y = saved.y;
    }
    this.root = this.build();
    (this.parent ?? document.body).append(this.root);
    window.addEventListener("resize", this.onResize);
    this.place(this.x, this.y);
    this.setOpen(saved?.open ?? false, false);
    this.refresh();
  }

  detach(): void {
    window.removeEventListener("resize", this.onResize);
    this.root?.remove();
    this.root = this.ring = this.tick = this.line = null;
    this.buttons.clear();
    this.shown = false;
  }

  open(): void {
    this.setOpen(true);
  }

  close(): void {
    this.setOpen(false);
  }

  toggle(): void {
    this.setOpen(!this.shown);
  }

  /** Brings the status line, the lit mode and the dial's value up to date with the surface. */
  refresh(): void {
    if (!this.root || !this.ring || !this.line) return;
    const mode = this.surface.mode;
    this.line.textContent = this.status();
    for (const [intent, button] of this.buttons) {
      if (KNOB_MODES.includes(intent as KnobMode)) button.setAttribute("aria-pressed", String(intent === mode));
    }
    this.ring.setAttribute("aria-valuenow", String(KNOB_MODES.indexOf(mode) + 1));
    this.ring.setAttribute("aria-valuetext", BUTTON_LABEL[mode]);
  }

  /* ---------------- gestures ---------------- */

  private send(intent: Intent): void {
    // A gesture still under way when the window was taken down goes nowhere.
    if (!this.root) return;
    perform(this.surface, intent);
    this.onIntent(intent);
    this.refresh();
  }

  private turn(direction: 1 | -1): void {
    this.spin += direction * DETENT_DEGREES;
    if (this.tick) this.tick.style.transform = `rotate(${this.spin}deg)`;
    this.send(direction > 0 ? "clockwise" : "counter-clockwise");
  }

  /** Leaves the focus off the window, so the next Enter or arrow reaches the keyboard controller. */
  private letKeysThrough(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.root?.contains(active)) active.blur();
  }

  /* ---------------- the window ---------------- */

  private build(): HTMLElement {
    const root = document.createElement("section");
    root.className = "helm";
    root.setAttribute("aria-label", "Virtual Helm");
    // A tap on a button would otherwise focus it, and the keyboard
    // controller ignores keys while a button has the focus.
    root.addEventListener("pointerdown", (event) => event.preventDefault());
    root.addEventListener("mousedown", (event) => event.preventDefault());
    root.addEventListener("click", () => this.letKeysThrough());

    const bar = document.createElement("div");
    bar.className = "helm__bar";
    const title = document.createElement("span");
    title.textContent = "Helm";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "helm__close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close the virtual Helm");
    close.addEventListener("click", () => this.close());
    bar.append(title, close);
    this.dragBy(bar, close);

    const dial = document.createElement("div");
    dial.className = "helm__dial";
    const ring = document.createElement("div");
    ring.className = "helm__ring";
    ring.tabIndex = 0;
    ring.setAttribute("role", "slider");
    ring.setAttribute("aria-label", "Helm dial: drag around it or use the wheel to turn");
    ring.setAttribute("aria-valuemin", "1");
    ring.setAttribute("aria-valuemax", String(KNOB_MODES.length));
    const tick = document.createElement("div");
    tick.className = "helm__tick";
    ring.append(tick);
    const hub = document.createElement("button");
    hub.type = "button";
    hub.className = "helm__hub";
    hub.textContent = "Press";
    hub.setAttribute("aria-label", "Press the Helm: hear where you are");
    hub.addEventListener("click", () => this.send("press"));
    dial.append(ring, hub);
    this.turnBy(ring, dial);

    const grid = document.createElement("div");
    grid.className = "helm__buttons";
    // KEY_MAP's own order puts "0" first, since integer-like keys enumerate before the rest.
    const keyOf = new Map(Object.entries(KEY_MAP).map(([key, intent]) => [intent, key]));
    for (const [intent, label] of Object.entries(BUTTON_LABEL) as Array<[Intent, string]>) {
      const key = keyOf.get(intent);
      if (key === undefined) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.intent = intent;
      button.setAttribute("aria-label", `${label}, key ${key}`);
      const name = document.createElement("span");
      name.textContent = label;
      const hint = document.createElement("kbd");
      hint.textContent = key;
      hint.setAttribute("aria-hidden", "true");
      button.append(name, hint);
      button.addEventListener("click", () => this.send(intent));
      this.buttons.set(intent, button);
      grid.append(button);
    }

    const line = document.createElement("p");
    line.className = "helm__status";

    root.append(bar, dial, grid, line);
    this.ring = ring;
    this.tick = tick;
    this.line = line;
    return root;
  }

  /** Turns the dial by dragging the ring around its center, and by the wheel anywhere over the dial, hub included. */
  private turnBy(ring: HTMLElement, dial: HTMLElement): void {
    let last: number | null = null;
    let carried = 0;
    const angle = (event: PointerEvent) => {
      const box = ring.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      // Screen y runs down, so a growing angle is clockwise.
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    };
    ring.addEventListener("pointerdown", (event) => {
      ring.setPointerCapture?.(event.pointerId);
      last = angle(event);
      carried = 0;
    });
    ring.addEventListener("pointermove", (event) => {
      if (last === null) return;
      const now = angle(event);
      // The short way round, so crossing the 180 degree seam is a small step.
      let delta = now - last;
      if (delta > 180) delta -= 360;
      if (delta <= -180) delta += 360;
      last = now;
      carried += delta;
      while (Math.abs(carried) >= DETENT_DEGREES) {
        const direction = carried > 0 ? 1 : -1;
        carried -= direction * DETENT_DEGREES;
        this.turn(direction);
      }
    });
    const end = (event: PointerEvent) => {
      last = null;
      ring.releasePointerCapture?.(event.pointerId);
    };
    ring.addEventListener("pointerup", end);
    ring.addEventListener("pointercancel", end);
    dial.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const pixels = event.deltaMode === 0 ? event.deltaY : event.deltaY * WHEEL_NOTCH_PIXELS;
        this.wheel += pixels;
        if (Math.abs(this.wheel) < WHEEL_NOTCH_PIXELS) return;
        // Wheel up is clockwise, as the up arrow is.
        const direction = this.wheel < 0 ? 1 : -1;
        this.wheel = 0;
        this.turn(direction);
      },
      { passive: false },
    );
  }

  /** Drags the window by its title bar. */
  private dragBy(bar: HTMLElement, close: HTMLElement): void {
    let grab: { dx: number; dy: number } | null = null;
    bar.addEventListener("pointerdown", (event) => {
      if (close.contains(event.target as Node)) return;
      bar.setPointerCapture?.(event.pointerId);
      grab = { dx: event.clientX - this.x, dy: event.clientY - this.y };
    });
    bar.addEventListener("pointermove", (event) => {
      if (grab) this.place(event.clientX - grab.dx, event.clientY - grab.dy);
    });
    const end = (event: PointerEvent) => {
      if (!grab) return;
      grab = null;
      bar.releasePointerCapture?.(event.pointerId);
      this.save();
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }

  /** Moves the window, kept wholly inside the viewport. */
  private place(x: number, y: number): void {
    if (!this.root) return;
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    this.x = Math.round(Math.max(0, Math.min(x, window.innerWidth - width)));
    this.y = Math.round(Math.max(0, Math.min(y, window.innerHeight - height)));
    this.root.style.left = `${this.x}px`;
    this.root.style.top = `${this.y}px`;
  }

  private setOpen(open: boolean, remember = true): void {
    if (!this.root) return;
    this.shown = open;
    this.root.hidden = !open;
    // Hidden, it had no size to clamp by; shown, it has.
    if (open) this.place(this.x, this.y);
    this.refresh();
    if (remember) this.save();
    this.onToggle(open);
  }

  /* ---------------- remembering ---------------- */

  private load(): Saved | null {
    try {
      const raw = this.storage()?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as Partial<Saved>;
      if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return null;
      return { x: saved.x as number, y: saved.y as number, open: saved.open === true };
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      this.storage()?.setItem(STORAGE_KEY, JSON.stringify({ x: this.x, y: this.y, open: this.shown }));
    } catch {
      // Private windows and blocked storage: the window still works, it just forgets.
    }
  }
}
