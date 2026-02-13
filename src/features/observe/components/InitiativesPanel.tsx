type Initiative = {
  title: string;
  priority: string;
  status: string;
  summary: string;
};

type InitiativesPanelProps = {
  initiatives: Initiative[];
  loading: boolean;
};

const statusBadge = (status: string): { label: string; className: string } => {
  if (status === "blocked")
    return {
      label: "Blocked",
      className: "bg-red-500/15 text-red-400",
    };
  if (status === "completed")
    return {
      label: "Done",
      className: "bg-emerald-500/15 text-emerald-400",
    };
  return {
    label: "Active",
    className: "bg-primary/15 text-primary",
  };
};

export const InitiativesPanel = ({
  initiatives,
  loading,
}: InitiativesPanelProps) => {
  if (loading) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
        Loading initiatives...
      </div>
    );
  }

  if (initiatives.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
        No initiatives found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {initiatives.map((initiative, i) => {
        const badge = statusBadge(initiative.status);
        return (
          <div
            key={i}
            className="rounded-md px-2 py-1.5 text-[11px] hover:bg-muted/20"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-semibold text-foreground/90">
                {initiative.title}
              </span>
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            {initiative.summary && (
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
                {initiative.summary}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export type { Initiative };
