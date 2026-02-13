import type { AgentInfo, TaskItem } from "../state/types";
import type { SessionStatus } from "@/features/observe/state/types";
import { AgentFleetCard } from "./AgentFleetCard";

type AgentFleetPanelProps = {
  agents: AgentInfo[];
  sessions: SessionStatus[];
  tasks: TaskItem[];
  loading: boolean;
};

export const AgentFleetPanel = ({
  agents,
  sessions,
  tasks,
  loading,
}: AgentFleetPanelProps) => {
  if (loading) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
        Loading fleet...
      </div>
    );
  }

  // Sort: lead first, then specialists, then interns
  const levelOrder: Record<string, number> = {
    lead: 0,
    specialist: 1,
    intern: 2,
  };
  const sorted = [...agents].sort(
    (a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9)
  );

  return (
    <div className="flex flex-col gap-2 p-2">
      {sorted.map((agent) => (
        <AgentFleetCard
          key={agent.id}
          agent={agent}
          sessions={sessions}
          tasks={tasks}
        />
      ))}
    </div>
  );
};
