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
    const since = url.searchParams.get("since");
    if (!since) {
      return NextResponse.json(
        { error: "Missing required parameter: since" },
        { status: 400 },
      );
    }

    const digest = tracker.buildDigest(since);
    return NextResponse.json(digest);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to build activity digest.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
