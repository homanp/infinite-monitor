import { getDashboard } from "@/db/widgets";
import { publishDashboard } from "@/lib/publish-dashboard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dashboard = getDashboard(id);

  if (!dashboard) {
    return Response.json({ error: "Dashboard not found" }, { status: 404 });
  }

  try {
    const result = await publishDashboard(id);
    const origin = new URL(request.url).origin;

    return Response.json({
      dashboardId: id,
      shareId: result.shareId,
      shareUrl: `${origin}/share/${result.shareId}`,
      snapshotStreamId: result.snapshotStreamId,
      traceStreamId: result.traceStreamId,
      publishedAt: result.snapshot.publishedAt,
      shareStatus: "published",
      shareError: null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
