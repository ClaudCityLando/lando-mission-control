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
import { ObserveHeaderBar } from "@/features/observe/components/ObserveHeaderBar";
import { SessionOverview } from "@/features/observe/components/SessionOverview";
import { ActivityFeed } from "@/features/observe/components/ActivityFeed";
import { InterventionAlerts } from "@/features/observe/components/InterventionAlerts";
import { LiveOutputPanel } from "@/features/observe/components/LiveOutputPanel";
import {
  CronSchedulePanel,
  type CronJob,
} from "@/features/observe/components/CronSchedulePanel";
import {
  InitiativesPanel,
  type Initiative,
} from "@/features/observe/components/InitiativesPanel";
import { RecentMemoryPanel } from "@/features/observe/components/RecentMemoryPanel";
import { RecentActivityPanel } from "@/features/observe/components/RecentActivityPanel";

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

type PreviewResult = {
  ts: number;
  previews: Array<{
    key: string;
    status: string;
    items: Array<{ role: string; text: string; timestamp?: number | string }>;
  }>;
};

// Filesystem context API type
type ObserveContext = {
  recentMemory: string | null;
  initiatives: Initiative[];
  taskQueue: Array<{
    id: string;
    description: string;
    priority: number;
    status: string;
  }>;
  systemInfo: { model: string; agentCount: number };
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

export default function ObservePage() {
  const [settingsCoordinator] = useState(() =>
    createStudioSettingsCoordinator()
  );
  const { client, status } = useGatewayConnection(settingsCoordinator);
  const [state, dispatch] = useReducer(observeReducer, initialObserveState);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Context from filesystem API
  const [context, setContext] = useState<ObserveContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  // Cron jobs from gateway
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronLoading, setCronLoading] = useState(true);

  // Session previews
  const [previews, setPreviews] = useState<PreviewResult["previews"]>([]);
  const [previewsLoading, setPreviewsLoading] = useState(true);

  const pendingEntriesRef = useRef<ReturnType<typeof mapEventFrameToEntry>[]>(
    []
  );

  // Load filesystem context
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/observe/context");
        if (!res.ok) throw new Error("Failed to load context");
        const data = (await res.json()) as ObserveContext;
        if (!cancelled) setContext(data);
      } catch (err) {
        console.warn("[observe] context load failed:", err);
      } finally {
        if (!cancelled) setContextLoading(false);
      }
    };
    void load();
    // Refresh every 60s
    const interval = setInterval(() => void load(), 60_000);
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

  // Load sessions, cron jobs, and previews on connect
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;

    const loadAll = async () => {
      // Load sessions
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

        // Load previews for recent sessions
        const recentKeys = (result.sessions ?? [])
          .filter((s) => s.updatedAt)
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .slice(0, 5)
          .map((s) => s.key);

        if (recentKeys.length > 0) {
          try {
            const previewResult = await client.call<PreviewResult>(
              "sessions.preview",
              { keys: recentKeys, limit: 6, maxChars: 300 }
            );
            if (!cancelled) {
              setPreviews(previewResult.previews ?? []);
            }
          } catch {
            // preview optional
          }
        }
        if (!cancelled) setPreviewsLoading(false);
      } catch (err) {
        console.warn("[observe] session load failed:", err);
        if (!cancelled) setPreviewsLoading(false);
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
        console.warn("[observe] cron load failed:", err);
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

  const handleTogglePause = useCallback(() => {
    dispatch({ type: "togglePause" });
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: "clearLog" });
  }, []);

  const handleSelectSession = useCallback((sessionKey: string | null) => {
    setSelectedSession(sessionKey);
  }, []);

  const activeSession = useMemo(() => {
    if (selectedSession) {
      return state.sessions.find(
        (s) => s.sessionKey === selectedSession && s.status === "running"
      );
    }
    return state.sessions.find((s) => s.status === "running");
  }, [state.sessions, selectedSession]);

  const hasActivity = state.entries.length > 0;

  return (
    <main className="mx-auto flex h-screen w-full max-w-[1900px] flex-col gap-2 p-2">
      <ObserveHeaderBar
        status={status}
        paused={state.paused}
        sessions={state.sessions}
        interventionCount={state.interventionCount}
        onTogglePause={handleTogglePause}
        onClear={handleClear}
      />

      <InterventionAlerts entries={state.entries} />

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Left panel: Sessions + Cron Schedule */}
        <div className="hidden w-[280px] shrink-0 flex-col gap-2 lg:flex">
          <div className="glass-panel flex max-h-[50%] flex-col overflow-hidden rounded-xl">
            <SessionOverview
              sessions={state.sessions}
              selectedSession={selectedSession}
              onSelectSession={handleSelectSession}
            />
          </div>
          <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-xl">
            <div className="border-b border-border/50 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Cron Schedule
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CronSchedulePanel jobs={cronJobs} loading={cronLoading} />
            </div>
          </div>
        </div>

        {/* Center: Live output + Activity feed */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {activeSession && <LiveOutputPanel session={activeSession} />}

          <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
            {hasActivity ? (
              <ActivityFeed
                entries={state.entries}
                sessionFilter={selectedSession}
              />
            ) : (
              <div className="flex flex-1 flex-col">
                <div className="border-b border-border/50 px-3 py-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {previewsLoading
                      ? "Loading..."
                      : "Last Session Activity"}
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <RecentActivityPanel
                    previews={previews}
                    loading={previewsLoading}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Initiatives + Recent Memory */}
        <div className="hidden w-[280px] shrink-0 flex-col gap-2 xl:flex">
          <div className="glass-panel flex max-h-[40%] flex-col overflow-hidden rounded-xl">
            <div className="border-b border-border/50 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Strategic Focus
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <InitiativesPanel
                initiatives={context?.initiatives ?? []}
                loading={contextLoading}
              />
            </div>
          </div>
          <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-xl">
            <div className="border-b border-border/50 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Recent Memory
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RecentMemoryPanel
                memory={context?.recentMemory ?? null}
                loading={contextLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
