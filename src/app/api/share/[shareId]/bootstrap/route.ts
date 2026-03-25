import { getDurableStreamClient, getDurableStreamBaseUrl } from "@/lib/durable-stream";
import { getSessionStreamId, SHARE_BUCKET } from "@/lib/share";
import { materializePublishedWidgets } from "@/lib/share-projection";
import {
  buildEmptySharedSessionSnapshot,
  SharedSessionEventV1Schema,
  SharedSessionSnapshotV1Schema,
  applySharedSessionEvent,
  type SharedSessionSnapshotV1,
} from "@/lib/share-types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const streamId = getSessionStreamId(shareId);
  const ds = getDurableStreamClient();

  const bootstrap = await ds.bootstrap(SHARE_BUCKET, streamId);
  if (!bootstrap) {
    return Response.json({ error: "Share not found" }, { status: 404 });
  }

  const [snapshotPart, ...updateParts] = bootstrap.parts;
  let snapshot: SharedSessionSnapshotV1 = buildEmptySharedSessionSnapshot(shareId);

  if (snapshotPart?.body.trim()) {
    const parsed = SharedSessionSnapshotV1Schema.safeParse(JSON.parse(snapshotPart.body));
    if (parsed.success) snapshot = { ...parsed.data, chats: parsed.data.chats ?? [] };
  }

  for (const part of updateParts) {
    if (!part.body.trim()) continue;
    const parsed = SharedSessionEventV1Schema.safeParse(JSON.parse(part.body));
    if (parsed.success) snapshot = applySharedSessionEvent(snapshot, parsed.data);
  }

  if (!snapshot.dashboard) {
    return Response.json({ error: "No dashboard state" }, { status: 404 });
  }

  console.log("[bootstrap] widgets:", snapshot.dashboard.widgets.map((w) => ({ id: w.publishedWidgetId, layout: w.layout, title: w.title })));

  // Materialize published widgets into local SQLite + trigger builds
  // so this server can serve widget iframes even if it's not the author's server
  await materializePublishedWidgets(snapshot.dashboard, { waitForBuild: false });

  const liveUrl = `${getDurableStreamBaseUrl()}/ds/${SHARE_BUCKET}/${streamId}`;

  return Response.json({
    snapshot,
    nextOffset: bootstrap.nextOffset ?? "now",
    liveUrl,
  });
}
