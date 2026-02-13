import { NextResponse } from "next/server";
import { getActivityTracker } from "@/lib/activity/tracker-accessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const tracker = getActivityTracker();
    if (!tracker) {
      return NextResponse.json(
        { error: "Activity tracker not available." },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const agent = url.searchParams.get("agent") || undefined;
    const since = url.searchParams.get("since") || undefined;
    const type = url.searchParams.get("type") || undefined;
    const limitRaw = url.searchParams.get("limit");
    const parsedLimit = limitRaw ? Number(limitRaw) : 50;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 50;

    const activities = tracker.queryActivities({ agent, since, type, limit });
    return NextResponse.json({ activities });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to query activities.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
