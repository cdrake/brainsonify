/**
 * The server end to end: the real Bun process, real pages (without a
 * browser: see testing/fake-page.ts) over real sockets, and a real MCP
 * client over HTTP, calling every tool.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BRAINSONIFY_SCHEMAS } from "./brainsonify";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");

const CORE_TOOLS = [
  "list_tabs", "use_tab", "new_tab", "load_volume", "add_overlay", "where_am_i", "list_regions", "go_to_region",
  "go_to_point", "set_clip_plane", "set_camera", "set_volume", "set_labels", "set_view", "screenshot",
  "nudge_crosshair", "transform_volume", "remove_volume", "reorder_volume", "describe_volume",
  "get_options", "set_options", "capabilities", "add_colormap", "set_font", "set_custom_layout",
  "load_mesh", "list_meshes", "set_mesh", "remove_mesh", "add_mesh_layer", "set_mesh_layer", "remove_mesh_layer",
  "load_signal", "list_signals", "set_signal", "remove_signal", "set_graph",
  "edit_drawing", "list_annotations", "edit_annotations", "list_measurements", "edit_measurements",
  "set_viewport", "map_point", "set_slide", "chunk_stats", "save", "load_document",
  "add_control", "list_controls", "set_control", "remove_control",
  "list_data", "add_data", "remove_data", "load_data",
  "update_volume_data", "update_mesh_positions", "set_boxes", "animate", "set_instances",
];
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
    server = run("src/server.ts", { BRAINSONIFY_MCP_PORT: String(port), BRAINSONIFY_PAGE: "http://localhost:4200/?agent" });
    await until("the server", async () => (await fetch(`http://127.0.0.1:${port}/`)).ok);
    client = new Client({ name: "integration", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  }, 30000);

  afterAll(async () => {
    await client?.close().catch(() => {});
    for (const page of pages.values()) page.kill();
    server?.kill();
  });

  it("tells a connecting agent what the page can load", () => {
    expect(client.getInstructions()).toMatch(/mni152\.nii\.gz/);
    expect(client.getInstructions()).toMatch(/aal\.json/);
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

    const overlaid = await call("add_overlay", { url: "https://example.test/zstat.nii.gz", colormap: "red" });
    expect(overlaid.isError).toBeUndefined();
    expect(json(overlaid)).toMatchObject({
      volumes: [
        { index: 0, name: "mni152.nii.gz" },
        { index: 1, name: "zstat.nii.gz", colormap: "red", opacity: 0.7 },
      ],
    });

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

    const drawn = await call("set_volume", { volume: "zstat", opacity: 0.4, cal_min: 20 });
    expect(drawn.isError).toBeUndefined();
    expect(text(drawn)).toMatch(/^Changed zstat\.nii\.gz\./);
    expect(json(drawn)).toMatchObject({ volume: { index: 1, name: "zstat.nii.gz", colormap: "red", opacity: 0.4, calMin: 20, calMax: 100, globalMin: 0, globalMax: 255 } });
    const empty = await call("set_volume", { volume: "zstat", cal_max: 10 });
    expect(empty.isError).toBe(true);
    expect(text(empty)).toMatch(/cal_min \(20\) must not be above cal_max \(10\)/);

    const laid = await call("set_view", { slice: "multiplanar", layout: "grid", colorbar: true });
    expect(laid.isError).toBeUndefined();
    expect(text(laid)).toMatch(/^View: multiplanar, grid layout\./);
    expect(json(laid)).toMatchObject({ view: { slice: "multiplanar", layout: "grid", showRender: "auto", radiological: false, colorbar: true } });
    expect(json(await call("where_am_i"))).toMatchObject({ volumes: [{ index: 0 }, { index: 1, opacity: 0.4 }], view: { slice: "multiplanar", colorbar: true } });

    const point = json(await call("go_to_point", { mm: [10, 20, 30], plane: "anterior" }));
    expect(point).toMatchObject({ landed: { mm: mm(10, 20, 30), frac: [0.55, 0.6, 0.65] }, plane: { name: "anterior" } });

    const shot = await call("screenshot", { max_width: 800 });
    const content = shot.content as Array<{ type: string; mimeType?: string; data?: string }>;
    expect(content.map((c) => c.type)).toEqual(["text", "image"]);
    expect(content[1].mimeType).toBe("image/png");
    expect(content[1].data?.startsWith("iVBORw0KGgo")).toBe(true);
    expect(json(shot)).toMatchObject({ width: 320, height: 240 });
    expect(json(shot)).not.toHaveProperty("data");

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

  it("answers calls to one tab in the order they were made, one at a time", async () => {
    await openPage("t2", "second tab");
    const load = call("load_volume", { url: "https://example.test/mni152.nii.gz" });
    const go = call("go_to_region", { region: "left insula", plane: "left" });
    const here = call("where_am_i");
    const [loaded, went, where] = await Promise.all([load, go, here]);
    expect(loaded.isError).toBeUndefined();
    expect(went.isError).toBeUndefined();
    expect(json(where)).toMatchObject({ volume: "mni152.nii.gz", crosshair: { mm: mm(-36, 6, 2) }, plane: { name: "left" } });
    await closePage("t2");
  }, 30000);

  it("refuses the socket to a page from a foreign origin and takes one from loopback", async () => {
    // A plain GET is not an upgrade, so an allowed origin gets 426 rather
    // than a socket; a refused one never gets that far.
    const status = async (origin: string) => (await fetch(`http://127.0.0.1:${port}/app`, { headers: { origin } })).status;
    expect(await status("https://evil.example")).toBe(403);
    expect(await status("http://localhost:8091")).toBe(426);
    expect(await status("http://[::1]:5173")).toBe(426);
    expect(await status(`http://127.0.0.1:${port}`)).toBe(426);
  });

  it("refuses an MCP request whose Host header does not name this server", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    // Through node:http, not fetch: fetch treats Host as a forbidden header
    // and writes the real one, which is what a DNS-rebinding request lacks.
    const post = (host: string) =>
      new Promise<{ status: number; text: string }>((resolve, reject) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port,
            path: "/mcp",
            method: "POST",
            headers: { host, "content-type": "application/json", accept: "application/json, text/event-stream", "content-length": Buffer.byteLength(body) },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString() }));
          },
        );
        req.on("error", reject);
        req.end(body);
      });
    const rebound = await post("niivue.attacker.example");
    expect(rebound.status).toBe(403);
    expect(rebound.text).toMatch(/Invalid Host header/);
    const own = await post(`localhost:${port}`);
    expect(own.status).toBe(200);
  });

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

  it("gives a duplicated tab its own id and keeps the original answering", async () => {
    await openPage("t4", "fourth tab");
    expect(json(await call("where_am_i"))).toMatchObject({ tab: { id: "t4" } });
    // A duplicate: a fresh page whose copied sessionStorage says t4.
    const copy = run("src/testing/fake-page.ts", { PAGE_PORT: String(port), PAGE_ID: "t4", PAGE_TITLE: "fourth tab" });
    try {
      await until("the copy to be welcomed", async () => (await tabs()).some((tab) => tab.id === "t4-2"));
      expect(await tabs()).toMatchObject([
        { id: "t4", title: "fourth tab", bound: true },
        { id: "t4-2", title: "fourth tab", bound: false },
      ]);
      expect(json(await call("where_am_i"))).toMatchObject({ tab: { id: "t4" } });
      await call("use_tab", { id: "t4-2" });
      const answer = await call("where_am_i");
      expect(text(answer)).not.toMatch(/^Note/);
      expect(json(answer)).toMatchObject({ tab: { id: "t4-2" } });
    } finally {
      copy.kill();
    }
    await closePage("t4");
    await until("the copy to go", async () => (await tabs()).length === 0);
  }, 30000);

  it("reaches a tab named by new_tab and opened from its address, past whatever is chosen", async () => {
    await openPage("t5", "fifth tab");
    await call("use_tab", { id: "t5" });
    const made = json(await call("new_tab")) as { id: string; url: string };
    expect(made.url).toBe(`http://localhost:4200/?agent=&tab=${made.id}`);
    const gone = await call("where_am_i", { tab: made.id });
    expect(gone.isError).toBe(true);
    expect(text(gone)).toMatch(new RegExp(`^No connected tab has the id "${made.id}"\\. Connected: t5`));
    // The person opens the address: the page takes its id from the query string.
    const search = new URL(made.url).search;
    pages.set(made.id, run("src/testing/fake-page.ts", { PAGE_PORT: String(port), PAGE_SEARCH: search, PAGE_TITLE: "named tab" }));
    await until(`tab ${made.id}`, async () => (await tabs()).some((tab) => tab.id === made.id));
    const reached = await call("where_am_i", { tab: made.id });
    expect(json(reached)).toMatchObject({ tab: { id: made.id, title: "named tab" }, sounding: false });
    // Named calls do not move the choice.
    expect(json(await call("where_am_i"))).toMatchObject({ tab: { id: "t5" } });
    const sounded = await call("set_sound", { on: true, tab: made.id });
    expect(sounded.isError).toBeUndefined();
    expect(json(await call("where_am_i", { tab: made.id }))).toMatchObject({ sounding: true });
    expect(json(await call("where_am_i"))).toMatchObject({ sounding: false });
    await closePage(made.id);
    await closePage("t5");
    // The choice of t5 stands until a bare call finds it gone, which this
    // test does not make; it runs last so no other test inherits the wait.
  }, 30000);
});
