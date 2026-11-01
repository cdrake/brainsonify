# Task: an on-screen virtual Helm in a draggable window

Instructions for a Claude Code session. Read `AGENTS.md` first and follow it,
including the rule against committing unasked. `NOTES.md` already has
uncommitted changes from Chris: append to it, never rewrite or reorder what is
there.

## Goal

A floating window that looks and works like the Sonaview Helm: a round dial
the listener turns and presses, plus the technician's buttons. Anyone can
drive the app with the mouse or a touchscreen, with no CrowPanel and without
knowing the key map. It also makes the prototype runnable by someone who has
only a browser (ITEC 444 Team Project #3 is graded by an instructor who will
not have the hardware).

## How the app works now (verified in the repo)

- `libs/control/src/surface.ts`: `ControlSurface` is the one knob and its
  buttons: `turn(steps)`, `press()`, `setMode()`, `cycleMode()`, `cycleStep()`,
  `focusNext()`, `focusPrevious()`, `center()`, `nextPlane()`,
  `describeMode()`, `describeStep()`. Pressing never changes anything.
- `apps/brainsonify/src/controllers/keys.ts`: the `Intent` union, `KEY_MAP`
  (the protocol shared with the physical Helm), `perform(surface, intent)`,
  and the `Controller` interface (`attach`, `detach`).
- `apps/brainsonify/src/controllers/virtual.ts`: `VirtualController`, the
  keyboard stand-in. It ignores keys while focus is in a form control,
  including BUTTON.
- `apps/brainsonify/src/main.ts`, around line 926:
  `new VirtualController(surface, window, (intent) => tutorial.intent(intent)).attach();`
  `showKnob()` writes `#knobStatus` from `describeMode()` and `describeStep()`,
  and runs on `api.onStateChange`. `letKeysThrough()` blurs a just-tapped
  button so Enter reaches the Helm.
- Styles are in `apps/brainsonify/src/styles.css`. Tests are vitest with jsdom
  (`bun run test`, `bun run typecheck`).

## What to build

1. **`apps/brainsonify/src/controllers/onscreen.ts`**: `OnScreenHelm`
   implements `Controller`. Pass it the same `surface`, the same `onIntent`
   callback the keyboard gets (so the tutorial hears on-screen gestures too),
   and a `status: () => string` for its readout. Every gesture goes through
   `perform(surface, intent)`. It must not call surface methods directly or
   keep its own copy of the mode or step.
2. **The window.** Build it as a DOM overlay above the canvas, not a popup:
   - a title bar ("Helm") that drags it
   - the dial
   - the technician's buttons
   - a status line
   - a close button
3. **Dragging.** Use pointer events with `setPointerCapture` on the title bar
   only. Clamp the window inside the viewport, and clamp again on resize.
   Remember the position and open/closed state in `localStorage`, with every
   read and write wrapped in try/catch so it still works when storage throws.
4. **The dial (listener).**
   - Dragging around the center sends one `clockwise` or `counter-clockwise`
     intent per detent. Put the detent angle in one named constant (start at
     15° and tune by feel).
   - The mouse wheel over the dial sends one detent per wheel notch.
   - Clicking or tapping the center hub sends `press`.
   - A small tick mark rotates with the dial for visual feedback. It is purely
     visual: the step size still comes from the surface (`s`), not from how
     far the dial turns, matching CROWPANEL.md.
5. **Buttons (technician).** One button per remaining `KEY_MAP` entry: modes
   1–5, next mode 0, `[` `]`, step `s`, `Home` center, `n` next plane. Label
   each with its function and show its key as a hint. Generate them from
   `KEY_MAP`/`Intent` so a change to the table changes the window. Highlight
   the button for the current mode.
6. **Focus.** Clicking anything in the window must not leave focus on a
   BUTTON, or the keyboard controller will drop the next Enter or arrow key.
   Use `pointerdown` with `preventDefault`, or blur after the click, the same
   way `letKeysThrough` does. Both controllers must work at once.
7. **Status.** The status line shows `status()` and refreshes after each
   intent and on `api.onStateChange`, the same moments as `showKnob`.
8. **Opening it.**
   - Add a "Virtual Helm" toggle button next to "Helm tutorial" in the panel.
   - Open it on load when the URL has `?helm=1`.
   - Do not add a keyboard shortcut unless it is off `KEY_MAP` and off the
     NiiVue keys listed in `virtual.spec.ts`. If unsure, skip the shortcut.
9. **Pointer sampling.** Hovering or dragging on the window must not sonify
   the canvas beneath it. Check this in the browser, not just in tests.
10. **Accessibility.** Give every control an `aria-label`. The dial gets
    `role="slider"` with an `aria-valuetext` of the current mode. The window
    must not trap focus.

## Tests: `apps/brainsonify/src/controllers/onscreen.spec.ts`

Model this on `virtual.spec.ts` (fake `KnobScene`, real `ControlAPI` and
`ControlSurface`, detach in `afterEach`).

- Each technician button produces the same surface effect as its key.
- A dial drag across N detents calls `turn` N times, in the right direction.
- Wheel notches turn the dial, and a hub click presses.
- `onIntent` is called for every gesture.
- Clicking a window button leaves `document.activeElement` off any BUTTON, so
  a following `Enter` keydown still reaches `VirtualController`.
- Dragging the title bar moves the window and clamps it to the viewport.
- Missing or throwing `localStorage` does not break it.
- `detach()` removes the DOM and its listeners.

`bun run test` and `bun run typecheck` must pass.

## Docs

- **README.md:** a short present-tense section on the virtual Helm and `?helm=1`.
- **CROWPANEL.md:** one line noting the on-screen Helm as a third input
  feeding the same surface.
- **NOTES.md:** a new entry per AGENTS.md, in Chris's voice. Leave the
  reasoning as `> _To fill in: ..._` placeholders unless Chris states it in
  the session.

## Out of scope

- Web Serial, Web Bluetooth, and any firmware changes.
- Changing `KEY_MAP` or `ControlSurface` behavior.
- Packaging the build for the instructor. That is a separate task, but note
  anything the overlay needs to work in `bun run build` output.

## Done when

- The window appears via the button and via `?helm=1`, drags, and survives a
  reload.
- Turning, pressing, and every button drive the app exactly as the keys do,
  with the spoken announcements when sound is on.
- The keyboard still works afterward.
- Tests and typecheck pass, and nothing is committed.
