import type {
  ObserveAction,
  ObserveAttributionSource,
  ObserveEntry,
  ObserveState,
  SessionStatus,
} from "./types";
import { MAX_ENTRIES } from "./types";

export const initialObserveState: ObserveState = {
  entries: [],
  sessions: [],
  runSessionIndex: {},
  interventionCount: 0,
  paused: false,
};

type SessionUpdateResult = {
  sessions: SessionStatus[];
  runSessionIndex: Record<string, string>;
};

type ResolveSessionKeyResult = {
  sessionKey: string | null;
  attributionSource: ObserveAttributionSource | null;
};

const createSessionFromEntry = (
  sessionKey: string,
  entry: ObserveEntry
): SessionStatus => ({
  sessionKey,
  agentId: entry.agentId,
  displayName: entry.agentId,
  origin: inferOriginFromKey(sessionKey),
  status: "idle",
  lastActivityAt: null,
  currentToolName: null,
  currentToolArgs: null,
  currentActivity: null,
  streamingText: null,
  lastError: null,
  eventCount: 0,
});

const mergeSessionState = (
  target: SessionStatus,
  source: SessionStatus
): SessionStatus => {
  const chooseStatus = (): SessionStatus["status"] => {
    if (target.status === "error" || source.status === "error") return "error";
    if (target.status === "running" || source.status === "running") return "running";
    return "idle";
  };

  return {
    ...target,
    agentId: target.agentId ?? source.agentId,
    displayName: target.displayName ?? source.displayName,
    origin: target.origin !== "unknown" ? target.origin : source.origin,
    status: chooseStatus(),
    lastActivityAt: Math.max(target.lastActivityAt ?? 0, source.lastActivityAt ?? 0) || null,
    currentToolName: target.currentToolName ?? source.currentToolName,
    currentToolArgs: target.currentToolArgs ?? source.currentToolArgs,
    currentActivity: target.currentActivity ?? source.currentActivity,
    streamingText: target.streamingText ?? source.streamingText,
    lastError: target.lastError ?? source.lastError,
    eventCount: target.eventCount + source.eventCount,
  };
};

const syntheticSessionKeyForRun = (runId: string): string => `run:${runId}`;

const normalizeAgentId = (value: string | null | undefined): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const findSingleRunningSessionByAgent = (
  sessions: Map<string, SessionStatus>,
  agentId: string | null | undefined
): string | null => {
  const normalizedAgentId = normalizeAgentId(agentId);
  if (!normalizedAgentId) return null;

  let matchedSessionKey: string | null = null;
  for (const session of sessions.values()) {
    if (session.status !== "running") continue;
    if (normalizeAgentId(session.agentId) !== normalizedAgentId) continue;
    if (matchedSessionKey && matchedSessionKey !== session.sessionKey) {
      return null;
    }
    matchedSessionKey = session.sessionKey;
  }

  return matchedSessionKey;
};

const resolveEntrySessionKey = (
  entry: ObserveEntry,
  runSessionIndex: Record<string, string>,
  sessions: Map<string, SessionStatus>
): ResolveSessionKeyResult => {
  const direct = entry.sessionKey?.trim() ?? "";
  if (direct) {
    return { sessionKey: direct, attributionSource: "sessionKey" };
  }

  const runId = entry.runId?.trim() ?? "";
  if (!runId) {
    return { sessionKey: null, attributionSource: null };
  }

  const linked = runSessionIndex[runId];
  if (linked) {
    return { sessionKey: linked, attributionSource: "runIndex" };
  }

  const runningSession = findSingleRunningSessionByAgent(sessions, entry.agentId);
  if (runningSession) {
    return {
      sessionKey: runningSession,
      attributionSource: "agentRunningSession",
    };
  }

  if (entry.agentId) {
    return {
      sessionKey: syntheticSessionKeyForRun(runId),
      attributionSource: "syntheticRun",
    };
  }
  return { sessionKey: null, attributionSource: null };
};

