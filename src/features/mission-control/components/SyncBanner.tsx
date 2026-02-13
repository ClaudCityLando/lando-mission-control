import { InfoPopover } from "./InfoPopover";
import { infoContent } from "./info-content";

type SyncBannerProps = {
  syncing: boolean;
  lastSyncAt: number | null;
};

const formatSyncTime = (ts: number): string => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export const SyncBanner = ({ syncing, lastSyncAt }: SyncBannerProps) => {
  if (!syncing && !lastSyncAt) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
      {syncing ? (
        <>
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <span>Syncing with gateway...</span>
        </>
      ) : (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/60" />
          <span>
            Last synced:{" "}
            {lastSyncAt ? formatSyncTime(lastSyncAt) : "never"}
          </span>
        </>
      )}
      <InfoPopover title={infoContent.syncStatus.title} side="left">
        {infoContent.syncStatus.body}
      </InfoPopover>
    </div>
  );
};
