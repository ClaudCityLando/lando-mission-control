// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { WebSocketServer, WebSocket } from "ws";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createGatewayListener } = require("../../server/gateway-listener");

const findFreePort = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = require("node:net").createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
};

describe("createGatewayListener", () => {
  let wss: WebSocketServer;
  let port: number;
  let listener: ReturnType<typeof createGatewayListener>;
  let receivedOnServer: unknown[];

  beforeEach(async () => {
    port = await findFreePort();
    receivedOnServer = [];

    wss = new WebSocketServer({ port });

    wss.on("connection", (ws: WebSocket) => {
      ws.on("message", (raw: Buffer) => {
        const parsed = JSON.parse(String(raw));
        receivedOnServer.push(parsed);

        // Auto-respond to connect requests
        if (parsed.type === "req" && parsed.method === "connect") {
          ws.send(
            JSON.stringify({
              type: "res",
              id: parsed.id,
              ok: true,
              payload: { type: "hello-ok", protocol: 3 },
            }),
          );
        }
      });
    });
  });

  afterEach(async () => {
    listener?.stop();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  it("connects and sends connect frame with auth token", async () => {
    const statusUpdates: string[] = [];

    listener = createGatewayListener({
      loadUpstreamSettings: async () => ({
        url: `ws://localhost:${port}`,
        token: "test-token-123",
      }),
      onEvent: () => {},
      onStatus: (s: string) => statusUpdates.push(s),
    });

    listener.start();

    // Wait for connection
    await vi.waitFor(
      () => {
        expect(statusUpdates).toContain("connected");
      },
      { timeout: 5000 },
    );

    expect(receivedOnServer).toHaveLength(1);
    const connectFrame = receivedOnServer[0] as Record<string, unknown>;
    expect(connectFrame.type).toBe("req");
    expect(connectFrame.method).toBe("connect");

    const params = connectFrame.params as Record<string, unknown>;
    expect(params.client).toEqual(
      expect.objectContaining({
        id: "mission-control-listener",
        mode: "observer",
      }),
    );
    expect((params.auth as Record<string, unknown>)?.token).toBe(
      "test-token-123",
    );
  });

  it("forwards event frames to onEvent callback", async () => {
    const events: unknown[] = [];

    listener = createGatewayListener({
      loadUpstreamSettings: async () => ({
        url: `ws://localhost:${port}`,
        token: "test-token",
      }),
      onEvent: (e: unknown) => events.push(e),
      onStatus: () => {},
    });

    listener.start();

    // Wait for connection
    await vi.waitFor(
      () => expect(listener.getStatus()).toBe("connected"),
      { timeout: 5000 },
    );

    // Send an event from the server
    const eventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-1",
        sessionKey: "agent:w1le:main",
        state: "final",
        message: { role: "assistant", content: "Hello" },
      },
    };

    for (const client of wss.clients) {
      client.send(JSON.stringify(eventFrame));
    }

    await vi.waitFor(
      () => {
        expect(events).toHaveLength(1);
      },
      { timeout: 3000 },
    );

    const received = events[0] as Record<string, unknown>;
    expect(received.type).toBe("event");
    expect(received.event).toBe("chat");
  });

  it("reconnects after disconnect", async () => {
    const statusUpdates: string[] = [];

    listener = createGatewayListener({
      loadUpstreamSettings: async () => ({
        url: `ws://localhost:${port}`,
        token: "test-token",
      }),
      onEvent: () => {},
      onStatus: (s: string) => statusUpdates.push(s),
    });

    listener.start();

    // Wait for initial connection
    await vi.waitFor(
      () => expect(listener.getStatus()).toBe("connected"),
      { timeout: 5000 },
    );

    // Close all server-side connections to trigger reconnect
    for (const client of wss.clients) {
      client.close();
    }

    // Should disconnect
    await vi.waitFor(
      () => expect(listener.getStatus()).toBe("disconnected"),
      { timeout: 3000 },
    );

    // Should reconnect
    await vi.waitFor(
      () => expect(listener.getStatus()).toBe("connected"),
      { timeout: 10000 },
    );

    // Should have connected twice
    const connectFrames = receivedOnServer.filter(
      (f) =>
        (f as Record<string, unknown>).type === "req" &&
        (f as Record<string, unknown>).method === "connect",
    );
    expect(connectFrames.length).toBeGreaterThanOrEqual(2);
  });

  it("handles missing gateway URL gracefully", async () => {
    const statusUpdates: string[] = [];

    listener = createGatewayListener({
      loadUpstreamSettings: async () => ({ url: "", token: "" }),
      onEvent: () => {},
      onStatus: (s: string) => statusUpdates.push(s),
      log: () => {},
    });

    listener.start();

    // Should go connecting → disconnected (no URL)
    await vi.waitFor(
      () => {
        expect(statusUpdates).toContain("connecting");
        expect(statusUpdates).toContain("disconnected");
      },
      { timeout: 3000 },
    );

    // Should not be connected
    expect(listener.getStatus()).toBe("disconnected");
  });

  it("stop() prevents further reconnection", async () => {
    listener = createGatewayListener({
      loadUpstreamSettings: async () => ({
        url: `ws://localhost:${port}`,
        token: "test-token",
      }),
      onEvent: () => {},
      onStatus: () => {},
    });

    listener.start();

    await vi.waitFor(
      () => expect(listener.getStatus()).toBe("connected"),
      { timeout: 5000 },
    );

    listener.stop();

    expect(listener.getStatus()).toBe("disconnected");

    // Wait a bit to ensure no reconnect happens
    await new Promise((r) => setTimeout(r, 500));
    expect(listener.getStatus()).toBe("disconnected");
  });
});
