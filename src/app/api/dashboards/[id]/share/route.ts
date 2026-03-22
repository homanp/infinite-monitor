import { getDashboard } from "@/db/widgets";
import { lookupPublishedDashboardSnapshot } from "@/lib/publish-dashboard";
import {
  deriveShareId,
  getSnapshotStreamId,
  getTraceStreamId,
} from "@/lib/share";

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
    const shareId = deriveShareId(id);
    const origin = new URL(request.url).origin;
    const publishedSnapshot = await lookupPublishedDashboardSnapshot(shareId);

    return Response.json({
      dashboardId: id,
      shareId,
      shareUrl: `${origin}/share/${shareId}`,
      snapshotStreamId: getSnapshotStreamId(shareId),
      traceStreamId: getTraceStreamId(shareId),
      publishedAt:
        publishedSnapshot.status === "ready"
          ? publishedSnapshot.snapshot.publishedAt
          : null,
      shareStatus:
        publishedSnapshot.status === "ready"
          ? "published"
          : publishedSnapshot.status,
      shareError:
        publishedSnapshot.status === "backend_unavailable"
          ? publishedSnapshot.message
          : null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
