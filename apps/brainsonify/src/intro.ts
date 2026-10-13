/**
 * The technician's intro: the five steps for starting a session, shown over
 * the page on every load and again from the panel's Session steps button.
 *
 * The page is meant for a shared tablet that one technician uses with patient
 * after patient, so every load is a new session and opens on the steps. End
 * session is how the technician gets back here between patients: it reloads,
 * which also clears the last patient's scan from the screen and from memory.
 *
 * It owns no loading or sound of its own. The page passes in how to load a
 * volume and how to start, and tells it what loaded, so the intro and the
 * panel can never disagree about the scan on screen.
 */

import { el } from "./ui";

/** A volume the intro can load: the two demos, or a file the technician picks. */
export type IntroSource = "demo" | "demoHead" | "file";

export interface IntroActions {
  /** Loads a demo, or the picked file. Rejects when the load fails. */
  load(source: IntroSource, file?: File): Promise<void>;
  /** Turns the sound on (or replays the key if it is on already). Runs inside the click, so audio may start. */
  start(): void;
  /** The active condition, as the intro names it in the Start step. */
  experiment(): string;
  /** Ends the session: everything from the last patient goes, and the steps come back. */
  end(): void;
}

/** How long End session waits for its second tap before standing down. */
export const END_CONFIRM_MS = 4000;

export class TechnicianIntro {
  private readonly dialog = el<HTMLDialogElement>("intro");
  private readonly status = el("introVolume");
  private readonly experimentName = el("introExperiment");

  private readonly endBtn = el<HTMLButtonElement>("endBtn");
  private endTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly actions: IntroActions) {
    for (const button of this.dialog.querySelectorAll<HTMLButtonElement>("[data-intro-load]")) {
      const source = button.dataset.introLoad as IntroSource;
      button.addEventListener("click", () => (source === "file" ? this.pickFile() : void this.load(source)));
    }
    el("introStart").addEventListener("click", () => {
      this.actions.start();
      this.close();
    });
    el("introSkip").addEventListener("click", () => this.close());
    el("introBtn").addEventListener("click", () => this.open());
    this.endBtn.addEventListener("click", () => this.endTapped());
    // The knob's keys listen on the window. While the technician reads, an
    // arrow pressed on the dialog's text must not move the crosshair behind it.
    this.dialog.addEventListener("keydown", (event) => event.stopPropagation());
  }

  open(): void {
    if (this.dialog.open) return;
    this.experimentName.textContent = this.actions.experiment();
    if (typeof this.dialog.showModal === "function") this.dialog.showModal();
    else this.dialog.setAttribute("open", "");
    el("introStart").focus();
  }

  close(): void {
    if (this.dialog.open && typeof this.dialog.close === "function") this.dialog.close();
    else this.dialog.removeAttribute("open");
    // Nothing focused, so the knob's keys reach the page rather than a button.
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  /** Says what is loaded, or that a load is under way or failed. */
  volume(text: string, failed = false): void {
    this.status.textContent = text;
    this.status.classList.toggle("failed", failed);
  }

  /** The page reports progress and failure through `volume`; a rejection needs nothing more here. */
  private async load(source: IntroSource, file?: File): Promise<void> {
    await this.actions.load(source, file).catch(() => {});
  }

  /**
   * A file picker made on the spot rather than one in the page, so the
   * dialog adds no inputs to the panel's document order.
   */
  private pickFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".nii,.gz,.nii.gz";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void this.load("file", file);
    });
    input.click();
  }

  /**
   * End session takes two taps: the first arms it and says so on the button,
   * the second within a few seconds ends. A stray tap mid-session, on a
   * tablet passed between hands, must not throw a patient's session away.
   */
  private endTapped(): void {
    if (this.endTimer !== undefined) {
      this.disarmEnd();
      this.actions.end();
      return;
    }
    this.endBtn.textContent = "Tap again to end";
    this.endBtn.classList.add("armed");
    this.endTimer = setTimeout(() => this.disarmEnd(), END_CONFIRM_MS);
  }

  private disarmEnd(): void {
    clearTimeout(this.endTimer);
    this.endTimer = undefined;
    this.endBtn.textContent = "End session";
    this.endBtn.classList.remove("armed");
  }
}
