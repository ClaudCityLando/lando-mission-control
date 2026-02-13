import type { ObserveEntry, SessionStatus } from "@/features/observe/state/types";
import type {
  SummaryPreviewSnapshot,
  SummaryPreviewEntry,
} from "@/features/agents/state/runtimeEventBridge";

export type SessionPreview = {
  sessionKey: string;
  agentId: string | null;
  previewText: string | null;
  latestRole: "user" | "assistant" | "tool" | "system" | "other" | null;
  latestTimestamp: number | null;
};

export type GatewaySyncSnapshot = {
  syncedAt: number;
  previews: SessionPreview[];
};

export const selectPreviewSessionKeys = (
  sessions: SessionStatus[],
  cap: number = 64,
): string[] => {
  return sessions
    .map((s) => s.sessionKey.trim())
    .filter((k) => k.length > 0)
    .slice(0, cap);
};

export const mapPreviewSnapshot = (
  result: SummaryPreviewSnapshot,
  sessions: SessionStatus[],
): SessionPreview[] => {
  const sessionMap = new Map<string, SessionStatus>();
  for (const s of sessions) {
    sessionMap.set(s.sessionKey, s);
  }

  return (result.previews ?? []).map((entry: SummaryPreviewEntry) => {
    const session = sessionMap.get(entry.key);
    const latestItem = entry.items[entry.items.length - 1] ?? null;
    const ts = latestItem?.timestamp;
    return {
      sessionKey: entry.key,
      agentId: session?.agentId ?? null,
      previewText:
        entry.status === "ok" && latestItem
          ? latestItem.text.trim().slice(0, 240) || null
          : null,
      latestRole: latestItem?.role ?? null,
      latestTimestamp:
        typeof ts === "number" ? ts : typeof ts === "string" ? Date.parse(ts) || null : null,
    };
  });
};

export const buildReconcileTerminalEntry = (
  sessionKey: string,
  agentId: string | null,
  runId: string,
  terminalStatus: "ok" | "error",
): ObserveEntry => ({
  id: `reconcile-${runId}`,
  timestamp: Date.now(),
  eventType: "agent",
  sessionKey,
  agentId,
  runId,
  stream: "lifecycle",
  toolName: null,
  toolPhase: null,
  toolArgs: null,
  chatState: null,
  errorMessage: terminalStatus === "error" ? "Run ended with error (reconciled)" : null,
  text: terminalStatus === "error" ? "error" : "end",
  description:
    terminalStatus === "error" ? "Session error (reconciled)" : "Session ended (reconciled)",
  severity: terminalStatus === "error" ? "error" : "info",
  rawStream: "lifecycle",
});

export const collectRunningRunIds = (
  sessions: SessionStatus[],
  runSessionIndex: Record<string, string>,
): Array<{ runId: string; sessionKey: string; agentId: string | null }> => {
  const runningSessions = new Set(
    sessions.filter((s) => s.status === "running").map((s) => s.sessionKey),
  );
  if (runningSessions.size === 0) return [];

  const results: Array<{ runId: string; sessionKey: string; agentId: string | null }> = [];
  for (const [runId, sessionKey] of Object.entries(runSessionIndex)) {
    if (!runningSessions.has(sessionKey)) continue;
    const session = sessions.find((s) => s.sessionKey === sessionKey);
    results.push({
      runId,
      sessionKey,
      agentId: session?.agentId ?? null,
    });
  }
  return results;
};
