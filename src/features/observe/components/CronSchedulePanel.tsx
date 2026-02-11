type CronJob = {
  id: string;
  name: string;
  agentId?: string;
  enabled: boolean;
  state: {
    nextRunAtMs?: number;
    runningAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: "ok" | "error" | "skipped";
    lastError?: string;
    lastDurationMs?: number;
  };
};

type CronSchedulePanelProps = {
  jobs: CronJob[];
  loading: boolean;
};

const formatRelative = (ms: number | undefined): string => {
  if (!ms) return "-";
  const diff = ms - Date.now();
  if (diff < 0) {
    const ago = Date.now() - ms;
    if (ago < 60_000) return `${Math.floor(ago / 1000)}s ago`;
    if (ago < 3_600_000) return `${Math.floor(ago / 60_000)}m ago`;
    return `${Math.floor(ago / 3_600_000)}h ago`;
  }
  if (diff < 60_000) return `in ${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`;
  return `in ${Math.floor(diff / 3_600_000)}h`;
};

const statusColor = (status?: string): string => {
  if (status === "ok") return "text-emerald-400";
  if (status === "error") return "text-red-400";
  if (status === "skipped") return "text-amber-400";
  return "text-muted-foreground/50";
};

export const CronSchedulePanel = ({ jobs, loading }: CronSchedulePanelProps) => {
  if (loading) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
        Loading schedule...
      </div>
    );
  }

  const enabled = jobs.filter((j) => j.enabled);
  const sorted = [...enabled].sort(
    (a, b) => (a.state.nextRunAtMs ?? Infinity) - (b.state.nextRunAtMs ?? Infinity)
  );

  return (
    <div className="flex flex-col gap-1 p-2">
      {sorted.map((job) => (
        <div
          key={job.id}
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] hover:bg-muted/20"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-foreground/90">{job.name}</span>
            <div className="flex items-center gap-1.5">
              <span className={statusColor(job.state.lastStatus)}>
                {job.state.runningAtMs ? "Running" : (job.state.lastStatus ?? "pending")}
              </span>
              {job.state.lastRunAtMs && !job.state.runningAtMs && (
                <span className="text-muted-foreground/40">
                  {formatRelative(job.state.lastRunAtMs)}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            {job.state.runningAtMs ? (
              <span className="animate-pulse text-primary">active</span>
            ) : job.state.nextRunAtMs ? (
              <span className="text-muted-foreground/50">
                {formatRelative(job.state.nextRunAtMs)}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};

export type { CronJob };
