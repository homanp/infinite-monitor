import { lookupPublishedDashboardTrace } from "@/lib/share-trace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const result = await lookupPublishedDashboardTrace(shareId);

  if (result.status === "ready") {
    return Response.json(result.trace);
  }

  return Response.json(
    { error: result.message },
    { status: 503 },
  );
}
