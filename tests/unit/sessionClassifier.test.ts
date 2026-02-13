import { describe, expect, it } from "vitest";

import type { ObserveEntry } from "@/features/observe/state/types";
import {
  classifySessionStyle,
  buildSessionStyleMap,
} from "@/features/observe/lib/sessionClassifier";

const makeEntry = (
  overrides: Partial<ObserveEntry> & Pick<ObserveEntry, "id">
): ObserveEntry => ({
  id: overrides.id,
  timestamp: overrides.timestamp ?? 1,
  eventType: overrides.eventType ?? "chat",
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
  description: overrides.description ?? "",
  severity: overrides.severity ?? "info",
  isDeltaLike: overrides.isDeltaLike ?? false,
});

describe("sessionClassifier", () => {
  describe("classifySessionStyle", () => {
    it("returns 'conversation' for chat-only sessions", () => {
      const entries: ObserveEntry[] = [
        makeEntry({
          id: "e1",
          sessionKey: "agent:main:main",
          eventType: "chat",
          chatState: "final",
        }),
        makeEntry({
          id: "e2",
          sessionKey: "agent:main:main",
          eventType: "chat",
          chatState: "final",
        }),
      ];

      expect(classifySessionStyle(entries, "agent:main:main")).toBe(
        "conversation"
      );
    });

    it("returns 'agentic' for sessions with many tool events", () => {
      const entries: ObserveEntry[] = [
        makeEntry({
          id: "e1",
          sessionKey: "agent:main:main",
          eventType: "chat",
        }),
        makeEntry({
          id: "e2",
          sessionKey: "agent:main:main",
          eventType: "agent",
          stream: "tool",
        }),
        makeEntry({
          id: "e3",
          sessionKey: "agent:main:main",
          eventType: "agent",
          stream: "tool",
        }),
        makeEntry({
          id: "e4",
          sessionKey: "agent:main:main",
          eventType: "agent",
          stream: "tool",
        }),
      ];

      expect(classifySessionStyle(entries, "agent:main:main")).toBe("agentic");
    });

    it("returns 'conversation' when tool events are below 10% threshold", () => {
      const entries: ObserveEntry[] = [];
      // 20 chat events
      for (let i = 0; i < 20; i++) {
        entries.push(
          makeEntry({
            id: `c${i}`,
            sessionKey: "agent:main:main",
            eventType: "chat",
          })
        );
      }
      // 1 tool event (5% of 21 total)
      entries.push(
        makeEntry({
          id: "t1",
          sessionKey: "agent:main:main",
          eventType: "agent",
          stream: "tool",
        })
      );

      expect(classifySessionStyle(entries, "agent:main:main")).toBe(
        "conversation"
      );
    });

    it("returns 'agentic' for null sessionKey", () => {
      const entries: ObserveEntry[] = [
        makeEntry({ id: "e1", eventType: "chat" }),
      ];

      expect(classifySessionStyle(entries, null)).toBe("agentic");
    });

    it("returns 'agentic' for empty entries", () => {
      expect(classifySessionStyle([], "agent:main:main")).toBe("agentic");
    });

    it("returns 'agentic' when no chat events exist", () => {
      const entries: ObserveEntry[] = [
        makeEntry({
          id: "e1",
          sessionKey: "agent:main:main",
          eventType: "agent",
          stream: "lifecycle",
        }),
      ];

      expect(classifySessionStyle(entries, "agent:main:main")).toBe("agentic");
    });
  });

  describe("buildSessionStyleMap", () => {
    it("builds a map of session styles", () => {
      const entries: ObserveEntry[] = [
        makeEntry({
          id: "e1",
          sessionKey: "agent:chat:chat",
          eventType: "chat",
        }),
        makeEntry({
          id: "e2",
          sessionKey: "agent:code:code",
          eventType: "agent",
          stream: "tool",
        }),
        makeEntry({
          id: "e3",
          sessionKey: "agent:code:code",
          eventType: "agent",
          stream: "tool",
        }),
      ];

      const map = buildSessionStyleMap(entries);
      expect(map.get("agent:chat:chat")).toBe("conversation");
      expect(map.get("agent:code:code")).toBe("agentic");
    });

    it("returns empty map for empty entries", () => {
      const map = buildSessionStyleMap([]);
      expect(map.size).toBe(0);
    });
  });
});
