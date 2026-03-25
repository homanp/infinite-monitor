import { syncState, getFullState } from "@/db/widgets";
import { deriveShareId, getSessionStreamId, SHARE_BUCKET } from "@/lib/share";
import { getDurableStreamClient } from "@/lib/durable-stream";
import { loadDashboardPublishSource, buildDashboardSharedState, buildDashboardStateContentHash, materializePublishedWidgets } from "@/lib/share-projection";
import type { SyncPayload } from "@/lib/sync-db";

const lastKnownHashes = new Map<string, string>();

async function publishIfShared(dashboardId: string) {
  const shareId = deriveShareId(dashboardId);
  const streamId = getSessionStreamId(shareId);
  const ds = getDurableStreamClient();

  const head = await ds.head(SHARE_BUCKET, streamId);
  if (!head.exists) return;

  const source = loadDashboardPublishSource(dashboardId);
  const state = buildDashboardSharedState(source, shareId);
  const hash = buildDashboardStateContentHash(state);
  if (lastKnownHashes.get(shareId) === hash) return;
  lastKnownHashes.set(shareId, hash);

  await materializePublishedWidgets(state, { waitForBuild: false });

  const event = {
    version: "v1" as const,
    kind: "dashboard.state" as const,
    shareId,
    dashboardId,
    at: state.updatedAt,
    stateHash: hash,
    state,
  };
  await ds.appendJson(SHARE_BUCKET, streamId, event);
}

export async function GET() {
  const state = getFullState();
  return Response.json(state);
}

export async function POST(request: Request) {
  const body = (await request.json()) as SyncPayload;
  syncState({ dashboards: body.dashboards ?? [], widgets: body.widgets ?? [], textBlocks: body.textBlocks ?? [] });

  for (const dashboardId of body.dirtyDashboardIds ?? []) {
    publishIfShared(dashboardId).catch((err) =>
      console.error(`[sync] Failed to publish dashboard ${dashboardId}:`, err),
    );
  }

  return Response.json({ ok: true });
}
