type RecentMemoryPanelProps = {
  memory: string | null;
  loading: boolean;
};

export const RecentMemoryPanel = ({
  memory,
  loading,
}: RecentMemoryPanelProps) => {
  if (loading) {
    return (
      <div className="p-4 text-center text-[11px] text-muted-foreground/50">
        Loading memory...
      </div>
    );
  }

  if (!memory) {
    return (
      <div className="p-4 text-center text-[11px] text-muted-foreground/50">
        No recent memory entries
      </div>
    );
  }

  // Parse memory into structured blocks
  const blocks = memory.split(/^### /m).filter(Boolean);

  return (
    <div className="flex flex-col gap-3 p-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter(Boolean);
        const timestamp = lines[0]?.trim() ?? "";
        const content = lines.slice(1);

        const topics: string[] = [];
        const actions: string[] = [];
        const tools: string[] = [];
        let stats = "";

        let section = "";
        for (const line of content) {
          if (line.startsWith("Topics Discussed:")) {
            section = "topics";
            continue;
          }
          if (line.startsWith("Actions:")) {
            section = "actions";
            continue;
          }
          if (line.startsWith("Tools Used:")) {
            section = "tools";
            const toolsPart = line.replace("Tools Used:", "").trim();
            if (toolsPart) tools.push(toolsPart);
            continue;
          }
          if (line.startsWith("Stats:")) {
            stats = line.replace("Stats:", "").trim();
            section = "";
            continue;
          }
          if (
            line.startsWith("Decisions Made:") ||
            line.startsWith("User Messages:") ||
            line.startsWith("Errors:")
          ) {
            section = "";
            continue;
          }

          const trimmed = line.replace(/^\s+→\s*/, "").trim();
          if (!trimmed) continue;

          if (section === "topics") topics.push(trimmed);
          if (section === "actions") actions.push(trimmed.replace(/^\[action\]\s*/, ""));
          if (section === "tools") tools.push(trimmed);
        }

        return (
          <div key={i} className="rounded-lg border border-border/30 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground/80">
                {timestamp}
              </span>
              {stats && (
                <span className="text-[9px] text-muted-foreground/40">
                  {stats}
                </span>
              )}
            </div>

            {topics.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {topics.map((topic, j) => (
                  <span
                    key={j}
                    className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary/80"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}

            {actions.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {actions.slice(0, 3).map((action, j) => (
                  <div
                    key={j}
                    className="truncate text-[10px] text-muted-foreground/70"
                  >
                    {action}
                  </div>
                ))}
                {actions.length > 3 && (
                  <span className="text-[9px] text-muted-foreground/40">
                    +{actions.length - 3} more
                  </span>
                )}
              </div>
            )}

            {tools.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tools.map((tool, j) => (
                  <span
                    key={j}
                    className="rounded bg-muted/40 px-1 py-0.5 text-[8px] text-muted-foreground/60"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
