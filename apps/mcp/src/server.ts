/**
 * The brainsonify MCP server: the NiiVue core with the sound tools on top.
 *
 * Everything general lives in `niivue-mcp/server`; this file names the
 * server, picks the port, and adds the brainsonify extension.
 */

import { startServer } from "niivue-mcp/server";

import { brainsonify } from "./brainsonify";

startServer({
  name: "brainsonify",
  version: "0.1.0",
  port: Number(process.env.BRAINSONIFY_MCP_PORT ?? 4242),
  extensions: [brainsonify],
});
