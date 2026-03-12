import { getAllWidgets, upsertWidget, deleteWidget } from "@/db/widgets";

/** GET /api/widgets — list all widgets from the database */
export async function GET() {
  const rows = getAllWidgets();
  return Response.json({ widgets: rows });
}

/** POST /api/widgets — sync a widget from client to database */
export async function POST(request: Request) {
  const body = await request.json();
  const { id, title, description, code, layout, messages } = body as {
    id: string;
    title?: string;
    description?: string;
    code?: string | null;
    layout?: unknown;
    messages?: unknown;
  };

  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  upsertWidget({
    id,
    title,
    description,
    code,
    layoutJson: layout ? JSON.stringify(layout) : undefined,
    messagesJson: messages ? JSON.stringify(messages) : undefined,
  });

  return Response.json({ ok: true });
}

/** DELETE /api/widgets — delete a widget */
export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id: string };
  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  deleteWidget(id);
  return Response.json({ ok: true });
}
