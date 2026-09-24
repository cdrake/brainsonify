/**
 * niivue-mcp: an MCP server for a NiiVue page.
 *
 * This entry is the part both ends share and neither runtime needs: the
 * messages on the wire, the plane arithmetic, region matching and the AAL
 * name table. The server lives under `niivue-mcp/server` (Bun) and the
 * page's end under `niivue-mcp/browser` (DOM).
 */

export type { AgentRequest, AgentResponse, Hello, PlaneState, RegionSummary, TabState } from "./protocol";
export { isHello } from "./protocol";

export {
  PLANE_ALIASES,
  PLANE_ANGLES,
  PLANE_NONE,
  PLANE_OFF,
  cameraForPlane,
  clipNormal,
  depthThrough,
  namePlane,
  resolvePlane,
  samePlane,
  viewDirection,
} from "./planes";

export { ambiguityMessage, findRegion, matchRegion, regionMentions } from "./regions";
export type { Nameable, RegionMatch } from "./regions";

export { SPOKEN_NAMES } from "./names";
