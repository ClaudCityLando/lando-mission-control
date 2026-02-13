import type { ObserveEntry } from "../state/types";

export type SessionStyle = "conversation" | "agentic";

/**
 * Determine whether a session's entries look conversational (chat-only)
 * or agentic (uses tools, lifecycle events, etc.).
 *
 * A session is "conversational" when it has chat events and tool events
 * make up less than 10% of all events for that session.
 */
export const classifySessionStyle = (
  entries: ObserveEntry[],
  sessionKey: string | null
): SessionStyle => {
  if (!sessionKey) return "agentic";

  const sessionEntries = entries.filter((e) => e.sessionKey === sessionKey);
  if (sessionEntries.length === 0) return "agentic";

  const chatCount = sessionEntries.filter(
    (e) => e.eventType === "chat"
  ).length;
  const toolCount = sessionEntries.filter(
    (e) => e.stream === "tool"
  ).length;

  if (chatCount === 0) return "agentic";
  if (toolCount === 0) return "conversation";

  const total = sessionEntries.length;
  return toolCount / total < 0.1 ? "conversation" : "agentic";
};

/**
 * Build a map of sessionKey → SessionStyle for all sessions in the entries.
 */
export const buildSessionStyleMap = (
  entries: ObserveEntry[]
): Map<string, SessionStyle> => {
  const sessionKeys = new Set<string>();
  for (const e of entries) {
    if (e.sessionKey) sessionKeys.add(e.sessionKey);
  }
  const map = new Map<string, SessionStyle>();
  for (const key of sessionKeys) {
    map.set(key, classifySessionStyle(entries, key));
  }
  return map;
};
