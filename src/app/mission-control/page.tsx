"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createStudioSettingsCoordinator } from "@/lib/studio/coordinator";
import {
  useGatewayConnection,
  parseAgentIdFromSessionKey,
} from "@/lib/gateway/GatewayClient";
import type { EventFrame } from "@/lib/gateway/GatewayClient";
import { createRafBatcher } from "@/lib/dom";
import { mapEventFrameToEntry } from "@/features/observe/state/observeEventHandler";
import {
  observeReducer,
  initialObserveState,
} from "@/features/observe/state/reducer";
import type { SessionStatus } from "@/features/observe/state/types";
import type { MissionControlContext } from "@/features/mission-control/state/types";
import type { CronJob } from "@/features/observe/components/CronSchedulePanel";
import type { SummaryPreviewSnapshot } from "@/features/agents/state/runtimeEventBridge";
import { MissionControlHeader } from "@/features/mission-control/components/MissionControlHeader";
import { AgentFleetPanel } from "@/features/mission-control/components/AgentFleetPanel";
import { TaskBoardPanel } from "@/features/mission-control/components/TaskBoardPanel";
import { CronDashboardPanel } from "@/features/mission-control/components/CronDashboardPanel";
import { RoutingTablePanel } from "@/features/mission-control/components/RoutingTablePanel";
import { InterventionAlerts } from "@/features/observe/components/InterventionAlerts";
import { ActivityFeed } from "@/features/observe/components/ActivityFeed";
import { LiveOutputPanel } from "@/features/observe/components/LiveOutputPanel";
import { chatHistoryToEntries } from "@/features/observe/lib/chatHistoryToEntries";
import { CatchUpDigestBanner } from "@/features/mission-control/components/CatchUpDigestBanner";
import { ActivityDetailDrawer } from "@/features/mission-control/components/ActivityDetailDrawer";
import { SyncBanner } from "@/features/mission-control/components/SyncBanner";
import {
  SpecialUpdatesPanel,
  type HeartbeatSignal,
} from "@/features/mission-control/components/SpecialUpdatesPanel";
import {
  selectPreviewSessionKeys,
  buildReconcileTerminalEntry,
  collectRunningRunIds,
} from "@/features/mission-control/state/sync";
import { loadMcPrefs, saveMcPrefs } from "@/lib/storage/mcPrefs";
import {
  extractText,
  isHeartbeatPrompt,
  stripUiMetadata,
} from "@/lib/text/message-extract";
import { InfoPopover } from "@/features/mission-control/components/InfoPopover";
import { infoContent } from "@/features/mission-control/components/info-content";
import type { Activity } from "@/lib/activity/tracker-accessor";

// Gateway API types
type SessionsListResult = {
  sessions: Array<{
    key: string;
    agentId?: string;
    displayName?: string;
    origin?: { label?: string };
    updatedAt?: number;
  }>;
};

type CronListResult = {
  jobs: CronJob[];
};

type ChatHistoryResult = {
  sessionKey: string;
  messages: Record<string, unknown>[];
};

type ChatHistoryMessage = Record<string, unknown>;

const findLatestHeartbeatResponse = (messages: ChatHistoryMessage[]): { text: string; ts: number | null } | null => {
  let awaitingHeartbeatReply = false;
  let latestResponse: { text: string; ts: number | null } | null = null;
  for (const message of messages) {
    const role = typeof message.role === "string" ? message.role : "";
    if (role === "user") {
      const text = stripUiMetadata(extractText(message) ?? "").trim();
      awaitingHeartbeatReply = isHeartbeatPrompt(text);
      continue;
    }
    if (role === "assistant" && awaitingHeartbeatReply) {
      const text = stripUiMetadata(extractText(message) ?? "").trim();
      if (text) {
        const rawTs = message.timestamp;
        const ts = typeof rawTs === "number" ? rawTs : typeof rawTs === "string" ? Date.parse(rawTs) || null : null;
        latestResponse = { text, ts };
      }
    }
  }
  return latestResponse;
};

const RECONCILE_INTERVAL_MS = 3_000;

