import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { PanelCollapse } from "./collapse";

/** The real page, so the toggle is tested against the markup it ships with. */
const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
}

const toggle = () => document.getElementById("panelToggle") as HTMLButtonElement;

beforeEach(() => {
  document.documentElement.innerHTML = html;
});

describe("collapsing the panel", () => {
  it("starts expanded", () => {
    const panel = new PanelCollapse(memoryStorage());
    expect(panel.collapsed).toBe(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses and expands from its button, saying which it will do next", () => {
    const panel = new PanelCollapse(memoryStorage());
    toggle().click();
    expect(panel.collapsed).toBe(true);
    expect(document.body.classList.contains("panelCollapsed")).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().textContent).toContain("Show panel");
    toggle().click();
    expect(panel.collapsed).toBe(false);
    expect(toggle().textContent).toContain("Hide panel");
  });

  it("remembers a collapsed panel across loads", () => {
    const storage = memoryStorage();
    new PanelCollapse(storage);
    toggle().click();

    document.documentElement.innerHTML = html;
    expect(new PanelCollapse(storage).collapsed).toBe(true);
  });

  it("keeps the panel's live regions in the page while collapsed", () => {
    new PanelCollapse(memoryStorage()).set(true);
    expect(document.getElementById("crosshairStatus")).not.toBeNull();
    expect(document.getElementById("expAnnounce")).not.toBeNull();
    expect(document.querySelector("aside")?.hasAttribute("inert")).toBe(false);
    expect(document.querySelector("aside")?.hidden).toBe(false);
  });
});
