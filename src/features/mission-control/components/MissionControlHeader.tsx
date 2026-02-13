import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import type { SessionStatus } from "@/features/observe/state/types";
import type { TaskItem, AgentInfo } from "../state/types";
import type { CronJob } from "@/features/observe/components/CronSchedulePanel";

type MissionControlHeaderProps = {
  gatewayStatus: GatewayStatus;
  agents: AgentInfo[];
  tasks: TaskItem[];
  sessions: SessionStatus[];
  cronJobs: CronJob[];
};

const statusBadge = (status: GatewayStatus) => {
  if (status === "connected")
    return (
      <span className="flex items-center gap-1.5 text-emerald-400">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
        Live
      </span>
    );
  if (status === "connecting")
    return (
      <span className="flex items-center gap-1.5 text-amber-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Connecting
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-red-400">
      <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
      Offline
    </span>
  );
};

export const MissionControlHeader = ({
  gatewayStatus,
  agents,
  tasks,
  sessions,
  cronJobs,
}: MissionControlHeaderProps) => {
  const runningSessions = sessions.filter((s) => s.status === "running").length;
  const activeTasks = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  ).length;
  const enabledCron = cronJobs.filter((j) => j.enabled).length;

  return (
    <header className="glass-panel flex items-center justify-between rounded-xl px-4 py-2.5">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-xl font-bold uppercase tracking-wider text-foreground">
          Mission Control
        </h1>
        <div className="text-xs font-semibold">
          {statusBadge(gatewayStatus)}
        </div>
      </div>

      <div className="flex items-center gap-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>
          <span className="text-foreground">{agents.length}</span> agents
        </span>
        <span>
          <span className="text-foreground">{runningSessions}</span> active
        </span>
        <span>
          <span className="text-foreground">{activeTasks}</span> tasks open
        </span>
        <span>
          <span className="text-foreground">{enabledCron}</span> cron jobs
        </span>
      </div>
    </header>
  );
};
