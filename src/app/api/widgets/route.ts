function removedResponse() {
  return Response.json(
    { error: "Route removed. Use /api/sync or /api/widgets/bootstrap instead." },
    { status: 410 },
  );
}

export async function GET() {
  return removedResponse();
}

export async function POST() {
  return removedResponse();
}

export async function DELETE() {
  return removedResponse();
}
