/**
 * The MCP server: the door an agent comes in by.
 *
 * One Bun process serves two things on one port. `/mcp` speaks the Model
 * Context Protocol over streamable HTTP, which is what an agent's client
 * connects to. `/app` is the socket the browser keeps open, so a tool call
 * has somewhere to go. The server is stateless on the MCP side: each
 * request gets its own short-lived server object over the one shared
 * bridge, the shape the SDK documents for HTTP without sessions.
 *
 * Bound to the loopback address only. The socket lets a caller move the
 * crosshair of whoever is listening, and that is not something to offer
 * the network.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { PLANE_ALIASES, PLANE_ANGLES } from "niivue-mcp";

import { Bridge } from "./bridge";

const HOST = "127.0.0.1";
const PORT = Number(process.env.BRAINSONIFY_MCP_PORT ?? 4242);

const bridge = new Bridge();

const PLANE_NAMES = [
  "current",
  ...PLANE_ANGLES.map((plane) => plane.name),
  ...Object.keys(PLANE_ALIASES),
] as [string, ...string[]];

/** The reply an agent reads: a line to say, then the details as JSON. */
function reply(result: unknown, lead?: string) {
  const text = JSON.stringify(result, null, 2);
  return { content: [{ type: "text" as const, text: lead ? `${lead}\n${text}` : text }] };
}

function failure(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text }] };
}

/** A server with the three tools, all answered by the connected tab. */
function mcpServer(): McpServer {
  const server = new McpServer({ name: "brainsonify", version: "0.1.0" });

  server.registerTool(
    "list_regions",
    {
      title: "List atlas regions",
      description:
        "Lists the regions of the AAL atlas the app can navigate to, with each one's " +
        "label as the atlas spells it, its spoken name, its centroid in MNI millimetres, " +
        "and its size in voxels. Pass `query` to keep only regions whose label or name " +
        "contains it. Needs a brainsonify tab open with ?agent in its address.",
      inputSchema: { query: z.string().optional().describe("Text the label or name must contain.") },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      try {
        return reply(await bridge.call("list_regions", { query }));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "go_to_region",
    {
      title: "Go to a region",
      description:
        "Moves the crosshair to the centroid of an atlas region and cuts the volume " +
        "with a plane through that point, so the region is on the exposed face under " +
        "the crosshair. The voxel there is sounded and the region is announced to the " +
        "listener. `region` is a label (Precentral_L) or a spoken name (left precentral gyrus). " +
        "`plane` names the side the cut takes off, or a slice orientation; `current` " +
        "keeps whatever plane is cut now, and cuts coronal when none is. When the " +
        "centroid falls outside its own region (a curved one), the nearest voxel of " +
        "the region is used instead and `snapped` says so. Only works when the loaded " +
        "scan is in MNI space, which the MNI152 demo is.",
      inputSchema: {
        region: z.string().describe("An atlas label or spoken region name."),
        plane: z.enum(PLANE_NAMES).optional().describe("The cut to make through the centroid."),
      },
    },
    async ({ region, plane }) => {
      try {
        const result = await bridge.call("go_to_region", { region, plane });
        const said = (result as { description?: string })?.description;
        return reply(result, said ? `Moved to ${said}` : undefined);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "where_am_i",
    {
      title: "Where the crosshair is",
      description:
        "Reports where the crosshair is now: its position in millimetres and as fractions " +
        "of the volume, the atlas region there if any, which plane is cut, whether sound " +
        "is on, and the description the listener would hear.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return reply(await bridge.call("where_am_i"));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

async function handleMcp(request: Request): Promise<Response> {
  const server = mcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

const listening = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch(request, server) {
    const { pathname } = new URL(request.url);
    if (pathname === "/app") {
      return server.upgrade(request) ? undefined : new Response("Expected a WebSocket.", { status: 426 });
    }
    if (pathname === "/mcp") return handleMcp(request);
    if (pathname === "/") {
      return new Response(
        `brainsonify MCP server\napp: ${bridge.connected ? "connected" : "not connected"}\n` +
          `mcp endpoint: http://${HOST}:${PORT}/mcp\napp socket: ws://${HOST}:${PORT}/app\n`,
        { headers: { "content-type": "text/plain" } },
      );
    }
    return new Response("Not found.", { status: 404 });
  },
  websocket: {
    open(socket) {
      bridge.attach(socket);
      console.log("app connected");
    },
    message(_socket, data) {
      bridge.receive(typeof data === "string" ? data : new TextDecoder().decode(data));
    },
    close(socket) {
      bridge.detach(socket);
      console.log("app disconnected");
    },
  },
});

console.log(`brainsonify MCP server on http://${listening.hostname}:${listening.port}/mcp`);
console.log(`waiting for the app on ws://${listening.hostname}:${listening.port}/app`);
