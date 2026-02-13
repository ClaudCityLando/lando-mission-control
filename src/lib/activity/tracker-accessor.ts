// Bridge between the CJS activity tracker (server/activity-tracker.js) running
// in the Node server process and TypeScript Next.js API routes. The tracker
// instance is stashed on globalThis by server/index.js at boot.

export type ActivityMetrics = {
  messageCount: number;
  toolCallCount: number;
  tokenEstimate: number;
};

export type EventRef = {
  timestamp: number;
  type: string;
  stream: string;
  brief: string;
};

export type Activity = {
  id: string;
  agentId: string | null;
  sessionKey: string | null;
  channel: string | null;
  type: "conversation-turn" | "cron-execution" | "tool-sequence" | "error-incident";
  status: "active" | "completed" | "errored";
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  summary: string | null;
  eventRefs: EventRef[];
  metrics: ActivityMetrics;
};

export type ActivityDigest = {
  since: string;
  duration: string;
  agents: Record<
    string,
    {
      conversations: number;
      cronRuns: number;
      errors: number;
      channels: string[];
    }
  >;
  totalActivities: number;
  totalMessages: number;
  totalErrors: number;
  avgResponseTime: string;
};

export type ActivityQueryParams = {
  agent?: string;
  since?: string;
  type?: string;
  limit?: number;
};

type ActivityTracker = {
  queryActivities: (params?: ActivityQueryParams) => Activity[];
  getActivity: (id: string) => Activity | null;
  buildDigest: (since: string | number) => ActivityDigest;
  getListenerStats: () => { totalActivities: number; activeAccumulators: number };
};

export const getActivityTracker = (): ActivityTracker | null => {
  const tracker = (globalThis as Record<string, unknown>).__activityTracker;
  if (!tracker || typeof tracker !== "object") return null;
  return tracker as unknown as ActivityTracker;
};
