import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "widgets.db");

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(DB_PATH);

sqlite.pragma("journal_mode = WAL");

sqlite.exec(`CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Dashboard',
  widget_ids_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Widget',
  description TEXT NOT NULL DEFAULT '',
  code TEXT,
  files_json TEXT,
  layout_json TEXT,
  messages_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

{
  const cols = sqlite.prepare("PRAGMA table_info(widgets)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("files_json")) {
    sqlite.exec("ALTER TABLE widgets ADD COLUMN files_json TEXT");
  }
}

sqlite.exec(`CREATE TABLE IF NOT EXISTS text_blocks (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL DEFAULT '',
  font_size INTEGER NOT NULL DEFAULT 24,
  layout_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

{
  const dashCols = sqlite.prepare("PRAGMA table_info(dashboards)").all() as { name: string }[];
  const dashColNames = new Set(dashCols.map((c) => c.name));
  if (!dashColNames.has("text_block_ids_json")) {
    sqlite.exec("ALTER TABLE dashboards ADD COLUMN text_block_ids_json TEXT");
  }
  if (!dashColNames.has("viewport_json")) {
    sqlite.exec("ALTER TABLE dashboards ADD COLUMN viewport_json TEXT");
  }
}

export const db = drizzle(sqlite, { schema });

export { schema };