// Convert persisted Activity objects from the REST API into ObserveEntry
// items so they render in the existing ActivityFeed with conversationMode.
// Uses stable IDs based on activity.id for proper deduplication.
const activityToEntries = (activities: Activity[]): import("@/features/observe/state/types").ObserveEntry[] => {
  return activities.map((a) => {
    const agentId = a.agentId ?? null;
    const sessionKey = a.sessionKey ?? null;
    const isConversation = a.type === "conversation-turn";
    const isCron = a.type === "cron-execution";
    const isError = a.status === "errored";

    return {
      id: `activity:${a.id}`,
      timestamp: new Date(a.startedAt).getTime(),
      eventType: isConversation ? ("chat" as const) : ("agent" as const),
      sessionKey,
      agentId,
      runId: a.runId ?? null,
      stream: isCron ? "lifecycle" : null,
      toolName: null,
      toolPhase: null,
      toolArgs: null,
      chatState: isConversation ? "final" : null,
      errorMessage: isError ? (a.summary ?? "Error") : null,
      text: a.summary ? a.summary.slice(0, 200) : null,
      description: a.summary ?? `${a.type} (${a.status})`,
      severity: isError ? ("error" as const) : ("info" as const),
      channel: a.channel ?? null,
      messageRole: isConversation ? ("assistant" as const) : null,
      fullText: a.summary ?? null,
      source: "persisted" as const,
      activityId: a.id,
    };
  });
};

const inferOrigin = (
  label?: string,
  key?: string
): SessionStatus["origin"] => {
  if (label) {
    const lower = label.toLowerCase();
    if (lower.includes("cron") || lower.includes("isolated")) return "cron";
    if (lower.includes("heartbeat")) return "heartbeat";
    if (lower.includes("interactive") || lower.includes("main"))
      return "interactive";
  }
  if (key) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("cron:") || lowerKey.includes("isolated"))
      return "cron";
    if (lowerKey.includes("heartbeat")) return "heartbeat";
  }
  return "unknown";
};

