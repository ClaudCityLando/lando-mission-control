import { NextResponse } from "next/server";
import {
  parseTaskIndex,
  parseTaskActivity,
} from "@/features/mission-control/lib/parseTaskIndex";
import { parseRegistry } from "@/features/mission-control/lib/parseRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = parseTaskIndex();
    const activity = parseTaskActivity(50);
    const { agents, domainMap } = parseRegistry();

    return NextResponse.json({ agents, tasks, activity, domainMap });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to load mission control context.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
