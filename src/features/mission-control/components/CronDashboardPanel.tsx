import {
  CronSchedulePanel,
  type CronJob,
} from "@/features/observe/components/CronSchedulePanel";
import { InfoPopover } from "./InfoPopover";
import { infoContent } from "./info-content";

type CronDashboardPanelProps = {
  jobs: CronJob[];
  loading: boolean;
};

export const CronDashboardPanel = ({
  jobs,
  loading,
}: CronDashboardPanelProps) => {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Cron Schedule
        </h2>
        <InfoPopover title={infoContent.cronSchedule.title}>
          {infoContent.cronSchedule.body}
        </InfoPopover>
      </div>
      <div className="flex-1 overflow-y-auto">
        <CronSchedulePanel jobs={jobs} loading={loading} />
      </div>
    </div>
  );
};
