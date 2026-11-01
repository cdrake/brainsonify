import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ControlAPI, ControlSurface, type KnobScene } from "@brainsonify/control";

import { KEY_MAP, type Intent } from "./keys";
import { DETENT_DEGREES, OnScreenHelm, WHEEL_NOTCH_PIXELS } from "./onscreen";
import { VirtualController } from "./virtual";

function scene(): KnobScene & { moves: Array<[number, number]> } {
  const moves: Array<[number, number]> = [];
  return {
    moves,
    moveCrosshair: (axis, delta) => {
      moves.push([axis, delta]);
    },
    centerCrosshair: () => {},
    movePlane: () => true,
    nextPlane: () => "left",
    describe: () => "here",
  };
}

/** A Storage in memory, for the tests that want one that works. */
function memory(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

let api: ControlAPI;
let stage: ReturnType<typeof scene>;
let said: string[];
let heard: Intent[];
let store: Storage;
let surface: ControlSurface;
let helm: OnScreenHelm;
let keys: VirtualController | null;

function makeHelm(storage: () => Storage | null = () => store): OnScreenHelm {
  const made = new OnScreenHelm({
    surface,
    onIntent: (intent) => heard.push(intent),
    status: () => `${surface.describeMode()} ${surface.describeStep()}`,
    storage,
  });
  made.attach();
  made.open();
  return made;
}

// jsdom has no PointerEvent; the window reads only the coordinates.
function pointer(target: Element, type: string, x = 0, y = 0): void {
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

function tap(target: Element): void {
  pointer(target, "pointerdown");
  pointer(target, "mousedown");
  pointer(target, "pointerup");
  pointer(target, "mouseup");
  (target as HTMLElement).click();
}

const query = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (intent: Intent) => query<HTMLButtonElement>(`.helm__buttons button[data-intent="${intent}"]`);

/** The ring's box: 100 px square with its center at (150, 150). */
function ringAt(): HTMLElement {
  const ring = query(".helm__ring");
  ring.getBoundingClientRect = () => ({ left: 100, top: 100, width: 100, height: 100 }) as DOMRect;
  return ring;
}

/** A point on a circle round the ring's center, `degrees` clockwise from the right. */
function around(degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [150 + 40 * Math.cos(radians), 150 + 40 * Math.sin(radians)];
}

/** Drags around the dial from `from` to `to` degrees, in small steps. */
function drag(ring: Element, from: number, to: number): void {
  pointer(ring, "pointerdown", ...around(from));
  const step = Math.sign(to - from);
  for (let degrees = from + step; Math.abs(to - degrees) >= 1; degrees += step) pointer(ring, "pointermove", ...around(degrees));
  pointer(ring, "pointermove", ...around(to));
  pointer(ring, "pointerup", ...around(to));
}

/** The window's size, which jsdom does not lay out. */
function sized(width: number, height: number): void {
  const root = query(".helm");
  Object.defineProperty(root, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(root, "offsetHeight", { configurable: true, value: height });
}

beforeEach(() => {
  document.body.innerHTML = '<canvas id="gl" tabindex="0"></canvas>';
  api = new ControlAPI();
  stage = scene();
  said = [];
  heard = [];
  store = memory();
  surface = new ControlSurface({ api, scene: stage, announce: (text) => said.push(text) });
  keys = null;
  helm = makeHelm();
});

// A controller left attached would answer the next test's gestures too.
afterEach(() => {
  helm.detach();
  keys?.detach();
});

describe("OnScreenHelm buttons", () => {
  it("has one button for every key the dial does not send, labelled with its key", () => {
    const shown = [...document.querySelectorAll<HTMLButtonElement>(".helm__buttons button")];
    const expected = Object.entries(KEY_MAP).filter(([, intent]) => !["clockwise", "counter-clockwise", "press"].includes(intent));
    expect(shown.map((b) => b.dataset.intent).sort()).toEqual(expected.map(([, intent]) => intent).sort());
    // The modes first, as numbered, and next mode after them rather than first.
    expect(shown.slice(0, 6).map((b) => b.querySelector("kbd")!.textContent)).toEqual(["1", "2", "3", "4", "5", "0"]);
    for (const [key, intent] of expected) {
      expect(button(intent).querySelector("kbd")!.textContent).toBe(key);
      expect(button(intent).getAttribute("aria-label")).toContain(`key ${key}`);
    }
  });

  it("does what each key does", () => {
    tap(button("down-up"));
    expect(surface.mode).toBe("down-up");
    tap(button("cycle-mode"));
    expect(surface.mode).toBe("plane");
    tap(button("parameter"));
    expect(surface.mode).toBe("parameter");
    tap(button("focus-next"));
    expect(surface.focus).toBe("render3d");
    tap(button("focus-previous"));
    tap(button("focus-previous"));
    expect(surface.focus).toBe("glide");
    tap(button("cycle-step"));
    expect(surface.step).toBe("large");
    tap(button("center"));
    expect(said.at(-1)).toBe("Crosshair centered.");
    tap(button("next-plane"));
    expect(said.at(-1)).toBe("Cut plane: left.");
  });

  it("lights the button for the current mode, whichever input changed it", () => {
    expect(button("left-right").getAttribute("aria-pressed")).toBe("true");
    tap(button("back-front"));
    expect(button("back-front").getAttribute("aria-pressed")).toBe("true");
    expect(button("left-right").getAttribute("aria-pressed")).toBe("false");
    surface.setMode("plane");
    helm.refresh();
    expect(button("plane").getAttribute("aria-pressed")).toBe("true");
    expect(query(".helm__ring").getAttribute("aria-valuetext")).toBe("Cut plane");
  });

  it("shows the status line and keeps it current", () => {
    const line = query(".helm__status");
    expect(line.textContent).toBe(`${surface.describeMode()} ${surface.describeStep()}`);
    tap(button("cycle-step"));
    expect(line.textContent).toBe(`${surface.describeMode()} ${surface.describeStep()}`);
  });
});

describe("OnScreenHelm dial", () => {
  it("turns once per detent dragged round, clockwise up and counter-clockwise down", () => {
    const ring = ringAt();
    drag(ring, 0, 3.5 * DETENT_DEGREES);
    expect(stage.moves).toEqual([
      [0, 0.05],
      [0, 0.05],
      [0, 0.05],
    ]);
    drag(ring, 0, -2.5 * DETENT_DEGREES);
    expect(stage.moves.slice(3)).toEqual([
      [0, -0.05],
      [0, -0.05],
    ]);
  });

  it("crosses the left-hand seam as a small turn", () => {
    const ring = ringAt();
    drag(ring, 170, 170 + 2.5 * DETENT_DEGREES);
    expect(stage.moves).toEqual([
      [0, 0.05],
      [0, 0.05],
    ]);
  });

  it("ignores pointer moves when no drag is held", () => {
    const ring = ringAt();
    pointer(ring, "pointermove", ...around(0));
    pointer(ring, "pointermove", ...around(90));
    expect(stage.moves).toEqual([]);
  });

  it("turns one detent per wheel notch, up for clockwise", () => {
    const ring = ringAt();
    const wheel = (deltaY: number, deltaMode = 0) =>
      ring.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaMode, bubbles: true, cancelable: true }));
    wheel(-WHEEL_NOTCH_PIXELS);
    wheel(WHEEL_NOTCH_PIXELS);
    wheel(WHEEL_NOTCH_PIXELS * 6);
    // A trackpad's small deltas add up to one notch.
    wheel(-WHEEL_NOTCH_PIXELS / 2);
    expect(stage.moves).toHaveLength(3);
    wheel(-WHEEL_NOTCH_PIXELS / 2);
    // A line-mode wheel counts a line as a notch.
    wheel(1, 1);
    expect(stage.moves).toEqual([
      [0, 0.05],
      [0, -0.05],
      [0, -0.05],
      [0, 0.05],
      [0, -0.05],
    ]);
  });

  it("turns on the wheel over the hub too", () => {
    ringAt();
    query(".helm__hub").dispatchEvent(
      new WheelEvent("wheel", { deltaY: -WHEEL_NOTCH_PIXELS, bubbles: true, cancelable: true }),
    );
    expect(stage.moves).toEqual([[0, 0.05]]);
  });

  it("rotates the tick with the turns, for the eye only", () => {
    drag(ringAt(), 0, 1.5 * DETENT_DEGREES);
    expect(query(".helm__tick").style.transform).toBe(`rotate(${DETENT_DEGREES}deg)`);
  });

  it("presses on the hub", () => {
    tap(query(".helm__hub"));
    expect(said.at(-1)).toBe("here");
  });

  it("tells onIntent of every gesture", () => {
    drag(ringAt(), 0, 1.5 * DETENT_DEGREES);
    tap(query(".helm__hub"));
    tap(button("cycle-step"));
    expect(heard).toEqual(["clockwise", "press", "cycle-step"]);
  });
});

