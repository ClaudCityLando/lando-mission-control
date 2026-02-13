import type { TaskItem } from "../state/types";
import { TaskCard } from "./TaskCard";

type TaskBoardPanelProps = {
  tasks: TaskItem[];
  loading: boolean;
};

const STATUS_GROUPS = [
  { key: "inbox", label: "Inbox" },
  { key: "assigned", label: "Assigned" },
  { key: "in-progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
] as const;

export const TaskBoardPanel = ({ tasks, loading }: TaskBoardPanelProps) => {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground/50">
        Loading tasks...
      </div>
    );
  }

  const grouped = STATUS_GROUPS.map((group) => ({
    ...group,
    tasks: tasks.filter(
      (t) =>
        t.status === group.key ||
        (group.key === "in-progress" && t.status === "blocked")
    ),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/50 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Task Board
        </h2>
      </div>

      <div className="flex flex-1 gap-2 overflow-x-auto p-2">
        {grouped.map((group) => (
          <div
            key={group.key}
            className="flex min-w-[180px] flex-1 flex-col rounded-lg bg-muted/10"
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/40">
                {group.tasks.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-2">
              {group.tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
