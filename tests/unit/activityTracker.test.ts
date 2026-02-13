// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We require the CJS module directly
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createActivityTracker } = require("../../server/activity-tracker");

const makeTempDir = () => {
  return fs.mkdtempSync(path.join(os.tmpdir(), "activity-tracker-test-"));
};

const makeChatEvent = (
  runId: string,
  sessionKey: string,
  state: string,
  role: string,
  content: string,
) => ({
  type: "event",
  event: "chat",
  payload: {
    runId,
    sessionKey,
    state,
    message: { role, content },
  },
});

const makeAgentEvent = (
  runId: string,
  sessionKey: string,
  stream: string,
  data: Record<string, unknown>,
) => ({
  type: "event",
  event: "agent",
  payload: { runId, sessionKey, stream, data },
});

describe("createActivityTracker", () => {
  let tmpDir: string;
  let tracker: ReturnType<typeof createActivityTracker>;

  beforeEach(() => {
    tmpDir = makeTempDir();
    tracker = createActivityTracker({ stateDir: tmpDir, log: () => {} });
    tracker.start();
  });

  afterEach(() => {
    tracker.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with empty state", () => {
    const stats = tracker.getListenerStats();
    expect(stats.totalActivities).toBe(0);
    expect(stats.activeAccumulators).toBe(0);
  });

  it("accumulates a conversation-turn from chat events", () => {
    const run = "run-1";
    const session = "agent:w1le:main";

    // User message
    tracker.processEvent(
      makeChatEvent(run, session, "final", "user", "[Telegram chat +0s] Hello agent"),
    );

    // Should be accumulating (not yet finalized)
    expect(tracker.getListenerStats().activeAccumulators).toBe(1);
    expect(tracker.getListenerStats().totalActivities).toBe(0);

    // Assistant response finalizes the conversation-turn
    tracker.processEvent(
      makeChatEvent(run, session, "final", "assistant", "Hello! How can I help?"),
    );

    expect(tracker.getListenerStats().activeAccumulators).toBe(0);
    expect(tracker.getListenerStats().totalActivities).toBe(1);

    const activities = tracker.queryActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe("conversation-turn");
    expect(activities[0].status).toBe("completed");
    expect(activities[0].agentId).toBe("w1le");
    expect(activities[0].channel).toBe("Telegram");
    expect(activities[0].metrics.messageCount).toBe(2);
  });

  it("handles agent lifecycle start → tool calls → lifecycle end", () => {
    const run = "run-2";
    const session = "agent:sabine:main";

    tracker.processEvent(
      makeAgentEvent(run, session, "lifecycle", { phase: "start" }),
    );
    tracker.processEvent(
      makeAgentEvent(run, session, "tool", { name: "read", phase: "start" }),
    );
    tracker.processEvent(
      makeAgentEvent(run, session, "tool", { name: "read", phase: "result" }),
    );
    tracker.processEvent(
      makeAgentEvent(run, session, "tool", { name: "write", phase: "start" }),
    );
    tracker.processEvent(
      makeAgentEvent(run, session, "lifecycle", { phase: "end" }),
    );

    const activities = tracker.queryActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0].status).toBe("completed");
    expect(activities[0].agentId).toBe("sabine");
    // 2 tool calls (read start + write start, result doesn't count)
    expect(activities[0].metrics.toolCallCount).toBe(2);
  });

  it("creates error-incident on chat error", () => {
    const run = "run-3";
    const session = "agent:lobot:main";

    tracker.processEvent({
      type: "event",
      event: "chat",
      payload: {
        runId: run,
        sessionKey: session,
        state: "error",
        errorMessage: "Rate limited by API",
        message: { role: "assistant", content: "" },
      },
    });

    const activities = tracker.queryActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe("error-incident");
    expect(activities[0].status).toBe("errored");
  });

  it("creates error-incident on lifecycle error", () => {
    const run = "run-4";
    const session = "agent:lobot:main";

    tracker.processEvent(
      makeAgentEvent(run, session, "lifecycle", { phase: "start" }),
    );
    tracker.processEvent(
      makeAgentEvent(run, session, "lifecycle", {
        phase: "error",
        error: "Connection lost",
      }),
    );

    const activities = tracker.queryActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe("error-incident");
    expect(activities[0].status).toBe("errored");
  });

  it("ignores presence and heartbeat events", () => {
    tracker.processEvent({ type: "event", event: "presence", payload: {} });
    tracker.processEvent({ type: "event", event: "heartbeat", payload: {} });

    expect(tracker.getListenerStats().activeAccumulators).toBe(0);
    expect(tracker.getListenerStats().totalActivities).toBe(0);
  });

  it("ignores delta chat events (streaming noise)", () => {
    const run = "run-5";
    const session = "agent:w1le:main";

    tracker.processEvent(
      makeChatEvent(run, session, "delta", "assistant", "streaming..."),
    );

    // Accumulator created but no eventRefs
    expect(tracker.getListenerStats().activeAccumulators).toBe(1);
  });

  it("filters sentinel values from message text", () => {
    const run = "run-6";
    const session = "agent:w1le:main";

    tracker.processEvent(
      makeChatEvent(run, session, "final", "user", "Hello"),
    );
    tracker.processEvent(
      makeChatEvent(run, session, "final", "assistant", "NO_"),
    );

    const activities = tracker.queryActivities();
    expect(activities).toHaveLength(1);
    // agentResponse should be null since NO_ is a sentinel
    expect(activities[0].summary).not.toContain("NO_");
  });

  describe("queryActivities", () => {
    beforeEach(() => {
      // Create some activities
      for (let i = 0; i < 5; i++) {
        tracker.processEvent(
          makeChatEvent(`run-q-${i}`, "agent:w1le:main", "final", "user", "Hi"),
        );
        tracker.processEvent(
          makeChatEvent(`run-q-${i}`, "agent:w1le:main", "final", "assistant", "Hello"),
        );
      }
      for (let i = 0; i < 3; i++) {
        tracker.processEvent(
          makeChatEvent(`run-s-${i}`, "agent:sabine:main", "final", "user", "Hi"),
        );
        tracker.processEvent(
          makeChatEvent(`run-s-${i}`, "agent:sabine:main", "final", "assistant", "Hello"),
        );
      }
    });

    it("filters by agent", () => {
      const results = tracker.queryActivities({ agent: "w1le" });
      expect(results).toHaveLength(5);
      expect(results.every((a: { agentId: string }) => a.agentId === "w1le")).toBe(true);
    });

    it("filters by limit", () => {
      const results = tracker.queryActivities({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    it("returns all by default (up to 50)", () => {
      const results = tracker.queryActivities();
      expect(results).toHaveLength(8);
    });
  });

  describe("buildDigest", () => {
    it("aggregates agent stats correctly", () => {
      // w1le: 2 conversations via Telegram
      tracker.processEvent(
        makeChatEvent("r1", "agent:w1le:main", "final", "user", "[Telegram chat +0s] Hi"),
      );
      tracker.processEvent(
        makeChatEvent("r1", "agent:w1le:main", "final", "assistant", "Hello"),
      );
      tracker.processEvent(
        makeChatEvent("r2", "agent:w1le:main", "final", "user", "[Telegram chat +0s] Bye"),
      );
      tracker.processEvent(
        makeChatEvent("r2", "agent:w1le:main", "final", "assistant", "Goodbye"),
      );

      // sabine: 1 error
      tracker.processEvent({
        type: "event",
        event: "chat",
        payload: {
          runId: "r3",
          sessionKey: "agent:sabine:main",
          state: "error",
          errorMessage: "Failed",
          message: { role: "assistant", content: "" },
        },
      });

      const since = new Date(Date.now() - 60000).toISOString();
      const digest = tracker.buildDigest(since);

      expect(digest.totalActivities).toBe(3);
      expect(digest.totalErrors).toBe(1);
      expect(digest.agents.w1le.conversations).toBe(2);
      expect(digest.agents.w1le.channels).toContain("Telegram");
      expect(digest.agents.sabine.errors).toBe(1);
    });
  });

  describe("persistence", () => {
    it("writes activities to JSONL and reloads on restart", () => {
      tracker.processEvent(
        makeChatEvent("r-persist", "agent:w1le:main", "final", "user", "Hi"),
      );
      tracker.processEvent(
        makeChatEvent("r-persist", "agent:w1le:main", "final", "assistant", "Hello"),
      );

      expect(tracker.getListenerStats().totalActivities).toBe(1);

      // Stop and create a new tracker with same dir
      tracker.stop();

      const tracker2 = createActivityTracker({ stateDir: tmpDir, log: () => {} });
      tracker2.start();

      expect(tracker2.getListenerStats().totalActivities).toBe(1);
      const activities = tracker2.queryActivities();
      expect(activities[0].agentId).toBe("w1le");

      tracker2.stop();
    });

    it("JSONL file exists after activity finalization", () => {
      tracker.processEvent(
        makeChatEvent("r-file", "agent:w1le:main", "final", "user", "Hi"),
      );
      tracker.processEvent(
        makeChatEvent("r-file", "agent:w1le:main", "final", "assistant", "Hello"),
      );

      const filePath = path.join(tmpDir, "mission-control", "activity.jsonl");
      expect(fs.existsSync(filePath)).toBe(true);

      const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.type).toBe("conversation-turn");
    });
  });

  describe("cron detection", () => {
    it("classifies session with cron: in key as cron-execution", () => {
      tracker.processEvent(
        makeAgentEvent("r-cron", "agent:sabine:cron:daily-update", "lifecycle", { phase: "start" }),
      );
      tracker.processEvent(
        makeAgentEvent("r-cron", "agent:sabine:cron:daily-update", "lifecycle", { phase: "end" }),
      );

      const activities = tracker.queryActivities();
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe("cron-execution");
    });
  });

  describe("runId persistence", () => {
    it("stores runId on finalized activity", () => {
      const runId = "unique-run-id-12345";
      tracker.processEvent(
        makeChatEvent(runId, "agent:w1le:main", "final", "user", "Hi"),
      );
      tracker.processEvent(
        makeChatEvent(runId, "agent:w1le:main", "final", "assistant", "Hello"),
      );

      const activities = tracker.queryActivities();
      expect(activities).toHaveLength(1);
      expect(activities[0].runId).toBe(runId);
    });

    it("persists runId to disk and reloads correctly", () => {
      const runId = "persist-run-id-xyz";
      tracker.processEvent(
        makeChatEvent(runId, "agent:w1le:main", "final", "user", "Hi"),
      );
      tracker.processEvent(
        makeChatEvent(runId, "agent:w1le:main", "final", "assistant", "Hello"),
      );

      tracker.stop();

      const tracker2 = createActivityTracker({ stateDir: tmpDir, log: () => {} });
      tracker2.start();

      const activities = tracker2.queryActivities();
      expect(activities[0].runId).toBe(runId);

      tracker2.stop();
    });
  });

  describe("tool-sequence detection", () => {
    it("reclassifies to tool-sequence when tools present without messages", () => {
      tracker.processEvent(
        makeAgentEvent("r-tools", "agent:w1le:main", "lifecycle", { phase: "start" }),
      );
      tracker.processEvent(
        makeAgentEvent("r-tools", "agent:w1le:main", "tool", { name: "read", phase: "start" }),
      );
      tracker.processEvent(
        makeAgentEvent("r-tools", "agent:w1le:main", "tool", { name: "write", phase: "start" }),
      );
      tracker.processEvent(
        makeAgentEvent("r-tools", "agent:w1le:main", "lifecycle", { phase: "end" }),
      );

      const activities = tracker.queryActivities();
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe("tool-sequence");
    });
  });
});
