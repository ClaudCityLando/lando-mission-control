export type AgentLevel = "lead" | "specialist" | "intern";

export type AgentCapacity = {
  maxConcurrent: number | null;
  note: string;
};

export type AgentInfo = {
  id: string;
  runtimeId: string;
  idAliases: string[];
  name: string;
  role: string;
  level: AgentLevel;
  domains: string[];
  capacity: AgentCapacity;
  notes: string;
};

export type TaskItem = {
  id: string;
  title: string;
  source: string;
  priority: "high" | "medium" | "low";
  status: string;
  domain: string;
  assigned_to: string | null;
  created: string;
  updated: string;
};

export type TaskActivity = {
  ts: string;
  type: string;
  task_id: string;
  actor: string;
  source: string;
  data: Record<string, unknown>;
};

export type DomainMap = Record<string, string[]>;

export type MissionControlContext = {
  agents: AgentInfo[];
  tasks: TaskItem[];
  activity: TaskActivity[];
  domainMap: DomainMap;
};