const updateSessionsFromEntries = (
  sessions: SessionStatus[],
  runSessionIndex: Record<string, string>,
  entries: ObserveEntry[]
): SessionUpdateResult => {
  const map = new Map<string, SessionStatus>();
  for (const s of sessions) {
    map.set(s.sessionKey, { ...s });
  }
  const nextRunSessionIndex = { ...runSessionIndex };

  for (const entry of entries) {
    const runId = entry.runId?.trim() ?? "";
    const sessionKey = entry.sessionKey?.trim() ?? "";
    if (runId && sessionKey) {
      nextRunSessionIndex[runId] = sessionKey;

      const syntheticKey = syntheticSessionKeyForRun(runId);
      if (syntheticKey !== sessionKey) {
        const syntheticSession = map.get(syntheticKey);
        if (syntheticSession) {
          const realSession = map.get(sessionKey);
          if (!realSession) {
            map.set(
              sessionKey,
              mergeSessionState(
                createSessionFromEntry(sessionKey, {
                  ...entry,
                  sessionKey,
                }),
                syntheticSession
              )
            );
          } else {
            map.set(sessionKey, mergeSessionState(realSession, syntheticSession));
          }
          map.delete(syntheticKey);
        }
      }
    }

    const resolved = resolveEntrySessionKey(entry, nextRunSessionIndex, map);
    const resolvedSessionKey = resolved.sessionKey;
    if (!resolvedSessionKey) continue;
    if (runId && !nextRunSessionIndex[runId]) {
      nextRunSessionIndex[runId] = resolvedSessionKey;
    }

    let session = map.get(resolvedSessionKey);
    if (!session) {
      session = createSessionFromEntry(resolvedSessionKey, entry);
      map.set(resolvedSessionKey, session);
    }

    if (!session.agentId && entry.agentId) {
      session.agentId = entry.agentId;
      session.displayName = entry.agentId;
    }

    session.eventCount += 1;
    session.lastActivityAt = entry.timestamp;

    if (entry.stream === "lifecycle") {
      if (entry.text === "start") {
        session.status = "running";
        session.currentToolName = null;
        session.currentToolArgs = null;
        session.currentActivity = "Starting...";
        session.streamingText = null;
        session.lastError = null;
      } else if (entry.text === "end") {
        session.status = "idle";
        session.currentToolName = null;
        session.currentToolArgs = null;
        session.currentActivity = null;
        session.streamingText = null;
      } else if (entry.text === "error") {
        session.status = "error";
        session.lastError = entry.errorMessage;
        session.currentToolName = null;
        session.currentToolArgs = null;
        session.currentActivity = entry.description;
      }
    } else if (entry.stream === "tool") {
      if (session.status !== "error") {
        session.status = "running";
      }
      if (entry.toolPhase !== "result") {
        session.currentToolName = entry.toolName;
        session.currentToolArgs = entry.toolArgs;
        session.currentActivity = entry.description;
        session.streamingText = null;
      } else {
        session.currentActivity = entry.description;
        // Keep tool name visible briefly after result
      }
    } else if (entry.stream === "assistant") {
      if (session.status !== "error") {
        session.status = "running";
      }
      session.currentToolName = null;
      session.currentActivity = "Writing response...";
      if (entry.text) {
        session.streamingText = entry.text;
      }
    } else if (entry.eventType === "agent") {
      if (session.status !== "error") {
        session.status = "running";
      }
      session.currentActivity = entry.description;
    } else if (entry.eventType === "chat") {
      if (entry.chatState === "delta") {
        if (session.status !== "error") {
          session.status = "running";
        }
        session.currentToolName = null;
        session.currentToolArgs = null;
        session.currentActivity = entry.description || "Writing response...";
        if (entry.text) {
          session.streamingText = entry.text;
        }
      } else if (entry.chatState === "final") {
        session.currentActivity = entry.description;
        session.streamingText = null;
      }
    }

    if (entry.severity === "error" && entry.errorMessage) {
      session.lastError = entry.errorMessage;
      session.status = "error";
    }
  }

  return {
    sessions: Array.from(map.values()),
    runSessionIndex: nextRunSessionIndex,
  };
};

