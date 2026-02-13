import { describe, expect, it } from "vitest";

import type { EventFrame } from "@/lib/gateway/GatewayClient";
import { mapEventFrameToEntry } from "@/features/observe/state/observeEventHandler";

describe("observeEventHandler", () => {
  it("maps chat delta events to live writing entries", () => {
    const event: EventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-delta-1",
        sessionKey: "agent:main:main",
        state: "delta",
        message: {
          role: "assistant",
          content: "Drafting a response",
        },
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.eventType).toBe("chat");
    expect(entry?.chatState).toBe("delta");
    expect(entry?.description).toContain("Writing");
    expect(entry?.isDeltaLike).toBe(true);
  });

  it("ignores non-assistant chat delta events", () => {
    const event: EventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-delta-tool",
        sessionKey: "agent:main:main",
        state: "delta",
        message: {
          role: "tool",
          content: "NO_REPLY",
        },
      },
    };

    expect(mapEventFrameToEntry(event)).toBeNull();
  });

  it("falls back to payload agentId when sessionKey is missing", () => {
    const event: EventFrame = {
      type: "event",
      event: "agent",
      payload: {
        runId: "run-1",
        stream: "tool",
        data: {
          phase: "call",
          name: "write",
          arguments: { path: "README.md" },
        },
        agentId: "main",
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.agentId).toBe("main");
    expect(entry?.sessionKey).toBeNull();
    expect(entry?.runId).toBe("run-1");
    expect(entry?.description).toContain("write");
  });

  it("keeps non-text phase streams for activity updates", () => {
    const event: EventFrame = {
      type: "event",
      event: "agent",
      payload: {
        runId: "run-compaction-1",
        sessionKey: "agent:main:main",
        stream: "compaction",
        data: {
          phase: "start",
        },
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.stream).toBe("compaction");
    expect(entry?.description).toBe("compaction: start");
  });

  it("ignores non-runtime events", () => {
    const event: EventFrame = {
      type: "event",
      event: "presence",
      payload: {},
    };

    expect(mapEventFrameToEntry(event)).toBeNull();
  });

  it("extracts channel from user message envelope header", () => {
    const event: EventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-tg-1",
        sessionKey: "agent:main:main",
        state: "final",
        message: {
          role: "user",
          content:
            "[Telegram chat +0s 2026-02-12 18:31 UTC] What do you think about this?",
        },
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.channel).toBe("Telegram");
    expect(entry?.messageRole).toBe("user");
    expect(entry?.description).toContain("Prompt:");
    expect(entry?.description).toContain("What do you think about this?");
  });

  it("populates messageRole and fullText for assistant responses", () => {
    const event: EventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-resp-1",
        sessionKey: "agent:main:main",
        state: "final",
        message: {
          role: "assistant",
          content: "COO is the stronger title for a personal site.",
        },
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.messageRole).toBe("assistant");
    expect(entry?.fullText).toBe(
      "COO is the stronger title for a personal site."
    );
    expect(entry?.channel).toBeNull();
  });

  it("falls back to payload-level extraction when message extraction fails", () => {
    const event: EventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-fallback-1",
        sessionKey: "agent:main:main",
        state: "final",
        message: { role: "assistant" },
        response: "Fallback response content here",
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.description).toContain("Fallback response content here");
  });

  it("filters out NO_ sentinel in assistant chat final", () => {
    const event: EventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-sentinel-1",
        sessionKey: "agent:main:main",
        state: "final",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "NO_" }],
          timestamp: 1770941539864,
        },
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.description).toBe("Response complete");
    expect(entry?.text).toBeNull();
    expect(entry?.fullText).toBeNull();
  });

  it("filters out NO_ sentinel in assistant chat delta", () => {
    const event: EventFrame = {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-sentinel-2",
        sessionKey: "agent:main:main",
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "NO_" }],
        },
      },
    };

    // Delta with sentinel text should be filtered out entirely
    expect(mapEventFrameToEntry(event)).toBeNull();
  });

  it("sets null channel for agent events", () => {
    const event: EventFrame = {
      type: "event",
      event: "agent",
      payload: {
        runId: "run-agent-1",
        sessionKey: "agent:main:main",
        stream: "lifecycle",
        data: { phase: "start" },
      },
    };

    const entry = mapEventFrameToEntry(event);
    expect(entry).toBeTruthy();
    expect(entry?.channel).toBeUndefined();
    expect(entry?.messageRole).toBeUndefined();
  });
});
