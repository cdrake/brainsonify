/**
 * The agent controller: a socket to the MCP server, standing in for a hand.
 *
 * The server in `apps/mcp` holds the door open for agents; this end holds
 * the scene. Each tool call arrives as one JSON request, is put to the
 * scene, and is answered with one JSON response carrying the result or the
 * reason it could not be done. The connection is kept up for as long as the
 * controller is attached: a server that is not running yet, or restarts,
 * is retried with a backoff that settles at half a minute.
 */

import type { AgentRequest, AgentResponse, RegionSummary } from "@brainsonify/control";

import type { Controller } from "./keys";

/** Where the server itself listens for the app. */
export const AGENT_URL = "ws://127.0.0.1:4242/app";

/** The path the dev server proxies to the server, on the page's own origin. */
export const AGENT_PATH = "/agent";

/**
 * The addresses to try, in turn: the page's own origin first, since a browser
 * that allows a page one origin only (Claude's built-in pane) can reach
 * nothing else, then the server directly, for a build served without the
 * proxy in front of it. A page opened from a file has no origin to try.
 */
export function agentUrls(loc: Location = location): string[] {
  if (!loc.protocol.startsWith("http")) return [AGENT_URL];
  const scheme = loc.protocol === "https:" ? "wss" : "ws";
  return [`${scheme}://${loc.host}${AGENT_PATH}`, AGENT_URL];
}

/** How long to wait before the first retry, and the longest wait after that. */
export const RETRY_MS = { first: 1000, longest: 30000 } as const;

/** What the scene lets an agent do. Each method mirrors one MCP tool. */
export interface AgentScene {
  listRegions(query?: string): Promise<RegionSummary[]>;
  goToRegion(region: string, plane?: string): Promise<unknown>;
  whereAmI(): unknown;
}

/**
 * Puts one request to the scene and shapes the answer. Anything thrown
 * becomes the error text the agent reads, so the scene throws in words.
 */
export async function serve(scene: AgentScene, request: AgentRequest): Promise<AgentResponse> {
  const { id, method, params } = request;
  try {
    switch (method) {
      case "list_regions":
        return { id, result: await scene.listRegions(optionalText(params, "query")) };
      case "go_to_region": {
        const region = optionalText(params, "region");
        if (!region) throw new Error("go_to_region needs a region name.");
        return { id, result: await scene.goToRegion(region, optionalText(params, "plane")) };
      }
      case "where_am_i":
        return { id, result: scene.whereAmI() };
      default:
        throw new Error(`Unknown method ${String(method)}.`);
    }
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) };
  }
}

function optionalText(params: Record<string, unknown>, key: string): string | undefined {
  const value = params?.[key];
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

export class AgentController implements Controller {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private wait: number = RETRY_MS.first;
  private attached = false;
  /** Which of the addresses the next attempt goes to. */
  private attempt = 0;
  /** Whether the settled retry has been reported since the last connection. */
  private reported = false;

  constructor(
    private readonly scene: AgentScene,
    private readonly urls: readonly string[] = agentUrls(),
    /** Told when the server is reached and when it is lost, for a status line. */
    private readonly onStatus: (connected: boolean) => void = () => {},
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.connect();
  }

  detach(): void {
    this.attached = false;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    if (!this.attached) return;
    const url = this.urls[this.attempt++ % this.urls.length];
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.wait = RETRY_MS.first;
      this.reported = false;
      console.info(`brainsonify: agent server connected at ${url}`);
      this.onStatus(true);
    });
    socket.addEventListener("message", (event) => {
      void this.handle(String(event.data)).then((response) => {
        if (response && this.socket === socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(response));
        }
      });
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.onStatus(false);
      this.scheduleRetry();
    });
    // A refused connection closes too, so the close handler does the retrying.
    socket.addEventListener("error", () => {});
  }

  private scheduleRetry(): void {
    if (!this.attached || this.retry !== null) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, this.wait);
    this.wait = Math.min(RETRY_MS.longest, this.wait * 2);
    // The browser logs each refused attempt on its own; one line says what
    // they mean, once the retry has settled at its slowest.
    if (this.wait === RETRY_MS.longest && !this.reported) {
      this.reported = true;
      console.warn(
        `brainsonify: no agent server at ${this.urls.join(" or ")}; ` +
          `still trying every ${RETRY_MS.longest / 1000} s. Start it with: bun run mcp`,
      );
    }
  }

  private async handle(text: string): Promise<AgentResponse | null> {
    let request: AgentRequest;
    try {
      request = JSON.parse(text) as AgentRequest;
    } catch {
      return null;
    }
    if (typeof request?.id !== "number") return null;
    return serve(this.scene, request);
  }
}
