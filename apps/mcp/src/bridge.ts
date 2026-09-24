/**
 * The bridge between an agent's tool call and the one tab that can act on it.
 *
 * The browser connects over a socket and stays connected; the server holds
 * that socket here. A call is one request written to it and one response
 * read back, matched by id. The server does nothing itself: every answer
 * comes from the app, which is where the volume, the atlas and the listener
 * are. With no tab connected a call fails at once, in words that say what
 * to open.
 */

import type { AgentRequest, AgentResponse } from "niivue-mcp";

/** Anything that can carry text to the app. `Bun.serve`'s socket does. */
export interface AppSocket {
  send(text: string): unknown;
}

/** How long a call may take before the agent is told the app did not answer. */
export const CALL_TIMEOUT_MS = 15000;

export const NO_APP =
  "No brainsonify tab is connected. Open the app with ?agent in the address " +
  "(the dev server serves it at http://localhost:4200/?agent) and try again.";

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Bridge {
  private socket: AppSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly timeoutMs = CALL_TIMEOUT_MS) {}

  get connected(): boolean {
    return this.socket !== null;
  }

  /**
   * A tab has connected. The newest one wins: a page reloaded in place, or
   * a second tab opened, is the one the person is looking at. Calls still
   * waiting on the old tab are failed rather than left hanging.
   */
  attach(socket: AppSocket): void {
    if (this.socket && this.socket !== socket) this.failAll("The app reconnected before it answered.");
    this.socket = socket;
  }

  /** A tab has gone. Only the current one matters; a stale close is ignored. */
  detach(socket: AppSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.failAll("The app disconnected before it answered.");
  }

  /** Text from the tab. Anything that is not a response to an open call is dropped. */
  receive(text: string): void {
    let response: AgentResponse;
    try {
      response = JSON.parse(text) as AgentResponse;
    } catch {
      return;
    }
    const waiting = this.pending.get(response?.id);
    if (!waiting) return;
    this.pending.delete(response.id);
    clearTimeout(waiting.timer);
    if (response.error !== undefined) waiting.reject(new Error(response.error));
    else waiting.resolve(response.result);
  }

  /** Puts one tool call to the app and waits for its answer. */
  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error(NO_APP));
    const id = this.nextId++;
    const request: AgentRequest = { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The app did not answer ${method} within ${this.timeoutMs / 1000} seconds.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify(request));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private failAll(reason: string): void {
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}
