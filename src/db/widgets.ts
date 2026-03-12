import { eq, sql } from "drizzle-orm";
import { db, schema } from ".";

const { widgets } = schema;

export type WidgetRecord = typeof widgets.$inferSelect;

/** Get a widget by ID */
export function getWidget(id: string): WidgetRecord | undefined {
  return db.select().from(widgets).where(eq(widgets.id, id)).get();
}

/** Get all widgets */
export function getAllWidgets(): WidgetRecord[] {
  return db.select().from(widgets).all();
}

/** Create or update a widget (upsert) */
export function upsertWidget(data: {
  id: string;
  title?: string;
  description?: string;
  code?: string | null;
  layoutJson?: string | null;
  messagesJson?: string | null;
}) {
  const existing = getWidget(data.id);
  if (existing) {
    db.update(widgets)
      .set({
        ...data,
        updatedAt: sql`(unixepoch())`,
      })
      .where(eq(widgets.id, data.id))
      .run();
  } else {
    db.insert(widgets)
      .values({
        id: data.id,
        title: data.title ?? "Untitled Widget",
        description: data.description ?? "",
        code: data.code ?? null,
        layoutJson: data.layoutJson ?? null,
        messagesJson: data.messagesJson ?? null,
      })
      .run();
  }
}

/** Update just the code for a widget */
export function updateWidgetCode(id: string, code: string) {
  db.update(widgets)
    .set({ code, updatedAt: sql`(unixepoch())` })
    .where(eq(widgets.id, id))
    .run();
}

/** Update widget title */
export function updateWidgetTitle(id: string, title: string) {
  db.update(widgets)
    .set({ title, updatedAt: sql`(unixepoch())` })
    .where(eq(widgets.id, id))
    .run();
}

/** Update layout and messages (for periodic sync from client) */
export function syncWidgetState(
  id: string,
  layoutJson: string,
  messagesJson: string
) {
  db.update(widgets)
    .set({ layoutJson, messagesJson, updatedAt: sql`(unixepoch())` })
    .where(eq(widgets.id, id))
    .run();
}

/** Delete a widget */
export function deleteWidget(id: string) {
  db.delete(widgets).where(eq(widgets.id, id)).run();
}

/** Get widget code (convenience) */
export function getWidgetCode(id: string): string | null {
  const row = db
    .select({ code: widgets.code })
    .from(widgets)
    .where(eq(widgets.id, id))
    .get();
  return row?.code ?? null;
}