export default function MissionControlPage() {
  const [settingsCoordinator] = useState(() =>
    createStudioSettingsCoordinator()
  );
  const { client, status } = useGatewayConnection(settingsCoordinator);
  const [state, dispatch] = useReducer(observeReducer, initialObserveState);

  // Mission control context from filesystem API
  const [mcContext, setMcContext] = useState<MissionControlContext | null>(null);
  const [mcLoading, setMcLoading] = useState(true);

  // Cron jobs from gateway
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronLoading, setCronLoading] = useState(true);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Special updates
  const [heartbeats, setHeartbeats] = useState<HeartbeatSignal[]>([]);
  const [specialCollapsed, setSpecialCollapsed] = useState(() => loadMcPrefs().specialUpdatesCollapsed ?? false);

  // Reconcile refs
  const reconcileInFlightRef = useRef<Set<string>>(new Set());

  const pendingEntriesRef = useRef<ReturnType<typeof mapEventFrameToEntry>[]>(
    []
  );

  // Maps sessionKey → real agentId from gateway sessions.list (mirrors
  // Studio's findAgentBySessionKey approach so we display proper agent names
  // instead of the generic "main" parsed from agent:main:main).
  const sessionAgentMapRef = useRef<Map<string, string>>(new Map());
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const resolveAgentId = (entry: NonNullable<ReturnType<typeof mapEventFrameToEntry>>): typeof entry => {
    const sessionKey = entry.sessionKey?.trim();
    if (!sessionKey) return entry;
    const realAgentId = sessionAgentMapRef.current.get(sessionKey);
    if (realAgentId && realAgentId !== entry.agentId) {
      return { ...entry, agentId: realAgentId };
    }
    return entry;
  };

  // Load persisted activity history from Activity Tracker REST API
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/activity?limit=100");
        if (!res.ok) return;
        const data = await res.json();
        const items = data.activities as Activity[] | undefined;
        if (cancelled || !items || items.length === 0) return;
        const entries = activityToEntries(items);
        dispatch({ type: "pushEntries", entries });
      } catch {
        // Activity tracker may not be running yet
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // Load filesystem context (tasks, agents, activity, domainMap)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/mission-control/context");
        if (!res.ok) throw new Error("Failed to load context");
        const data = (await res.json()) as MissionControlContext;
        if (!cancelled) setMcContext(data);
      } catch (err) {
        console.warn("[mission-control] context load failed:", err);
      } finally {
        if (!cancelled) setMcLoading(false);
      }
    };
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // --- Sync from gateway (sessions + preview snapshot) ---
  const syncFromGateway = useCallback(async () => {
    if (status !== "connected") return;
    setSyncing(true);
    try {
      const sessionsResult = await client.call<SessionsListResult>(
        "sessions.list",
        { includeGlobal: true, includeUnknown: true, limit: 200 },
      );
      const sessions: SessionStatus[] = (sessionsResult.sessions ?? []).map(
        (s) => ({
          sessionKey: s.key,
          agentId: s.agentId ?? parseAgentIdFromSessionKey(s.key),
          displayName: s.displayName ?? s.agentId ?? null,
          origin: inferOrigin(s.origin?.label, s.key),
          status: "idle" as const,
          lastActivityAt: s.updatedAt ?? null,
          currentToolName: null,
          currentToolArgs: null,
          currentActivity: null,
          streamingText: null,
          lastError: null,
          eventCount: 0,
        }),
      );
      for (const s of sessions) {
        if (s.agentId) sessionAgentMapRef.current.set(s.sessionKey, s.agentId);
      }
      dispatch({ type: "hydrateSessions", sessions });

      const previewKeys = selectPreviewSessionKeys(sessions);
      if (previewKeys.length > 0) {
        try {
          await client.call<SummaryPreviewSnapshot>(
            "sessions.preview",
            { keys: previewKeys, limit: 8, maxChars: 240 },
          );
          setLastSyncAt(Date.now());
        } catch (err) {
          console.warn("[mission-control] preview snapshot failed:", err);
          setLastSyncAt(Date.now());
        }
      } else {
        setLastSyncAt(Date.now());
      }
    } catch (err) {
      console.warn("[mission-control] sync failed:", err);
    } finally {
      setSyncing(false);
    }
  }, [client, status]);

  // --- Reconcile running sessions via agent.wait ---
  const reconcileRunningSessions = useCallback(async () => {
    if (status !== "connected") return;
    const currentState = stateRef.current;
    const running = collectRunningRunIds(currentState.sessions, currentState.runSessionIndex);
    for (const { runId, sessionKey, agentId } of running) {
      if (reconcileInFlightRef.current.has(runId)) continue;
      reconcileInFlightRef.current.add(runId);
      try {
        const result = (await client.call("agent.wait", {
          runId,
          timeoutMs: 1,
        })) as { status?: unknown };
        const resolved = typeof result?.status === "string" ? result.status : "";
        if (resolved !== "ok" && resolved !== "error") continue;
        const entry = buildReconcileTerminalEntry(
          sessionKey,
          agentId,
          runId,
          resolved as "ok" | "error",
        );
        dispatch({ type: "pushEntries", entries: [entry] });
        console.info(`[mission-control] reconciled run ${runId} as ${resolved}`);
      } catch {
        // gateway may not support agent.wait or run is still going
      } finally {
        reconcileInFlightRef.current.delete(runId);
      }
    }
  }, [client, status]);

  // --- Load heartbeat signals for special updates panel ---
  const loadHeartbeatSignals = useCallback(async () => {
    if (status !== "connected") return;
    const currentSessions = stateRef.current.sessions;
    const heartbeatSessions = currentSessions.filter((s) => s.origin === "heartbeat");
    if (heartbeatSessions.length === 0) {
      setHeartbeats([]);
      return;
    }

    const signals: HeartbeatSignal[] = [];
    for (const session of heartbeatSessions.slice(0, 10)) {
      try {
        const history = await client.call<ChatHistoryResult>("chat.history", {
          sessionKey: session.sessionKey,
          limit: 20,
        });
        const result = findLatestHeartbeatResponse(history.messages ?? []);
        signals.push({
          agentId: session.agentId ?? "unknown",
          sessionKey: session.sessionKey,
          responseText: result?.text ?? null,
          respondedAt: result?.ts ?? null,
        });
      } catch {
        // session may not have history
      }
    }
    setHeartbeats(signals);
  }, [client, status]);

  // --- Gap recovery ---
  useEffect(() => {
    const unsubscribe = client.onGap((info) => {
      console.warn(`[mission-control] Gateway event gap: expected ${info.expected}, received ${info.received}`);
      void syncFromGateway();
      void reconcileRunningSessions();
    });
    return unsubscribe;
  }, [client, syncFromGateway, reconcileRunningSessions]);

  // --- Reconcile poll loop (every 3s) ---
  useEffect(() => {
    if (status !== "connected") return;
    const timer = window.setInterval(() => {
      void reconcileRunningSessions();
    }, RECONCILE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reconcileRunningSessions, status]);

  // --- Persist special updates panel collapsed state ---
  const handleToggleSpecialCollapsed = useCallback(() => {
    setSpecialCollapsed((prev) => {
      const next = !prev;
      saveMcPrefs({ specialUpdatesCollapsed: next });
      return next;
    });
  }, []);

  // Subscribe to ALL gateway events with RAF batching
  useEffect(() => {
    const batcher = createRafBatcher(() => {
      const pending = pendingEntriesRef.current;
      if (pending.length === 0) return;
      pendingEntriesRef.current = [];
      const valid = pending
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .map(resolveAgentId);
      if (valid.length > 0) {
        dispatch({ type: "pushEntries", entries: valid });
      }
    });

    const unsubscribe = client.onEvent((event: EventFrame) => {
      const entry = mapEventFrameToEntry(event);
      if (entry) {
        pendingEntriesRef.current.push(entry);
        batcher.schedule();
      }
    });
    return () => {
      unsubscribe();
      batcher.cancel();
    };
  }, [client]);

  // Load sessions and cron jobs on connect
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;

    const loadAll = async () => {
      // Load sessions
      let sessionKeys: string[] = [];
      try {
        const result = await client.call<SessionsListResult>(
          "sessions.list",
          { includeGlobal: true, includeUnknown: true, limit: 200 }
        );
        if (cancelled) return;
        const sessions: SessionStatus[] = (result.sessions ?? []).map(
          (s) => ({
            sessionKey: s.key,
            agentId: s.agentId ?? parseAgentIdFromSessionKey(s.key),
            displayName: s.displayName ?? s.agentId ?? null,
            origin: inferOrigin(s.origin?.label, s.key),
            status: "idle" as const,
            lastActivityAt: s.updatedAt ?? null,
            currentToolName: null,
            currentToolArgs: null,
            currentActivity: null,
            streamingText: null,
            lastError: null,
            eventCount: 0,
          })
        );
        // Populate session→agentId map for live event resolution
        for (const s of sessions) {
          if (s.agentId) sessionAgentMapRef.current.set(s.sessionKey, s.agentId);
        }
        dispatch({ type: "hydrateSessions", sessions });
        sessionKeys = sessions.map((s) => s.sessionKey);
      } catch (err) {
        console.warn("[mission-control] session load failed:", err);
      }

      // Load recent chat history for each session
      for (const key of sessionKeys) {
        if (cancelled) break;
        try {
          const history = await client.call<ChatHistoryResult>(
            "chat.history",
            { sessionKey: key, limit: 50 }
          );
          if (cancelled) break;
          const historyEntries = chatHistoryToEntries(
            history.messages ?? [],
            key
          );
          if (historyEntries.length > 0) {
            dispatch({ type: "pushEntries", entries: historyEntries });
          }
        } catch {
          // Some sessions may not have history — ignore
        }
      }

      // Load cron jobs
      try {
        const cronResult = await client.call<CronListResult>("cron.list", {
          includeDisabled: true,
        });
        if (!cancelled) {
          setCronJobs(cronResult.jobs ?? []);
        }
      } catch (err) {
        console.warn("[mission-control] cron load failed:", err);
      } finally {
        if (!cancelled) setCronLoading(false);
      }
    };

    void loadAll().then(() => {
      if (cancelled) return;
      void syncFromGateway();
      void loadHeartbeatSignals();
    });
    return () => {
      cancelled = true;
    };
  }, [client, status, syncFromGateway, loadHeartbeatSignals]);

  // Refresh cron jobs periodically (every 30s)
  useEffect(() => {
    if (status !== "connected") return;
    const interval = setInterval(async () => {
      try {
        const cronResult = await client.call<CronListResult>("cron.list", {
          includeDisabled: true,
        });
        setCronJobs(cronResult.jobs ?? []);
      } catch {
        // ignore
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [client, status]);

  // Refresh sessions on presence events (throttled)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (status !== "connected") return;
    const unsubscribe = client.onEvent((event: EventFrame) => {
      if (event.event !== "presence") return;
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(async () => {
        refreshTimerRef.current = null;
        try {
          const result = await client.call<SessionsListResult>(
            "sessions.list",
            { includeGlobal: true, includeUnknown: true, limit: 200 }
          );
          const sessions: SessionStatus[] = (result.sessions ?? []).map(
            (s) => ({
              sessionKey: s.key,
              agentId: s.agentId ?? parseAgentIdFromSessionKey(s.key),
              displayName: s.displayName ?? s.agentId ?? null,
              origin: inferOrigin(s.origin?.label, s.key),
              status: "idle" as const,
              lastActivityAt: s.updatedAt ?? null,
              currentToolName: null,
              currentToolArgs: null,
              currentActivity: null,
              streamingText: null,
              lastError: null,
              eventCount: 0,
            })
          );
          for (const s of sessions) {
            if (s.agentId) sessionAgentMapRef.current.set(s.sessionKey, s.agentId);
          }
          dispatch({ type: "hydrateSessions", sessions });
          void loadHeartbeatSignals();
        } catch {
          // ignore
        }
      }, 2000);
    });
    return () => {
      unsubscribe();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [client, status, loadHeartbeatSignals]);

  // Find active session for live output
  const activeSession = useMemo(() => {
    return state.sessions.find((s) => s.status === "running");
  }, [state.sessions]);

  const agents = mcContext?.agents ?? [];
  const tasks = mcContext?.tasks ?? [];
  const domainMap = mcContext?.domainMap ?? {};
  const hasActivity = state.entries.length > 0;

  // Drawer state for activity drill-down
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  return (
    <main className="mx-auto flex h-screen w-full max-w-[1900px] flex-col gap-2 p-2">
      <MissionControlHeader
        gatewayStatus={status}
        agents={agents}
        tasks={tasks}
        sessions={state.sessions}
        cronJobs={cronJobs}
      />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <CatchUpDigestBanner />
        </div>
        <SyncBanner syncing={syncing} lastSyncAt={lastSyncAt} />
      </div>

      <SpecialUpdatesPanel
        heartbeats={heartbeats}
        cronJobs={cronJobs}
        collapsed={specialCollapsed}
        onToggleCollapse={handleToggleSpecialCollapsed}
      />

      <InterventionAlerts entries={state.entries} />

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Left panel: Agent Fleet */}
        <div className="hidden w-[280px] shrink-0 flex-col gap-2 lg:flex">
          <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-xl">
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Agent Fleet
              </h2>
              <InfoPopover title={infoContent.agentFleet.title}>
                {infoContent.agentFleet.body}
              </InfoPopover>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentFleetPanel
                agents={agents}
                sessions={state.sessions}
                tasks={tasks}
                loading={mcLoading}
              />
            </div>
          </div>
        </div>

        {/* Center: Task Board + Live Output + Activity Feed */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Task Board - top half */}
          <div className="glass-panel flex max-h-[45%] min-h-[200px] flex-col overflow-hidden rounded-xl">
            <TaskBoardPanel tasks={tasks} loading={mcLoading} />
          </div>

          {/* Live output if active */}
          {activeSession && <LiveOutputPanel session={activeSession} />}

          {/* Activity Feed - bottom */}
          <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
            {hasActivity ? (
              <ActivityFeed
                entries={state.entries}
                sessionFilter={null}
                conversationMode
                onActivityClick={setSelectedActivityId}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-sm text-muted-foreground/50">
                <div className="mb-1 text-lg">Waiting for activity...</div>
                <div className="text-[11px]">
                  Events will appear here when agents are running
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Cron + Routing */}
        <div className="hidden w-[280px] shrink-0 flex-col gap-2 xl:flex">
          <div className="glass-panel flex max-h-[50%] flex-col overflow-hidden rounded-xl">
            <CronDashboardPanel jobs={cronJobs} loading={cronLoading} />
          </div>
          <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-xl">
            <RoutingTablePanel domainMap={domainMap} loading={mcLoading} />
          </div>
        </div>
      </div>

      {/* Activity detail drawer for drill-down */}
      <ActivityDetailDrawer
        activityId={selectedActivityId}
        onClose={() => setSelectedActivityId(null)}
      />
    </main>
  );
}
