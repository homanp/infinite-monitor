import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const dashboards = sqliteTable("dashboards", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Dashboard"),
  widgetIdsJson: text("widget_ids_json"),
  textBlockIdsJson: text("text_block_ids_json"),
  viewportJson: text("viewport_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const widgets = sqliteTable("widgets", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Untitled Widget"),
  description: text("description").notNull().default(""),
  code: text("code"),
  filesJson: text("files_json"),
  layoutJson: text("layout_json"),
  messagesJson: text("messages_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const textBlocks = sqliteTable("text_blocks", {
  id: text("id").primaryKey(),
  text: text("text").notNull().default(""),
  fontSize: integer("font_size").notNull().default(24),
  layoutJson: text("layout_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type DashboardRow = typeof dashboards.$inferSelect;
export type WidgetRow = typeof widgets.$inferSelect;
export type NewWidget = typeof widgets.$inferInsert;
export type TextBlockRow = typeof textBlocks.$inferSelect;
