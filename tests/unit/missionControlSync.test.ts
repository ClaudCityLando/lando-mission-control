import { describe, it, expect } from "vitest";
import {
  selectPreviewSessionKeys,
  mapPreviewSnapshot,
  buildReconcileTerminalEntry,
  collectRunningRunIds,
} from "@/features/mission-control/state/sync";
import type { SessionStatus } from "@/features/observe/state/types";
import type { SummaryPreviewSnapshot } from "@/features/agents/state/runtimeEventBridge";

const makeSession = (overrides: Partial<SessionStatus> = {}): SessionStatus => ({
  sessionKey: "agent:main:main",
  agentId: "w1le",
  displayName: "w1le",
  origin: "interactive",
  status: "idle",
  lastActivityAt: null,
  currentToolName: null,
  currentToolArgs: null,
  currentActivity: null,
  streamingText: null,
  lastError: null,
  eventCount: 0,
  ...overrides,
});

describe("selectPreviewSessionKeys", () => {
  it("extracts trimmed session keys", () => {
    const sessions = [
      makeSession({ sessionKey: "  agent:main:main  " }),
      makeSession({ sessionKey: "agent:cron:main" }),
    ];
    const keys = selectPreviewSessionKeys(sessions);
    expect(keys).toEqual(["agent:main:main", "agent:cron:main"]);
  });

  it("caps at specified limit", () => {
    const sessions = Array.from({ length: 100 }, (_, i) =>
      makeSession({ sessionKey: `session-${i}` }),
    );
    const keys = selectPreviewSessionKeys(sessions, 10);
    expect(keys).toHaveLength(10);
  });

  it("filters out empty session keys", () => {
    const sessions = [
      makeSession({ sessionKey: "" }),
      makeSession({ sessionKey: "  " }),
      makeSession({ sessionKey: "valid-key" }),
    ];
    const keys = selectPreviewSessionKeys(sessions);
    expect(keys).toEqual(["valid-key"]);
  });
});

describe("mapPreviewSnapshot", () => {
  it("maps preview entries to SessionPreview with agent context", () => {
    const sessions = [
      makeSession({ sessionKey: "agent:main:main", agentId: "w1le" }),
    ];
    const snapshot: SummaryPreviewSnapshot = {
      ts: 1000,
      previews: [
        {
          key: "agent:main:main",
          status: "ok",
          items: [
            { role: "user", text: "Hello", timestamp: 900 },
            { role: "assistant", text: "Hi there", timestamp: 950 },
          ],
        },
      ],
    };
    const result = mapPreviewSnapshot(snapshot, sessions);
    expect(result).toHaveLength(1);
    expect(result[0].sessionKey).toBe("agent:main:main");
    expect(result[0].agentId).toBe("w1le");
    expect(result[0].previewText).toBe("Hi there");
    expect(result[0].latestRole).toBe("assistant");
    expect(result[0].latestTimestamp).toBe(950);
  });

  it("returns null preview for empty/missing status", () => {
    const sessions = [makeSession({ sessionKey: "key1" })];
    const snapshot: SummaryPreviewSnapshot = {
      ts: 1000,
      previews: [{ key: "key1", status: "empty", items: [] }],
    };
    const result = mapPreviewSnapshot(snapshot, sessions);
    expect(result[0].previewText).toBeNull();
  });
});

describe("buildReconcileTerminalEntry", () => {
  it("builds an end entry for ok status", () => {
    const entry = buildReconcileTerminalEntry("session1", "agent1", "run1", "ok");
    expect(entry.id).toBe("reconcile-run1");
    expect(entry.eventType).toBe("agent");
    expect(entry.stream).toBe("lifecycle");
    expect(entry.text).toBe("end");
    expect(entry.severity).toBe("info");
    expect(entry.errorMessage).toBeNull();
  });

  it("builds an error entry for error status", () => {
    const entry = buildReconcileTerminalEntry("session1", "agent1", "run1", "error");
    expect(entry.severity).toBe("error");
    expect(entry.text).toBe("error");
    expect(entry.errorMessage).toContain("reconciled");
  });
});

describe("collectRunningRunIds", () => {
  it("collects runIds for running sessions", () => {
    const sessions = [
      makeSession({ sessionKey: "s1", agentId: "a1", status: "running" }),
      makeSession({ sessionKey: "s2", agentId: "a2", status: "idle" }),
    ];
    const index = { run1: "s1", run2: "s2" };
    const result = collectRunningRunIds(sessions, index);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ runId: "run1", sessionKey: "s1", agentId: "a1" });
  });

  it("returns empty if no running sessions", () => {
    const sessions = [makeSession({ sessionKey: "s1", status: "idle" })];
    const result = collectRunningRunIds(sessions, { run1: "s1" });
    expect(result).toHaveLength(0);
  });
});
