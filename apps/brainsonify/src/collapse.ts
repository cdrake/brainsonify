/**
 * Collapsing the side panel, so the scan can have the whole window.
 *
 * The panel stays in the page while collapsed: its live regions keep
 * announcing and the Helm keeps working, since neither needs the panel on
 * screen. Only the technician's view of it goes. The choice is remembered
 * per browser, so an iPad set up for the scan alone stays that way.
 */

import { el } from "./ui";

const COLLAPSED_KEY = "brainsonify.panelCollapsed";

export class PanelCollapse {
  private readonly button = el<HTMLButtonElement>("panelToggle");
  private readonly label = this.button.querySelector<HTMLElement>(".panelToggleLabel");

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem"> | null = localStorageOrNull(),
  ) {
    this.button.addEventListener("click", () => {
      this.set(!this.collapsed);
      // Leave focus nowhere, as the intro does, so the Helm's keys reach the page.
      this.button.blur();
    });
    this.set(this.read(), false);
  }

  get collapsed(): boolean {
    return document.body.classList.contains("panelCollapsed");
  }

  set(collapsed: boolean, remember = true): void {
    document.body.classList.toggle("panelCollapsed", collapsed);
    this.button.setAttribute("aria-expanded", String(!collapsed));
    if (this.label) this.label.textContent = collapsed ? "Show panel" : "Hide panel";
    this.button.title = collapsed
      ? "Show the panel again"
      : "Hide the panel to give the scan the whole window";
    if (!remember) return;
    try {
      this.storage?.setItem(COLLAPSED_KEY, collapsed ? "1" : "");
    } catch {
      // Storage refused: the panel just opens expanded next time.
    }
  }

  private read(): boolean {
    try {
      return Boolean(this.storage?.getItem(COLLAPSED_KEY));
    } catch {
      return false;
    }
  }
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
