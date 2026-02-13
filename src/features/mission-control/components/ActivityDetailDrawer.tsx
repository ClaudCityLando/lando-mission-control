"use client";

import { useEffect, useCallback, useReducer, useRef } from "react";
import type { Activity, EventRef } from "@/lib/activity/tracker-accessor";

type FetchState = {
  activity: Activity | null;
  loading: boolean;
  error: string | null;
};

type FetchAction =
  | { type: "start" }
  | { type: "success"; activity: Activity }
  | { type: "error"; message: string }
  | { type: "reset" };

const fetchReducer = (state: FetchState, action: FetchAction): FetchState => {
  switch (action.type) {
    case "start":
      return { ...state, loading: true, error: null };
    case "success":
      return { activity: action.activity, loading: false, error: null };
    case "error":
      return { ...state, loading: false, error: action.message };
    case "reset":
      return { activity: null, loading: false, error: null };
  }
};

type ActivityDetailDrawerProps = {
  activityId: string | null;
  onClose: () => void;
};

const formatDuration = (ms: number | null): string => {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
};

const typeLabel = (type: Activity["type"]): string => {
  switch (type) {
    case "conversation-turn":
      return "Conversation";
    case "cron-execution":
      return "Cron Run";
    case "tool-sequence":
      return "Tool Sequence";
    case "error-incident":
      return "Error";
    default:
      return type;
  }
};

const statusBadge = (status: Activity["status"]) => {
  const colors: Record<string, string> = {
    completed: "bg-emerald-500/20 text-emerald-400",
    active: "bg-blue-500/20 text-blue-400",
    errored: "bg-red-500/20 text-red-400",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
        colors[status] ?? "bg-muted/50 text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
};

const EventRefList = ({ refs }: { refs: EventRef[] }) => {
  if (refs.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground/50">
        No detailed events recorded
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {refs.map((ref, i) => (
        <div
          key={`${ref.timestamp}-${i}`}
          className="flex items-start gap-2 text-[10px]"
        >
          <span className="shrink-0 font-mono text-muted-foreground/50">
            {formatTime(ref.timestamp)}
          </span>
          <span className="shrink-0 rounded bg-muted/30 px-1 text-muted-foreground">
            {ref.stream}
          </span>
          <span className="text-foreground/80">{ref.brief}</span>
        </div>
      ))}
    </div>
  );
};

export const ActivityDetailDrawer = ({
  activityId,
  onClose,
}: ActivityDetailDrawerProps) => {
  const [state, dispatch] = useReducer(fetchReducer, {
    activity: null,
    loading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchActivity = useCallback(async (id: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: "start" });

    try {
      const res = await fetch(`/api/activity/${encodeURIComponent(id)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(res.status === 404 ? "Activity not found" : "Failed to load");
      }
      const data = await res.json();
      dispatch({ type: "success", activity: data.activity });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      dispatch({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
    }
  }, []);

  useEffect(() => {
    if (activityId) {
      void fetchActivity(activityId);
    } else {
      dispatch({ type: "reset" });
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [activityId, fetchActivity]);

  const { activity, loading, error } = state;

  if (!activityId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border/50 bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Activity Detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-8 text-sm text-red-400">
              {error}
            </div>
          )}
          {activity && !loading && (
            <div className="flex flex-col gap-4">
              {/* Summary */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {typeLabel(activity.type)}
                  </span>
                  {statusBadge(activity.status)}
                </div>
                <p className="text-sm text-foreground">{activity.summary}</p>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border/30 bg-muted/10 p-3 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Agent</span>
                  <p className="font-medium text-foreground">
                    {activity.agentId ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Channel</span>
                  <p className="font-medium text-foreground">
                    {activity.channel ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration</span>
                  <p className="font-medium text-foreground">
                    {formatDuration(activity.duration)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Started</span>
                  <p className="font-medium text-foreground">
                    {new Date(activity.startedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Metrics */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center rounded-lg border border-border/30 bg-muted/10 px-4 py-2">
                  <span className="text-lg font-bold text-foreground">
                    {activity.metrics.messageCount}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    messages
                  </span>
                </div>
                <div className="flex flex-col items-center rounded-lg border border-border/30 bg-muted/10 px-4 py-2">
                  <span className="text-lg font-bold text-foreground">
                    {activity.metrics.toolCallCount}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    tool calls
                  </span>
                </div>
                <div className="flex flex-col items-center rounded-lg border border-border/30 bg-muted/10 px-4 py-2">
                  <span className="text-lg font-bold text-foreground">
                    ~{activity.metrics.tokenEstimate}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    tokens
                  </span>
                </div>
              </div>

              {/* Run ID (for correlation) */}
              {activity.runId && (
                <div className="text-[10px]">
                  <span className="text-muted-foreground">Run ID: </span>
                  <span className="font-mono text-foreground/70">
                    {activity.runId}
                  </span>
                </div>
              )}

              {/* Event timeline */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Event Timeline ({activity.eventRefs.length})
                </h3>
                <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border/30 bg-muted/5 p-2">
                  <EventRefList refs={activity.eventRefs} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
