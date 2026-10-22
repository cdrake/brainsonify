/**
 * The seams the split made, guarded: the core stays free of brainsonify,
 * and the tools the server offers are exactly the ones the real page can
 * answer. The end-to-end test drives a pretend page; this one checks the
 * real handlers against the real server without a socket.
 */

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { coreHandlers, type View } from "@niivue/nv-mcp/browser";
import { Bridge, CORE_SCHEMAS, buildServer } from "@niivue/nv-mcp/server";
import { describe, expect, it } from "vitest";

import { brainsonifyHandlers, type SoundHost } from "../../brainsonify/src/controllers/agent";
import { BRAINSONIFY_SCHEMAS, brainsonify } from "./brainsonify";

const here = dirname(fileURLToPath(import.meta.url));
/** The core's source, through the link to mono's `@niivue/nv-mcp`. */
const coreDir = realpathSync(resolve(here, "../node_modules/@niivue/nv-mcp/src"));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : name.endsWith(".ts") ? [path] : [];
  });
}

function imports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2]);
}

describe("the core", () => {
  it("imports nothing from brainsonify and nothing outside its own directory", () => {
    const offending: string[] = [];
    for (const file of sources(coreDir)) {
      for (const specifier of imports(file)) {
        const outside = specifier.startsWith(".") && relative(coreDir, resolve(dirname(file), specifier)).startsWith("..");
        if (/brainsonify/i.test(specifier) || outside) offending.push(`${relative(coreDir, file)} imports ${specifier}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it("names a schema for every core tool and no others", () => {
    expect(Object.keys(CORE_SCHEMAS).sort()).toEqual(
      [
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
      ].sort(),
    );
  });
});

describe("the server and the page", () => {
  const sound: SoundHost = {
    sounding: () => false,
    setSound: async (on) => on,
    modes: () => ({ modes: [{ value: "tone", label: "Pure tone" }], current: "tone" }),
    setMode: () => {},
    announce: () => {},
  };
  const pageHandlers = { ...coreHandlers({ view: {} as View }), ...brainsonifyHandlers(sound) };
  /** The three the server answers itself; the page never sees them. */
  const serverSide = ["list_tabs", "use_tab", "new_tab"];

  it("offer and answer the same sixty-six tools", async () => {
    const server = buildServer({ bridge: new Bridge(), extensions: [brainsonify] });
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    await server.connect(serverEnd);
    const client = new Client({ name: "seams", version: "0" });
    await client.connect(clientEnd);
    try {
      const offered = (await client.listTools()).tools.map((tool) => tool.name).sort();
      expect(offered).toHaveLength(66);
      expect(offered).toEqual([...serverSide, ...Object.keys(pageHandlers)].sort());
      expect(offered).toEqual([...Object.keys(CORE_SCHEMAS), ...Object.keys(BRAINSONIFY_SCHEMAS)].sort());
    } finally {
      await client.close();
      await server.close();
    }
  });
});
