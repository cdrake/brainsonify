/**
 * niivue-mcp/server: the Bun side.
 *
 * `startServer` runs the whole thing; `Bridge`, `buildServer` and the tool
 * helpers are exported for an app that wires its own HTTP, and for tests.
 */

export { Bridge, CALL_TIMEOUT_MS, NO_APP, RETURN_GRACE_MS } from "./bridge";
export type { AppSocket, BridgeOptions, CallResult, ResetReport, TabInfo, TabListing } from "./bridge";

export {
  CORE_SCHEMAS,
  CUT_NAMES,
  PLANE_NAMES,
  buildServer,
  failure,
  registerCoreTools,
  reloadNotice,
  reply,
  toolContext,
} from "./tools";
export type { Extension, ReplyShape, ToolContext, ToolReply } from "./tools";

export { DEFAULT_HOST, DEFAULT_PORT, startServer } from "./http";
export type { RunningServer, ServerOptions } from "./http";
