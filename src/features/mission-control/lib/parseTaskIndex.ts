import * as fs from "node:fs";
import * as path from "node:path";
import type { TaskItem, TaskActivity } from "../state/types";

const TASKS_DIR = path.join(
  process.env.HOME ?? "/Users/lando",
  ".openclaw/shared/tasks"
);

export const parseTaskIndex = (): TaskItem[] => {
  try {
    const raw = fs.readFileSync(path.join(TASKS_DIR, "index.json"), "utf-8");
    const data = JSON.parse(raw) as Array<Record<string, unknown>>;
    return data.map((t) => ({
      id: String(t.id ?? ""),
      title: String(t.title ?? ""),
      source: String(t.source ?? ""),
      priority: (t.priority as TaskItem["priority"]) ?? "medium",
      status: String(t.status ?? "inbox"),
      domain: String(t.domain ?? ""),
      assigned_to: t.assigned_to ? String(t.assigned_to) : null,
      created: String(t.created ?? ""),
      updated: String(t.updated ?? ""),
    }));
  } catch {
    return [];
  }
};

export const parseTaskActivity = (limit = 50): TaskActivity[] => {
  try {
    const raw = fs.readFileSync(
      path.join(TASKS_DIR, "activity.jsonl"),
      "utf-8"
    );
    const lines = raw.trim().split("\n").filter(Boolean);
    const entries = lines.map((line) => {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return {
        ts: String(parsed.ts ?? ""),
        type: String(parsed.type ?? ""),
        task_id: String(parsed.task_id ?? ""),
        actor: String(parsed.actor ?? ""),
        source: String(parsed.source ?? ""),
        data: (parsed.data as Record<string, unknown>) ?? {},
      };
    });
    return entries.slice(-limit);
  } catch {
    return [];
  }
};
