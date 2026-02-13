import type { DomainMap } from "../state/types";

type RoutingTablePanelProps = {
  domainMap: DomainMap;
  loading: boolean;
};

export const RoutingTablePanel = ({
  domainMap,
  loading,
}: RoutingTablePanelProps) => {
  if (loading) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
        Loading routing...
      </div>
    );
  }

  const entries = Object.entries(domainMap).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/50 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Routing Table
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/20 text-left">
              <th className="px-3 py-1.5 font-semibold text-muted-foreground/60">
                Domain
              </th>
              <th className="px-3 py-1.5 font-semibold text-muted-foreground/60">
                Agents
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([domain, agents]) => (
              <tr
                key={domain}
                className="border-b border-border/10 hover:bg-muted/10"
              >
                <td className="px-3 py-1.5 font-mono text-foreground/80">
                  {domain}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {agents.map((agent) => (
                      <span
                        key={agent}
                        className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary/80"
                      >
                        {agent}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
