import { bootstrapPublishedDashboardTrace } from "@/lib/share-trace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const result = await bootstrapPublishedDashboardTrace(shareId);

  if (result.status === "ready") {
    return Response.json({
      trace: result.trace,
      nextOffset: result.nextOffset,
    });
  }

  return Response.json(
    { error: result.message },
    { status: 503 },
  );
}
