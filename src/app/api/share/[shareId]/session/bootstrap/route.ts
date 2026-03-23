import { bootstrapSharedSession } from "@/lib/session-stream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const result = await bootstrapSharedSession(shareId);

  if (result.status === "ready") {
    return Response.json({
      snapshot: result.snapshot,
      nextOffset: result.nextOffset,
    });
  }

  if (result.status === "unavailable") {
    return Response.json({ error: "Shared session not found" }, { status: 404 });
  }

  return Response.json(
    { error: result.message },
    { status: 503 },
  );
}
