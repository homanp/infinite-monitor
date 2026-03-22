import { lookupPublishedDashboardSnapshot } from "@/lib/publish-dashboard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;

  const result = await lookupPublishedDashboardSnapshot(shareId);
  if (result.status === "ready") {
    return Response.json(result.snapshot);
  }

  if (result.status === "unpublished") {
    return Response.json({ error: "Published snapshot not found" }, { status: 404 });
  }

  return Response.json(
    { error: result.message },
    { status: 503 },
  );
}
