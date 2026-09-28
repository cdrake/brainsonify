/**
 * The door an agent comes in by: one Bun process serving two things on one
 * port. `/mcp` speaks the Model Context Protocol over streamable HTTP,
 * which is what an agent's client connects to. `/app` is the socket each
 * page keeps open, so a tool call has somewhere to go. The server is
 * stateless on the MCP side: each request gets its own short-lived server
 * object over the one shared bridge, the shape the SDK documents for HTTP
 * without sessions.
 *
 * Bound to the loopback address only. The socket lets a caller move the
 * crosshair of whoever is looking, and that is not something to offer the
 * network. Loopback alone does not keep a web page out, though: any site
 * open in the same browser can ask it to open a socket to 127.0.0.1, and a
 * hostname an attacker controls can resolve there. So `/app` checks the
 * page's Origin and `/mcp` checks the Host header (the SDK's DNS rebinding
 * guard), each against loopback and whatever the options allow besides.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { Bridge, type BridgeOptions } from "./bridge";
import { buildServer, type Extension } from "./tools";

export interface ServerOptions {
  host?: string;
  port?: number;
  name?: string;
  version?: string;
  extensions?: readonly Extension[];
  bridge?: BridgeOptions;
  /** Where a line about a tab connecting or leaving goes; the console otherwise. */
  log?: (line: string) => void;
  /**
   * The page's address, such as `http://localhost:4200/?agent`, so `new_tab`
   * can give an agent the address that opens the page as a named tab.
   * Without it the tool gives the id and says to add `?tab=<id>` to the
   * address.
   */
  pageUrl?: string;
  /**
   * Page origins allowed to open `/app` besides loopback ones. A loopback
   * origin on any port is always allowed, as is a client that sends no
   * Origin, which is not a browser.
   */
  allowedOrigins?: readonly string[];
  /** Host header values `/mcp` answers to besides this server's own address on the loopback names. */
  allowedHosts?: readonly string[];
}

export interface RunningServer {
  bridge: Bridge;
  host: string;
  port: number;
  /** The MCP endpoint an agent's client attaches to. */
  url: string;
  /** The socket a page opens. */
  appUrl: string;
  stop(): void;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4242;

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Whether a page at `origin` may open the socket: no Origin, one in `allowed`, or a loopback name or the server's own. */
export function originAllowed(origin: string | null, host: string, allowed: readonly string[]): boolean {
  if (origin === null) return true;
  if (allowed.includes(origin)) return true;
  let name: string;
  try {
    name = new URL(origin).hostname;
  } catch {
    return false;
  }
  // URL keeps the brackets on an IPv6 hostname, as the Origin header does.
  return LOOPBACK_NAMES.has(name) || name === host;
}

/** Starts the server. `Bun.serve` is the only runtime dependency. */
export function startServer(options: ServerOptions = {}): RunningServer {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const log = options.log ?? ((line: string) => console.log(line));
  const bridge = new Bridge(options.bridge);
  const name = options.name ?? "niivue";
  const version = options.version ?? "0.1.0";
  const extensions = options.extensions ?? [];
  const allowedOrigins = options.allowedOrigins ?? [];
  const extraHosts = options.allowedHosts ?? [];
  const pageUrl = options.pageUrl;
  const allowedHosts = (): string[] => [...new Set([...[...LOOPBACK_NAMES, host].map((n) => `${n}:${running.port}`), ...extraHosts])];

  async function handleMcp(request: Request): Promise<Response> {
    const server = buildServer({ bridge, extensions, name, version, pageUrl });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: allowedHosts(),
    });
    await server.connect(transport);
    try {
      // With JSON responses the reply is whole by the time this resolves, so
      // the per-request server can go as soon as it has been sent.
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  }

  const listening = Bun.serve({
    hostname: host,
    port,
    // A tool call may wait CALL_TIMEOUT_MS on the page; Bun's default of
    // ten seconds would cut the HTTP request off first.
    idleTimeout: 60,
    fetch(request, server) {
      const { pathname } = new URL(request.url);
      if (pathname === "/app") {
        const origin = request.headers.get("origin");
        if (!originAllowed(origin, host, allowedOrigins)) {
          log(`refused a socket from ${origin}`);
          return new Response("Forbidden origin.", { status: 403 });
        }
        return server.upgrade(request) ? undefined : new Response("Expected a WebSocket.", { status: 426 });
      }
      if (pathname === "/mcp") return handleMcp(request);
      if (pathname === "/") {
        const tabs = bridge.list();
        const lines = tabs.length
          ? tabs.map((tab) => `  ${tab.bound ? "*" : " "} ${tab.id}  ${tab.title}  ${tab.url}`)
          : ["  none"];
        return new Response(
          `${name} MCP server\nmcp endpoint: ${running.url}\napp socket: ${running.appUrl}\n` +
            `tabs (* answers):\n${lines.join("\n")}\n`,
          { headers: { "content-type": "text/plain" } },
        );
      }
      return new Response("Not found.", { status: 404 });
    },
    websocket: {
      open(socket) {
        bridge.attach(socket);
      },
      message(socket, data) {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        const before = bridge.list().length;
        bridge.receive(socket, text);
        const after = bridge.list();
        if (after.length !== before) log(`tab connected: ${after.map((tab) => `${tab.id} "${tab.title}"`).join(", ")}`);
      },
      close(socket) {
        const before = bridge.list().length;
        bridge.detach(socket);
        if (bridge.list().length !== before) log(`tab disconnected (${bridge.list().length} left)`);
      },
    },
  });

  const running: RunningServer = {
    bridge,
    host,
    port: listening.port ?? port,
    url: `http://${host}:${listening.port ?? port}/mcp`,
    appUrl: `ws://${host}:${listening.port ?? port}/app`,
    stop: () => listening.stop(true),
  };
  log(`${name} MCP server on ${running.url}`);
  log(`waiting for pages on ${running.appUrl}`);
  return running;
}
