export async function DELETE() {
  return Response.json(
    { error: "Route removed. Use /api/sync instead." },
    { status: 410 },
  );
}
