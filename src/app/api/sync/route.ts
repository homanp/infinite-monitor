import { syncState, getFullState } from "@/db/widgets";
import { scheduleSharedDashboardAppend } from "@/lib/session-stream";
import type { SyncPayload } from "@/lib/sync-db";

export async function GET() {
  const state = getFullState();
  return Response.json(state);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { dashboards, widgets, textBlocks } = body as SyncPayload;

  syncState({ dashboards: dashboards ?? [], widgets: widgets ?? [], textBlocks: textBlocks ?? [] });

  for (const dashboard of dashboards ?? []) {
    scheduleSharedDashboardAppend(dashboard.id, 0);
  }

  return Response.json({ ok: true });
}
