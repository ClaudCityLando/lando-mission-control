"use client";

import { useCallback } from "react";
import type { CronJob } from "@/features/observe/components/CronSchedulePanel";
import { InfoPopover } from "./InfoPopover";
import { infoContent } from "./info-content";

export type HeartbeatSignal = {
  agentId: string;
  sessionKey: string;
  responseText: string | null;
  respondedAt: number | null;
};

type SpecialUpdatesPanelProps = {
  heartbeats: HeartbeatSignal[];
  cronJobs: CronJob[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFilterSession?: (sessionKey: string) => void;
};

const formatRelativeTime = (ts: number | null): string => {
  if (!ts) return "unknown";
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
};

const truncate = (text: string, max: number = 80): string => {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
};

export const SpecialUpdatesPanel = ({
  heartbeats,
  cronJobs,
  collapsed,
  onToggleCollapse,
  onFilterSession,
}: SpecialUpdatesPanelProps) => {
  const recentCron = cronJobs
    .filter((j) => j.enabled && j.state.lastRunAtMs)
    .sort((a, b) => (b.state.lastRunAtMs ?? 0) - (a.state.lastRunAtMs ?? 0))
    .slice(0, 10);

  const hasContent = heartbeats.length > 0 || recentCron.length > 0;

  const handleSessionClick = useCallback(
    (sessionKey: string) => {
      onFilterSession?.(sessionKey);
    },
    [onFilterSession],
  );

  if (!hasContent) return null;

  return (
    <div className="glass-panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Signals
          </h2>
          <InfoPopover title={infoContent.signals.title}>
            {infoContent.signals.body}
          </InfoPopover>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded p-0.5 transition-colors hover:bg-muted/30"
          aria-label={collapsed ? "Expand signals" : "Collapse signals"}
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`h-3 w-3 text-muted-foreground/50 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          >
            <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-[200px] overflow-y-auto">
          {heartbeats.length > 0 && (
            <div className="px-3 py-2">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Latest Heartbeats
              </h3>
              <div className="space-y-1">
                {heartbeats.slice(0, 10).map((hb) => (
                  <button
                    key={hb.sessionKey}
                    onClick={() => handleSessionClick(hb.sessionKey)}
                    className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-muted/30"
                  >
                    <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400/60" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-foreground/80">
                          {hb.agentId ?? "unknown"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {formatRelativeTime(hb.respondedAt)}
                        </span>
                      </div>
                      {hb.responseText && (
                        <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground/70">
                          {truncate(hb.responseText)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {recentCron.length > 0 && (
            <div className="border-t border-border/30 px-3 py-2">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Latest Cron Runs
              </h3>
              <div className="space-y-1">
                {recentCron.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-2 rounded px-1.5 py-1"
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        job.state.lastStatus === "error"
                          ? "bg-red-400/60"
                          : "bg-emerald-400/60"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-foreground/80">
                          {job.agentId ?? "cron"}
                        </span>
                        <span className="truncate text-[10px] text-muted-foreground/50">
                          {job.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/50">
                          {formatRelativeTime(job.state.lastRunAtMs ?? null)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