const inferOriginFromKey = (key: string): SessionStatus["origin"] => {
  const lower = key.toLowerCase();
  if (lower.includes("cron:") || lower.includes("isolated")) return "cron";
  if (lower.includes("heartbeat")) return "heartbeat";
  return "interactive";
};

const countInterventions = (entries: ObserveEntry[]): number => {
  let count = 0;
  for (const e of entries) {
    if (e.severity === "error") count += 1;
  }
  return count;
};

const shouldCoalesceDelta = (entry: ObserveEntry): boolean => {
  if (entry.isDeltaLike === true) return true;
  return entry.eventType === "chat" && entry.chatState === "delta";
};

const areSameLiveIdentity = (left: ObserveEntry, right: ObserveEntry): boolean => {
  return (
    (left.sessionKey ?? "") === (right.sessionKey ?? "") &&
    (left.runId ?? "") === (right.runId ?? "") &&
    (left.agentId ?? "") === (right.agentId ?? "")
  );
};

const shouldPreferExistingDelta = (
  existing: ObserveEntry,
  incoming: ObserveEntry
): boolean => {
  if (existing.stream === "assistant" && incoming.eventType === "chat") {
    return true;
  }
  if (existing.eventType === "chat" && incoming.stream === "assistant") {
    return false;
  }
  return false;
};

const coalesceEntries = (entries: ObserveEntry[]): ObserveEntry[] => {
  if (entries.length < 2) return entries;

  const next: ObserveEntry[] = [];
  for (const entry of entries) {
    const last = next[next.length - 1];
    if (
      last &&
      shouldCoalesceDelta(last) &&
      shouldCoalesceDelta(entry) &&
      areSameLiveIdentity(last, entry) &&
      (last.text ?? "") === (entry.text ?? "")
    ) {
      if (!shouldPreferExistingDelta(last, entry)) {
        next[next.length - 1] = entry;
      }
      continue;
    }
    next.push(entry);
  }
  return next;
};

export const observeReducer = (
  state: ObserveState,
  action: ObserveAction
): ObserveState => {
  switch (action.type) {
    case "pushEntries": {
      const entries = coalesceEntries(action.entries);
      if (state.paused || entries.length === 0) return state;
      const merged = [...state.entries, ...entries];
      const capped =
        merged.length > MAX_ENTRIES
          ? merged.slice(merged.length - MAX_ENTRIES)
          : merged;
      const { sessions, runSessionIndex } = updateSessionsFromEntries(
        state.sessions,
        state.runSessionIndex,
        entries
      );
      return {
        ...state,
        entries: capped,
        sessions,
        runSessionIndex,
        interventionCount: countInterventions(capped),
      };
    }
    case "hydrateSessions": {
      const existing = new Map<string, SessionStatus>();
      for (const s of state.sessions) {
        existing.set(s.sessionKey, s);
      }
      const merged: SessionStatus[] = [];
      for (const incoming of action.sessions) {
        const current = existing.get(incoming.sessionKey);
        if (current) {
          merged.push({
            ...current,
            displayName: incoming.displayName ?? current.displayName,
            origin:
              incoming.origin !== "unknown"
                ? incoming.origin
                : current.origin,
          });
          existing.delete(incoming.sessionKey);
        } else {
          merged.push(incoming);
        }
      }
      for (const remaining of existing.values()) {
        merged.push(remaining);
      }
      return { ...state, sessions: merged };
    }
    case "togglePause":
      return { ...state, paused: !state.paused };
    case "clearLog":
      return {
        ...state,
        entries: [],
        runSessionIndex: {},
        interventionCount: 0,
      };
    default:
      return state;
  }
};
