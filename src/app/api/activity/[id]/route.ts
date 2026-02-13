import { NextResponse } from "next/server";
import { getActivityTracker } from "@/lib/activity/tracker-accessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tracker = getActivityTracker();
    if (!tracker) {
      return NextResponse.json(
        { error: "Activity tracker not available." },
        { status: 503 },
      );
    }

    const { id } = await params;
    const activity = tracker.getActivity(id);
    if (!activity) {
      return NextResponse.json(
        { error: "Activity not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ activity });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get activity.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