describe("OnScreenHelm alongside the keyboard", () => {
  it("leaves the focus off its buttons, so Enter still reaches the keyboard controller", () => {
    keys = new VirtualController(surface, window);
    keys.attach();
    const step = button("cycle-step");
    // A browser that focuses on click anyway: the window blurs it after.
    step.addEventListener("mousedown", () => step.focus(), { once: true, capture: true });
    tap(step);
    expect(document.activeElement?.tagName).not.toBe("BUTTON");
    said.length = 0;
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(said).toEqual(["here"]);
  });

  it("stops the pointer focusing a button in the first place", () => {
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    button("center").dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});

describe("OnScreenHelm window", () => {
  beforeEach(() => {
    Object.assign(window, { innerWidth: 800, innerHeight: 600 });
    sized(200, 300);
  });

  it("drags by the title bar and stays inside the viewport", () => {
    const bar = query(".helm__bar");
    const root = query(".helm");
    pointer(bar, "pointerdown", 30, 30);
    pointer(bar, "pointermove", 130, 80);
    expect([root.style.left, root.style.top]).toEqual(["124px", "74px"]);
    pointer(bar, "pointermove", 5000, 5000);
    expect([root.style.left, root.style.top]).toEqual(["600px", "300px"]);
    pointer(bar, "pointermove", -5000, -5000);
    expect([root.style.left, root.style.top]).toEqual(["0px", "0px"]);
    pointer(bar, "pointerup");
    pointer(bar, "pointermove", 300, 300);
    expect(root.style.left).toBe("0px");
  });

  it("clamps again when the viewport shrinks", () => {
    const bar = query(".helm__bar");
    pointer(bar, "pointerdown", 30, 30);
    pointer(bar, "pointermove", 600, 300);
    pointer(bar, "pointerup");
    Object.assign(window, { innerWidth: 400, innerHeight: 350 });
    window.dispatchEvent(new Event("resize"));
    expect([query(".helm").style.left, query(".helm").style.top]).toEqual(["200px", "50px"]);
  });

  it("does not drag from the close button", () => {
    const root = query(".helm");
    const before = [root.style.left, root.style.top];
    pointer(query(".helm__close"), "pointerdown", 30, 30);
    pointer(query(".helm__bar"), "pointermove", 300, 300);
    expect([root.style.left, root.style.top]).toEqual(before);
  });

  it("remembers where it was and whether it was open", () => {
    const bar = query(".helm__bar");
    pointer(bar, "pointerdown", 30, 30);
    pointer(bar, "pointermove", 130, 80);
    pointer(bar, "pointerup");
    helm.detach();
    helm = makeHelm();
    sized(200, 300);
    helm.open();
    expect([query(".helm").style.left, query(".helm").style.top]).toEqual(["124px", "74px"]);

    helm.close();
    helm.detach();
    helm = new OnScreenHelm({ surface, status: () => "", storage: () => store });
    helm.attach();
    expect(helm.isOpen).toBe(false);
    expect(query(".helm").hidden).toBe(true);
  });

  it("works without storage, and with storage that throws", () => {
    const throwing = () => {
      throw new Error("blocked");
    };
    const broken = { getItem: throwing, setItem: throwing } as unknown as Storage;
    for (const storage of [() => null, () => broken, throwing]) {
      helm.detach();
      helm = makeHelm(storage);
      tap(button("down-up"));
      helm.close();
      helm.open();
      expect(surface.mode).toBe("down-up");
      surface.setMode("left-right");
    }
  });

  it("ignores a saved position that is not a pair of numbers", () => {
    store.setItem("brainsonify.virtualHelm", '{"x":"left","y":null,"open":true}');
    helm.detach();
    helm = new OnScreenHelm({ surface, status: () => "", storage: () => store });
    helm.attach();
    expect(helm.isOpen).toBe(false);
  });

  it("closes from its close button and tells onToggle", () => {
    const toggled: boolean[] = [];
    helm.close();
    helm.detach();
    helm = new OnScreenHelm({ surface, status: () => "", storage: () => store, onToggle: (open) => toggled.push(open) });
    helm.attach();
    helm.toggle();
    tap(query(".helm__close"));
    expect(helm.isOpen).toBe(false);
    expect(query(".helm").hidden).toBe(true);
    expect(toggled).toEqual([false, true, false]);
  });

  it("labels every control and makes the dial a slider", () => {
    for (const control of document.querySelectorAll(".helm button, .helm [role=slider]")) {
      expect(control.getAttribute("aria-label"), control.outerHTML).toBeTruthy();
    }
    const ring = query(".helm__ring");
    expect(ring.getAttribute("role")).toBe("slider");
    expect(ring.getAttribute("aria-valuetext")).toBe("Left / right");
  });

  it("takes its DOM and its listeners away when detached", () => {
    const ring = ringAt();
    helm.detach();
    expect(document.querySelector(".helm")).toBeNull();
    drag(ring, 0, 3 * DETENT_DEGREES);
    window.dispatchEvent(new Event("resize"));
    expect(stage.moves).toEqual([]);
  });
});
