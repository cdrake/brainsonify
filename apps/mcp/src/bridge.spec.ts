import { describe, expect, it, vi } from "vitest";

import { Bridge, NO_APP, type AppSocket } from "./bridge";

const socket = (): AppSocket & { sent: string[] } => {
  const sent: string[] = [];
  return { sent, send: (text: string) => sent.push(text) };
};

describe("Bridge", () => {
  it("refuses a call when no tab is connected", async () => {
    await expect(new Bridge().call("where_am_i")).rejects.toThrow(NO_APP);
  });

  it("writes a request with a fresh id and resolves with the matching response", async () => {
    const bridge = new Bridge();
    const app = socket();
    bridge.attach(app);
    const call = bridge.call("go_to_region", { region: "Insula_L" });
    expect(JSON.parse(app.sent[0])).toEqual({ id: 1, method: "go_to_region", params: { region: "Insula_L" } });
    bridge.receive(JSON.stringify({ id: 99, result: "not mine" }));
    bridge.receive("not json");
    bridge.receive(JSON.stringify({ id: 1, result: { landed: true } }));
    await expect(call).resolves.toEqual({ landed: true });
  });

  it("rejects with the app's error text", async () => {
    const bridge = new Bridge();
    const app = socket();
    bridge.attach(app);
    const call = bridge.call("go_to_region", { region: "nowhere" });
    bridge.receive(JSON.stringify({ id: 1, error: "No region matches" }));
    await expect(call).rejects.toThrow("No region matches");
  });

  it("times out a call the app never answers", async () => {
    vi.useFakeTimers();
    try {
      const bridge = new Bridge(50);
      bridge.attach(socket());
      const call = bridge.call("list_regions");
      const outcome = expect(call).rejects.toThrow("did not answer list_regions");
      vi.advanceTimersByTime(60);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails what is pending when the tab goes, and ignores a stale tab's close", async () => {
    const bridge = new Bridge();
    const first = socket();
    const second = socket();
    bridge.attach(first);
    const onFirst = bridge.call("where_am_i");
    bridge.attach(second);
    await expect(onFirst).rejects.toThrow("reconnected");
    expect(bridge.connected).toBe(true);
    bridge.detach(first);
    expect(bridge.connected).toBe(true);
    const onSecond = bridge.call("where_am_i");
    bridge.detach(second);
    await expect(onSecond).rejects.toThrow("disconnected");
    expect(bridge.connected).toBe(false);
  });
});
