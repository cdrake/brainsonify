/**
 * niivue-mcp/browser: the page side.
 *
 * `coreHandlers(host)` answers the core tools from a NiiVue scene;
 * `AgentClient` keeps the socket to the server and puts each request to
 * those handlers, plus any the app adds.
 */

export { AGENT_PATH, AGENT_URL, AgentClient, RETRY_MS, TAB_ID_KEY, agentUrls, serve, tabId } from "./client";
export type { ClientOptions } from "./client";

export { SCREENSHOT_WIDTH, coreHandlers, looksMni, nameFromUrl, planeIsCut, sceneState } from "./scene";
export type { AtlasLike, AtlasRegion, Handler, Handlers, LoadedVolume, NiiVueHost, View } from "./scene";
