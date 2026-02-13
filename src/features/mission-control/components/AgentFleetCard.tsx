import type { AgentInfo, TaskItem } from "../state/types";
import type { SessionStatus } from "@/features/observe/state/types";
import {
  sessionBelongsToAgent,
  taskBelongsToAgent,
} from "../lib/agentIdentity";

type AgentFleetCardProps = {
  agent: AgentInfo;
  sessions: SessionStatus[];
  tasks: TaskItem[];
};

const levelBadge = (level: AgentInfo["level"]) => {
  if (level === "lead")
    return (
      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
        Lead
      </span>
    );
  if (level === "specialist")
    return (
      <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-400">
        Specialist
      </span>
    );
  return (
    <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
      Intern
    </span>
  );
};

const statusDot = (status: "idle" | "running" | "error") => {
  if (status === "running")
    return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />;
  if (status === "error")
    return <span className="inline-block h-2 w-2 rounded-full bg-red-400" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />;
};

export const AgentFleetCard = ({
  agent,
  sessions,
  tasks,
}: AgentFleetCardProps) => {
  // Find agent's sessions and determine live status
  const agentSessions = sessions.filter((s) =>
    sessionBelongsToAgent(s.agentId, agent)
  );
  const isRunning = agentSessions.some((s) => s.status === "running");
  const hasError = agentSessions.some((s) => s.status === "error");
  const liveStatus: "idle" | "running" | "error" = isRunning
    ? "running"
    : hasError
      ? "error"
      : "idle";

  const runningSession = [...agentSessions]
    .filter((s) => s.status === "running")
    .sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0))[0];

  // Agent's assigned tasks
  const agentTasks = tasks.filter((t) => taskBelongsToAgent(t.assigned_to, agent));
  const activeTasks = agentTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );

  const capacityLabel = agent.capacity.maxConcurrent
    ? `${activeTasks.length}/${agent.capacity.maxConcurrent}`
    : `${activeTasks.length} tasks`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/30 bg-card/30 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusDot(liveStatus)}
          <span className="text-sm font-bold text-foreground">
            {agent.name}
          </span>
        </div>
        {levelBadge(agent.level)}
      </div>

      <div className="text-[11px] text-muted-foreground">{agent.role}</div>

      {runningSession?.currentActivity && (
        <div className="rounded bg-primary/10 px-2 py-1 text-[10px] text-primary">
          {runningSession.currentActivity}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
        <span>{liveStatus}</span>
        <span>{capacityLabel}</span>
      </div>

      {/* Capacity bar */}
      {agent.capacity.maxConcurrent && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full rounded-full bg-primary/60 transition-all"
            style={{
              width: `${Math.min(100, (activeTasks.length / agent.capacity.maxConcurrent) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};
