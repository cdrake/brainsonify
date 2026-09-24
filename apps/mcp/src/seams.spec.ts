/**
 * The seams the split made, guarded: the core stays free of brainsonify,
 * and the tools the server offers are exactly the ones the real page can
 * answer. The end-to-end test drives a pretend page; this one checks the
 * real handlers against the real server without a socket.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { coreHandlers, type View } from "niivue-mcp/browser";
import { Bridge, CORE_SCHEMAS, buildServer } from "niivue-mcp/server";
import { describe, expect, it } from "vitest";

import { brainsonifyHandlers, type SoundHost } from "../../brainsonify/src/controllers/agent";
import { BRAINSONIFY_SCHEMAS, brainsonify } from "./brainsonify";

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = resolve(here, "../../../libs/niivue-mcp/src");

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
      ["list_tabs", "use_tab", "load_volume", "where_am_i", "list_regions", "go_to_region", "set_clip_plane", "set_camera", "screenshot"].sort(),
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
  /** The two the bridge answers itself; the page never sees them. */
  const serverSide = ["list_tabs", "use_tab"];

  it("offer and answer the same thirteen tools", async () => {
    const server = buildServer({ bridge: new Bridge(), extensions: [brainsonify] });
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    await server.connect(serverEnd);
    const client = new Client({ name: "seams", version: "0" });
    await client.connect(clientEnd);
    try {
      const offered = (await client.listTools()).tools.map((tool) => tool.name).sort();
      expect(offered).toHaveLength(13);
      expect(offered).toEqual([...serverSide, ...Object.keys(pageHandlers)].sort());
      expect(offered).toEqual([...Object.keys(CORE_SCHEMAS), ...Object.keys(BRAINSONIFY_SCHEMAS)].sort());
    } finally {
      await client.close();
      await server.close();
    }
  });
});
