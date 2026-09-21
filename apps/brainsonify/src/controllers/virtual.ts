/**
 * The virtual controller: the keyboard standing in for the knob and buttons.
 *
 * It listens on the window, so the keys work wherever the focus is, except
 * inside a form control, where the browser's own keyboard handling (arrows
 * on a slider, Enter on a button) must keep working. A key with a modifier
 * held is left alone too, so browser shortcuts survive.
 */

import type { ControlSurface } from "@brainsonify/control";

import { intentOf, perform, type Controller } from "./keys";

export class VirtualController implements Controller {
  private readonly onKey = (event: KeyboardEvent) => this.handle(event);

  constructor(
    private readonly surface: ControlSurface,
    private readonly target: EventTarget = window,
  ) {}

  attach(): void {
    this.target.addEventListener("keydown", this.onKey as EventListener);
  }

  detach(): void {
    this.target.removeEventListener("keydown", this.onKey as EventListener);
  }

  private handle(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isFormControl(event.target)) return;
    const intent = intentOf(event.key);
    if (!intent) return;
    event.preventDefault();
    perform(this.surface, intent);
  }
}

function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName);
}
