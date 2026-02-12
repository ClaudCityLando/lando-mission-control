import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOME = process.env.HOME ?? "/Users/miloantaeus";
const GOALS_DIR = path.join(HOME, "personal-ai-assistant-goals");
const OPENCLAW_DIR = path.join(HOME, ".openclaw");

type Initiative = {
  title: string;
  priority: string;
  status: string;
  summary: string;
};

type TaskQueueItem = {
  id: string;
  description: string;
  priority: number;
  status: string;
};

type ObserveContext = {
  recentMemory: string | null;
  initiatives: Initiative[];
  taskQueue: TaskQueueItem[];
  cronJobs: Array<{
    id: string;
    name: string;
    schedule: string;
    lastStatus: string;
    lastRunAt: string | null;
    nextRunAt: string | null;
  }>;
  systemInfo: {
    model: string;
    agentCount: number;
  };
};

const readFileSafe = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
};

const parseRecentMemory = (): string | null => {
  const memoryDir = path.join(
    GOALS_DIR,
    "openclaw/workspace/skills/notes/data/memory/hourly"
  );
  try {
    const files = fs
      .readdirSync(memoryDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const content = fs.readFileSync(path.join(memoryDir, files[0]), "utf-8");
    // Get last 2 hourly blocks (most recent activity)
    const blocks = content.split(/^### /m).filter(Boolean);
    const recent = blocks.slice(-2).map((b) => `### ${b}`);
    return recent.join("\n").trim() || null;
  } catch {
    return null;
  }
};

const parseInitiatives = (): Initiative[] => {
  const content = readFileSafe(
    path.join(GOALS_DIR, "openclaw/workspace/INITIATIVES.md")
  );
  if (!content) return [];

  const initiatives: Initiative[] = [];
  const lines = content.split("\n");
  let current: Partial<Initiative> | null = null;
  let priority = 1;

  for (const line of lines) {
    // Match initiative headers like "### 1. Title (Priority)"
    const headerMatch = line.match(
      /^###\s+\d+\.\s+(.+?)(?:\s*\(([^)]+)\))?\s*$/
    );
    if (headerMatch) {
      if (current?.title) {
        initiatives.push(current as Initiative);
      }
      current = {
        title: headerMatch[1].trim(),
        priority: headerMatch[2]?.trim() ?? `P${priority}`,
        status: "active",
        summary: "",
      };
      priority++;
      continue;
    }
    // Collect first non-empty line as summary
    if (current && !current.summary && line.trim() && !line.startsWith("#")) {
      current.summary = line.trim().slice(0, 150);
    }
    // Detect status markers
    if (current && line.toLowerCase().includes("blocked")) {
      current.status = "blocked";
    }
    if (current && line.toLowerCase().includes("completed")) {
      current.status = "completed";
    }
  }
  if (current?.title) {
    initiatives.push(current as Initiative);
  }

  return initiatives.slice(0, 8);
};

const parseTaskQueue = (): TaskQueueItem[] => {
  const content = readFileSafe(
    path.join(OPENCLAW_DIR, "task_queue.json")
  );
  if (!content) return [];

  try {
    const data = JSON.parse(content) as {
      tasks?: Array<{
        id?: string;
        description?: string;
        priority?: number;
        status?: string;
      }>;
    };
    return (data.tasks ?? [])
      .filter((t) => t.status !== "completed")
      .map((t) => ({
        id: t.id ?? "",
        description: t.description ?? "",
        priority: t.priority ?? 3,
        status: t.status ?? "pending",
      }))
      .slice(0, 10);
  } catch {
    return [];
  }
};

const parseCronJobs = (): ObserveContext["cronJobs"] => {
  const content = readFileSafe(
    path.join(OPENCLAW_DIR, "cron/jobs.json")
  );
  if (!content) return [];

  try {
    const data = JSON.parse(content) as {
      jobs?: Array<{
        id?: string;
        name?: string;
        schedule?: { cron?: string; intervalSeconds?: number };
        state?: {
          lastStatus?: string;
          lastRunAtMs?: number;
          nextRunAtMs?: number;
        };
      }>;
    };
    return (data.jobs ?? []).map((j) => ({
      id: j.id ?? "",
      name: j.name ?? "",
      schedule: j.schedule?.cron ?? (j.schedule?.intervalSeconds ? `every ${j.schedule.intervalSeconds}s` : ""),
      lastStatus: j.state?.lastStatus ?? "unknown",
      lastRunAt: j.state?.lastRunAtMs
        ? new Date(j.state.lastRunAtMs).toISOString()
        : null,
      nextRunAt: j.state?.nextRunAtMs
        ? new Date(j.state.nextRunAtMs).toISOString()
        : null,
    }));
  } catch {
    return [];
  }
};

const countAgents = (): number => {
  const agentsDir = path.join(OPENCLAW_DIR, "agents");
  try {
    return fs
      .readdirSync(agentsDir)
      .filter((f) =>
        fs.statSync(path.join(agentsDir, f)).isDirectory()
      ).length;
  } catch {
    return 0;
  }
};

export async function GET() {
  try {
    const context: ObserveContext = {
      recentMemory: parseRecentMemory(),
      initiatives: parseInitiatives(),
      taskQueue: parseTaskQueue(),
      cronJobs: parseCronJobs(),
      systemInfo: {
        model: "qwen2.5:14b",
        agentCount: countAgents(),
      },
    };
    return NextResponse.json(context);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load observe context.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
