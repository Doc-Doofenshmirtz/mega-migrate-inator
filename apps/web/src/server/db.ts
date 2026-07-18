import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "glab2gh.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_encrypted TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  options_json TEXT NOT NULL,
  concurrency INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS repo_tasks (
  run_id TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  target_owner TEXT NOT NULL,
  target_name TEXT NOT NULL,
  overall_status TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  result_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, repo_path)
);

CREATE TABLE IF NOT EXISTS log_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  repo_path TEXT,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  line TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_lines_run ON log_lines(run_id, id);
CREATE INDEX IF NOT EXISTS idx_repo_tasks_run ON repo_tasks(run_id);
`;

function openDb(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

declare global {
  // eslint-disable-next-line no-var
  var __glab2ghDb: DatabaseSync | undefined;
}

/** Module-level singleton guarded on globalThis so Next's dev-mode module reloads don't reopen the file repeatedly. */
export function getDb(): DatabaseSync {
  if (!globalThis.__glab2ghDb) {
    globalThis.__glab2ghDb = openDb();
  }
  return globalThis.__glab2ghDb;
}

export { DB_PATH, DATA_DIR };
