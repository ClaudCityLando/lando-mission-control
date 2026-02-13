import { describe, expect, it } from "vitest";

import { initialObserveState, observeReducer } from "@/features/observe/state/reducer";
import type { ObserveEntry } from "@/features/observe/state/types";

const makeEntry = (
  overrides: Partial<ObserveEntry> & Pick<ObserveEntry, "id">
): ObserveEntry => ({
  id: overrides.id,
  timestamp: overrides.timestamp ?? 1,
  eventType: overrides.eventType ?? "agent",
  sessionKey: overrides.sessionKey ?? null,
  agentId: overrides.agentId ?? null,
  runId: overrides.runId ?? null,
  stream: overrides.stream ?? null,
  toolName: overrides.toolName ?? null,
  toolPhase: overrides.toolPhase ?? null,
  toolArgs: overrides.toolArgs ?? null,
  chatState: overrides.chatState ?? null,
  errorMessage: overrides.errorMessage ?? null,
  text: overrides.text ?? null,
  description: overrides.description ?? "event",
  severity: overrides.severity ?? "info",
  attributionSource: overrides.attributionSource,
  rawStream: overrides.rawStream ?? null,
  isDeltaLike: overrides.isDeltaLike ?? false,
});

describe("observeReducer", () => {
  it("creates a synthetic run session when agent events have runId but no sessionKey", () => {
    const state = observeReducer(initialObserveState, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e1",
          runId: "run-1",
          agentId: "main",
          stream: "tool",
          description: "Calling write",
          toolName: "write",
        }),
      ],
    });

    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({
      sessionKey: "run:run-1",
      agentId: "main",
      status: "running",
      currentActivity: "Calling write",
    });
  });

  it("merges synthetic run session into real session key when available later", () => {
    const withSynthetic = observeReducer(initialObserveState, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e1",
          runId: "run-1",
          agentId: "main",
          stream: "assistant",
          text: "Drafting",
          description: "Writing response...",
        }),
      ],
    });

    const merged = observeReducer(withSynthetic, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e2",
          runId: "run-1",
          sessionKey: "agent:main:studio:session-a",
          agentId: "main",
          stream: "tool",
          description: "Calling read",
          toolName: "read",
        }),
      ],
    });

    expect(merged.sessions).toHaveLength(1);
    expect(merged.sessions[0]).toMatchObject({
      sessionKey: "agent:main:studio:session-a",
      status: "running",
      eventCount: 2,
    });
    expect(merged.runSessionIndex["run-1"]).toBe("agent:main:studio:session-a");
  });

  it("uses run-session index to update existing sessions when later entries omit sessionKey", () => {
    const seeded = observeReducer(initialObserveState, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e1",
          runId: "run-2",
          sessionKey: "agent:main:studio:session-b",
          agentId: "main",
          stream: "lifecycle",
          text: "start",
          description: "Session started",
        }),
      ],
    });

    const updated = observeReducer(seeded, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e2",
          runId: "run-2",
          sessionKey: null,
          stream: "assistant",
          text: "Hello",
          description: "Writing response...",
        }),
      ],
    });

    expect(updated.sessions).toHaveLength(1);
    expect(updated.sessions[0]).toMatchObject({
      sessionKey: "agent:main:studio:session-b",
      status: "running",
      eventCount: 2,
      streamingText: "Hello",
    });
  });

  it("falls back to a single running agent session when runId is not mapped", () => {
    const seeded = observeReducer(initialObserveState, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e1",
          runId: "run-seeded",
          sessionKey: "agent:main:studio:session-main",
          agentId: "main",
          stream: "lifecycle",
          text: "start",
          description: "Session started",
        }),
      ],
    });

    const updated = observeReducer(seeded, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e2",
          runId: "run-unmapped",
          sessionKey: null,
          agentId: "main",
          stream: "assistant",
          text: "Still working",
          description: "Writing response...",
        }),
      ],
    });

    expect(updated.sessions).toHaveLength(1);
    expect(updated.sessions[0]).toMatchObject({
      sessionKey: "agent:main:studio:session-main",
      status: "running",
      streamingText: "Still working",
    });
    expect(updated.runSessionIndex["run-unmapped"]).toBe(
      "agent:main:studio:session-main"
    );
  });

  it("marks chat delta as running activity and updates stream text", () => {
    const started = observeReducer(initialObserveState, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e1",
          runId: "run-chat-delta",
          sessionKey: "agent:main:studio:session-chat",
          agentId: "main",
          stream: "lifecycle",
          text: "start",
          description: "Session started",
        }),
      ],
    });

    const updated = observeReducer(started, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e2",
          eventType: "chat",
          runId: "run-chat-delta",
          sessionKey: "agent:main:studio:session-chat",
          agentId: "main",
          chatState: "delta",
          description: "Writing: drafting",
          text: "drafting",
          isDeltaLike: true,
        }),
      ],
    });

    expect(updated.sessions).toHaveLength(1);
    expect(updated.sessions[0]).toMatchObject({
      sessionKey: "agent:main:studio:session-chat",
      status: "running",
      currentActivity: "Writing: drafting",
      streamingText: "drafting",
    });
  });

  it("coalesces duplicate live deltas across assistant and chat streams", () => {
    const state = observeReducer(initialObserveState, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e1",
          runId: "run-coalesce",
          sessionKey: "agent:main:studio:session-coalesce",
          agentId: "main",
          stream: "assistant",
          text: "Working...",
          description: "Writing: Working...",
          isDeltaLike: true,
        }),
        makeEntry({
          id: "e2",
          eventType: "chat",
          runId: "run-coalesce",
          sessionKey: "agent:main:studio:session-coalesce",
          agentId: "main",
          chatState: "delta",
          text: "Working...",
          description: "Writing: Working...",
          isDeltaLike: true,
        }),
      ],
    });

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      stream: "assistant",
      text: "Working...",
    });
  });

  it("clears run-session index when log is cleared", () => {
    const withEntries = observeReducer(initialObserveState, {
      type: "pushEntries",
      entries: [
        makeEntry({
          id: "e1",
          runId: "run-3",
          sessionKey: "agent:main:studio:session-c",
          agentId: "main",
          stream: "lifecycle",
          text: "start",
          description: "Session started",
        }),
      ],
    });

    const cleared = observeReducer(withEntries, { type: "clearLog" });

    expect(cleared.entries).toEqual([]);
    expect(cleared.runSessionIndex).toEqual({});
  });
});
