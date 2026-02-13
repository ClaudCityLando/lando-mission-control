"use client";

import {
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
import { MissionControlHeader } from "@/features/mission-control/components/MissionControlHeader";
import { AgentFleetPanel } from "@/features/mission-control/components/AgentFleetPanel";
import { TaskBoardPanel } from "@/features/mission-control/components/TaskBoardPanel";
import { CronDashboardPanel } from "@/features/mission-control/components/CronDashboardPanel";
import { RoutingTablePanel } from "@/features/mission-control/components/RoutingTablePanel";
import { InterventionAlerts } from "@/features/observe/components/InterventionAlerts";
import { ActivityFeed } from "@/features/observe/components/ActivityFeed";
import { LiveOutputPanel } from "@/features/observe/components/LiveOutputPanel";
import { chatHistoryToEntries } from "@/features/observe/lib/chatHistoryToEntries";

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

  const pendingEntriesRef = useRef<ReturnType<typeof mapEventFrameToEntry>[]>(
    []
  );

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

  // Subscribe to ALL gateway events with RAF batching
  useEffect(() => {
    const batcher = createRafBatcher(() => {
      const pending = pendingEntriesRef.current;
      if (pending.length === 0) return;
      pendingEntriesRef.current = [];
      const valid = pending.filter(
        (e): e is NonNullable<typeof e> => e !== null
      );
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

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [client, status]);

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
          dispatch({ type: "hydrateSessions", sessions });
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
  }, [client, status]);

  // Find active session for live output
  const activeSession = useMemo(() => {
    return state.sessions.find((s) => s.status === "running");
  }, [state.sessions]);

  const agents = mcContext?.agents ?? [];
  const tasks = mcContext?.tasks ?? [];
  const domainMap = mcContext?.domainMap ?? {};
  const hasActivity = state.entries.length > 0;

  return (
    <main className="mx-auto flex h-screen w-full max-w-[1900px] flex-col gap-2 p-2">
      <MissionControlHeader
        gatewayStatus={status}
        agents={agents}
        tasks={tasks}
        sessions={state.sessions}
        cronJobs={cronJobs}
      />

      <InterventionAlerts entries={state.entries} />

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Left panel: Agent Fleet */}
        <div className="hidden w-[280px] shrink-0 flex-col gap-2 lg:flex">
          <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-xl">
            <div className="border-b border-border/50 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Agent Fleet
              </h2>
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
              <ActivityFeed entries={state.entries} sessionFilter={null} conversationMode />
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
    </main>
  );
}
