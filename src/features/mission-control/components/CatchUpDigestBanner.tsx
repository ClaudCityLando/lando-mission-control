"use client";

import { useEffect, useState, useCallback } from "react";
import type { ActivityDigest } from "@/lib/activity/tracker-accessor";

const LAST_SEEN_KEY = "mission-control-last-seen";

const readLastSeen = (): string | null => {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
};

const writeLastSeen = (iso: string) => {
  try {
    localStorage.setItem(LAST_SEEN_KEY, iso);
  } catch {}
};

export function CatchUpDigestBanner() {
  const [digest, setDigest] = useState<ActivityDigest | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const lastSeen = readLastSeen();
      // Default to 24h ago if never visited
      const since =
        lastSeen || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      try {
        const res = await fetch(
          `/api/activity/digest?since=${encodeURIComponent(since)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as ActivityDigest;
        if (!cancelled && data.totalActivities > 0) {
          setDigest(data);
        }
      } catch {
        // Tracker may not be running — ignore
      }
    };

    void load();

    // Update last-seen timestamp on mount
    writeLastSeen(new Date().toISOString());

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    writeLastSeen(new Date().toISOString());
  }, []);

  if (!digest || dismissed) return null;

  const agentEntries = Object.entries(digest.agents);

  return (
    <div className="glass-panel relative rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-2.5 text-muted-foreground/50 transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      <div className="pr-6">
        <h3 className="text-xs font-semibold tracking-wide text-primary">
          While you were away
          <span className="ml-2 font-normal text-muted-foreground">
            ({digest.duration})
          </span>
        </h3>

        {agentEntries.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {agentEntries.map(([agent, stats]) => {
              const parts: string[] = [];
              if (stats.conversations > 0) {
                parts.push(
                  `${stats.conversations} conversation${stats.conversations !== 1 ? "s" : ""}`,
                );
              }
              if (stats.cronRuns > 0) {
                parts.push(
                  `${stats.cronRuns} cron run${stats.cronRuns !== 1 ? "s" : ""}`,
                );
              }
              if (stats.errors > 0) {
                parts.push(
                  `${stats.errors} error${stats.errors !== 1 ? "s" : ""}`,
                );
              }
              const channels =
                stats.channels.length > 0
                  ? ` (${stats.channels.join(", ")})`
                  : "";
              return (
                <span
                  key={agent}
                  className="text-[11px] text-muted-foreground"
                >
                  <span className="font-medium text-foreground/80">
                    {agent}
                  </span>
                  : {parts.join(", ")}
                  {channels}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground/60">
          <span>
            {digest.totalMessages} message
            {digest.totalMessages !== 1 ? "s" : ""}
          </span>
          {digest.totalErrors > 0 && (
            <span className="text-red-400">
              {digest.totalErrors} error{digest.totalErrors !== 1 ? "s" : ""}
            </span>
          )}
          {digest.avgResponseTime !== "N/A" && (
            <span>avg response {digest.avgResponseTime}</span>
          )}
        </div>
      </div>
    </div>
  );
}
