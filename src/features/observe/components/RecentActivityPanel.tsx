type PreviewItem = {
  role: string;
  text: string;
  timestamp?: number | string;
};

type RecentActivityPanelProps = {
  previews: Array<{
    key: string;
    status: string;
    items: PreviewItem[];
  }>;
  loading: boolean;
};

const roleIcon = (role: string): string => {
  if (role === "user") return "\u25B6";
  if (role === "assistant") return "\u270E";
  if (role === "tool") return "\u2699";
  return "\u2022";
};

const roleColor = (role: string): string => {
  if (role === "user") return "text-amber-400/80";
  if (role === "assistant") return "text-foreground/80";
  if (role === "tool") return "text-blue-400/80";
  return "text-muted-foreground/60";
};

export const RecentActivityPanel = ({
  previews,
  loading,
}: RecentActivityPanelProps) => {
  if (loading) {
    return (
      <div className="p-4 text-center text-[11px] text-muted-foreground/50">
        Loading recent activity...
      </div>
    );
  }

  const nonEmpty = previews.filter(
    (p) => p.status === "ok" && p.items.length > 0
  );

  if (nonEmpty.length === 0) {
    return (
      <div className="p-4 text-center text-[11px] text-muted-foreground/50">
        No recent activity
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {nonEmpty.map((preview) => (
        <div key={preview.key}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            {preview.key.length > 30
              ? preview.key.slice(0, 30) + "..."
              : preview.key}
          </div>
          <div className="flex flex-col gap-1">
            {preview.items.map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-[11px] leading-relaxed ${roleColor(item.role)}`}
              >
                <span className="shrink-0 pt-0.5">{roleIcon(item.role)}</span>
                <span className="line-clamp-2">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
