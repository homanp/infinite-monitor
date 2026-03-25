import { getDashboard } from "@/db/widgets";
import { deriveShareId, getSessionStreamId, SHARE_BUCKET } from "@/lib/share";
import { getDurableStreamClient } from "@/lib/durable-stream";
import { loadDashboardPublishSource, buildDashboardSharedState, materializePublishedWidgets } from "@/lib/share-projection";
import { headers } from "next/headers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dashboard = getDashboard(id);
  if (!dashboard) return Response.json({ error: "Dashboard not found" }, { status: 404 });

  const shareId = deriveShareId(id);
  const streamId = getSessionStreamId(shareId);
  const ds = getDurableStreamClient();

  await ds.ensureBucket(SHARE_BUCKET);
  await ds.createStream(SHARE_BUCKET, streamId);

  const source = loadDashboardPublishSource(id);
  const state = buildDashboardSharedState(source, shareId);
  await materializePublishedWidgets(state, { waitForBuild: true });

  const event = { version: "v1" as const, kind: "dashboard.state" as const, shareId, dashboardId: id, at: state.updatedAt, stateHash: "", state };
  await ds.appendJson(SHARE_BUCKET, streamId, event);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const shareUrl = `${protocol}://${host}/share/${shareId}`;

  return Response.json({ dashboardId: id, shareId, shareUrl, updatedAt: state.updatedAt });
}
