import type { TaskItem } from "../state/types";

type TaskCardProps = {
  task: TaskItem;
};

const priorityBadge = (priority: TaskItem["priority"]) => {
  if (priority === "high")
    return (
      <span className="rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-red-400">
        high
      </span>
    );
  if (priority === "medium")
    return (
      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-400">
        med
      </span>
    );
  return (
    <span className="rounded bg-muted/50 px-1 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
      low
    </span>
  );
};

export const TaskCard = ({ task }: TaskCardProps) => {
  const needsAttention =
    task.title.includes("ASK_PAUL") || task.status === "blocked";

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border px-2.5 py-2 text-[11px] ${
        needsAttention
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border/30 bg-card/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {task.id}
        </span>
        {priorityBadge(task.priority)}
      </div>

      <div className="font-semibold leading-snug text-foreground/90">
        {task.title}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
        {task.assigned_to && (
          <span className="rounded bg-muted/30 px-1 py-0.5">
            {task.assigned_to}
          </span>
        )}
        {task.domain && (
          <span className="rounded bg-primary/10 px-1 py-0.5 text-primary/70">
            {task.domain}
          </span>
        )}
        {needsAttention && (
          <span className="font-bold text-amber-400">ATTENTION</span>
        )}
      </div>
    </div>
  );
};
