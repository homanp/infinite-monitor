import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "widgets.db");

let _db: ReturnType<typeof drizzle> | null = null;

function initDb(): ReturnType<typeof drizzle> {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");

  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const tableNames = new Set(tables.map((t) => t.name));

  if (!tableNames.has("dashboards")) {
    sqlite.exec(`CREATE TABLE dashboards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Dashboard',
      widget_ids_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`);
  }

  if (!tableNames.has("widgets")) {
    sqlite.exec(`CREATE TABLE widgets (
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
  } else {
    const cols = sqlite.prepare("PRAGMA table_info(widgets)").all() as { name: string }[];
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("files_json")) {
      sqlite.exec("ALTER TABLE widgets ADD COLUMN files_json TEXT");
    }
  }

  if (!tableNames.has("text_blocks")) {
    sqlite.exec(`CREATE TABLE text_blocks (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL DEFAULT '',
      font_size INTEGER NOT NULL DEFAULT 24,
      layout_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`);
  }

  {
    const dashCols = sqlite.prepare("PRAGMA table_info(dashboards)").all() as { name: string }[];
    const dashColNames = new Set(dashCols.map((c) => c.name));
    if (!dashColNames.has("text_block_ids_json")) {
      sqlite.exec("ALTER TABLE dashboards ADD COLUMN text_block_ids_json TEXT");
    }
  }

  _db = drizzle(sqlite, { schema });
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    return Reflect.get(initDb(), prop, receiver);
  },
});

export { schema };
