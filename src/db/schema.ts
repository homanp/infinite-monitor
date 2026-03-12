import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const widgets = sqliteTable("widgets", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Untitled Widget"),
  description: text("description").notNull().default(""),
  code: text("code"),
  layoutJson: text("layout_json"),
  messagesJson: text("messages_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type WidgetRow = typeof widgets.$inferSelect;
export type NewWidget = typeof widgets.$inferInsert;
