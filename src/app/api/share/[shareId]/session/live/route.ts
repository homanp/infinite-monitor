import { getOptionalRiverrunClient } from "@/lib/riverrun";
import { getSessionStreamId, SHARE_BUCKET } from "@/lib/share";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const riverrun = getOptionalRiverrunClient();

  const url = new URL(request.url);
  const offset = url.searchParams.get("offset") ?? "now";

  try {
    const upstream = await riverrun.tailSse(
      SHARE_BUCKET,
      getSessionStreamId(shareId),
      offset,
      request.signal,
    );

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
