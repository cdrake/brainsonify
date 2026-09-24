/**
 * The server end to end: the real Bun process, real pages (without a
 * browser: see testing/fake-page.ts) over real sockets, and a real MCP
 * client over HTTP, calling every tool.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BRAINSONIFY_SCHEMAS } from "./brainsonify";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");

const CORE_TOOLS = ["list_tabs", "use_tab", "load_volume", "where_am_i", "list_regions", "go_to_region", "set_clip_plane", "set_camera", "screenshot"];
const SOUND_TOOLS = Object.keys(BRAINSONIFY_SCHEMAS);

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

function run(script: string, env: Record<string, string>): ChildProcess {
  const child = spawn("bun", ["run", script], { cwd: appDir, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[${script}] ${chunk}`));
  return child;
}

async function until<T>(what: string, check: () => Promise<T | null | false | undefined>, ms = 15000): Promise<T> {
  const deadline = Date.now() + ms;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const got = await check();
      if (got) return got;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${what}${last ? `: ${String(last)}` : ""}`);
}

/** Millimetres as the page hands them back: a frac-to-mm round trip, so within a hair. */
const mm = (...values: number[]) => values.map((v) => expect.closeTo(v, 3));

type Reply = Awaited<ReturnType<Client["callTool"]>>;
const text = (reply: Reply): string =>
  (reply.content as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
const json = (reply: Reply): Record<string, unknown> => {
  const body = text(reply);
  const at = Math.min(...["\n{", "\n["].map((m) => body.indexOf(m)).filter((i) => i >= 0), body.startsWith("{") || body.startsWith("[") ? 0 : Infinity);
  return JSON.parse(at === 0 ? body : body.slice(at + 1)) as Record<string, unknown>;
};

describe("the brainsonify MCP server, end to end", () => {
  let port: number;
  let server: ChildProcess;
  const pages = new Map<string, ChildProcess>();
  let client: Client;

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  const tabs = async () => (json(await call("list_tabs")) as { tabs: Array<{ id: string; title: string; bound: boolean }> }).tabs;

  const openPage = async (id: string, title: string) => {
    pages.get(id)?.kill();
    pages.set(id, run("src/testing/fake-page.ts", { PAGE_PORT: String(port), PAGE_ID: id, PAGE_TITLE: title }));
    await until(`tab ${id}`, async () => (await tabs()).some((tab) => tab.id === id));
  };
  const closePage = async (id: string) => {
    pages.get(id)?.kill();
    pages.delete(id);
    await until(`tab ${id} to go`, async () => !(await tabs()).some((tab) => tab.id === id));
  };

  beforeAll(async () => {
    port = await freePort();
    server = run("src/server.ts", { BRAINSONIFY_MCP_PORT: String(port) });
    await until("the server", async () => (await fetch(`http://127.0.0.1:${port}/`)).ok);
    client = new Client({ name: "integration", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  }, 30000);

  afterAll(async () => {
    await client?.close().catch(() => {});
    for (const page of pages.values()) page.kill();
    server?.kill();
  });

  it("lists the core tools and the sound tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...CORE_TOOLS, ...SOUND_TOOLS].sort());
  });

  it("says what to open while no page is connected", async () => {
    expect(await tabs()).toEqual([]);
    const reply = await call("where_am_i");
    expect(reply.isError).toBe(true);
    expect(text(reply)).toMatch(/No NiiVue tab is connected/);
  });

  it("drives one page through every tool", async () => {
    await openPage("t1", "first tab");
    expect(await tabs()).toMatchObject([{ id: "t1", title: "first tab", bound: true }]);

    const before = await call("where_am_i");
    expect(json(before)).toMatchObject({ tab: { id: "t1", title: "first tab" }, volume: null });

    const loaded = await call("load_volume", { url: "https://example.test/mni152.nii.gz" });
    expect(loaded.isError).toBeUndefined();
    expect(text(loaded)).toMatch(/^Loaded mni152\.nii\.gz\./);
    expect(json(loaded)).toMatchObject({ name: "mni152.nii.gz", mni: true, bounds: { mm: { min: [-100, -100, -100], max: [100, 100, 100] } } });
    const failed = await call("load_volume", { url: "https://example.test/missing.nii.gz" });
    expect(failed.isError).toBe(true);
    expect(text(failed)).toMatch(/could not be loaded: 404/);

    const regions = json(await call("list_regions", { query: "insula" })) as unknown as Array<{ label: string }>;
    expect(regions.map((r) => r.label)).toEqual(["Insula_L", "Insula_R"]);

    const ambiguous = await call("go_to_region", { region: "insula" });
    expect(ambiguous.isError).toBe(true);
    expect(text(ambiguous)).toMatch(/could mean 2 regions/);

    const went = await call("go_to_region", { region: "left insula", plane: "left" });
    expect(went.isError).toBeUndefined();
    expect(text(went)).toMatch(/^Moved to left insula at -36, 6, 2 mm\./);
    expect(json(went)).toMatchObject({ region: { label: "Insula_L" }, plane: { name: "left", azimuth: 270 }, camera: { azimuth: 90, elevation: 0 }, snapped: false });

    const here = json(await call("where_am_i"));
    expect(here).toMatchObject({ tab: { id: "t1" }, crosshair: { mm: mm(-36, 6, 2) }, plane: { name: "left" }, sounding: false, mode: "tone" });

    const cut = json(await call("set_clip_plane", { plane: "axial", depth: 0.3, face: false }));
    expect(cut).toMatchObject({ plane: { name: "superior", depth: 0.3, azimuth: 0, elevation: 90 }, camera: { azimuth: 90, elevation: 0 } });
    const off = json(await call("set_clip_plane", { plane: "off" }));
    expect(off).toMatchObject({ plane: { name: "off" } });

    const turned = json(await call("set_camera", { azimuth: 45, elevation: -20 }));
    expect(turned).toMatchObject({ camera: { azimuth: 45, elevation: -20 } });

    const shot = await call("screenshot", { max_width: 800 });
    const content = shot.content as Array<{ type: string; mimeType?: string; data?: string }>;
    expect(content.map((c) => c.type)).toEqual(["text", "image"]);
    expect(content[1].mimeType).toBe("image/png");
    expect(content[1].data?.startsWith("iVBORw0KGgo")).toBe(true);
    expect(json(shot)).toMatchObject({ width: 320, height: 240 });

    expect(json(await call("set_sound", { on: true }))).toEqual({ sounding: true });
    expect(text(await call("set_sound", { on: true }))).toMatch(/^Sound on\./);
    expect(json(await call("list_modes"))).toMatchObject({ current: "tone" });
    expect(json(await call("set_mode", { mode: "noise" }))).toEqual({ mode: "noise", sounding: true });
    const bad = await call("set_mode", { mode: "kazoo" });
    expect(bad.isError).toBe(true);
    const said = json(await call("announce", { text: "Going to the hippocampus next." }));
    expect(said).toMatchObject({ said: "Going to the hippocampus next.", spoken: true });
    expect((said.announced as string[]).at(-1)).toBe("Going to the hippocampus next.");
    expect(json(await call("where_am_i"))).toMatchObject({ sounding: true, mode: "noise" });
  }, 30000);

  it("asks which tab when two are open, then drives the chosen one", async () => {
    await openPage("t2", "second tab");
    // The first tab answered last, so it keeps answering.
    expect(json(await call("where_am_i"))).toMatchObject({ tab: { id: "t1" } });
    expect(await tabs()).toMatchObject([{ id: "t1", bound: true }, { id: "t2", bound: false }]);

    const chosen = await call("use_tab", { id: "t2" });
    expect(text(chosen)).toMatch(/^Driving "second tab"\./);
    expect(json(await call("where_am_i"))).toMatchObject({ tab: { id: "t2", title: "second tab" }, volume: null });
    expect(await tabs()).toMatchObject([{ id: "t1", bound: false }, { id: "t2", bound: true }]);

    const missing = await call("use_tab", { id: "nope" });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toMatch(/No connected tab has the id "nope"/);

    await closePage("t1");
    await closePage("t2");
    // The bridge gives a gone tab a few seconds to come back from a reload
    // before it says so; that wait is this test's five seconds.
    const gone = await call("where_am_i");
    expect(gone.isError).toBe(true);
    expect(text(gone)).toMatch(/chosen with use_tab \(t2\) is no longer connected/);
  }, 30000);

  it("re-binds a reloaded tab by id and reports the reset once", async () => {
    await openPage("t3", "third tab");
    await call("load_volume", { url: "https://example.test/mni152.nii.gz" });
    await call("go_to_region", { region: "Precentral_L", plane: "superior" });
    await call("set_sound", { on: true });
    expect(json(await call("where_am_i"))).toMatchObject({ crosshair: { mm: mm(-40, -6, 50) }, sounding: true });

    // A reload: the same id on a new connection.
    await closePage("t3");
    await openPage("t3", "third tab");

    const after = await call("where_am_i");
    expect(after.isError).toBeUndefined();
    expect(text(after)).toMatch(/^Note: the tab "third tab" reloaded at .* so its scene started over\. Changed: volume was mni152\.nii\.gz, now unset; crosshair was \[-40, -6, 50\] mm, now unset; plane was superior, now unset; sounding was true, now false\./);
    expect(json(after)).toMatchObject({ tab: { id: "t3" }, volume: null, reloaded: { before: { volume: "mni152.nii.gz", sounding: true }, after: { volume: null } } });
    expect(text(await call("where_am_i"))).not.toMatch(/^Note/);
    await closePage("t3");
  }, 30000);
});
