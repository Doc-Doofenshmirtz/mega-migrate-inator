import { EventEmitter } from "node:events";
import { redact } from "@glab2gh/core";
import type { RepoState } from "@glab2gh/core";
import { getDb } from "./db";

export interface LogLineEvent {
  kind: "log";
  id: number;
  runId: string;
  repoPath: string | null;
  ts: string;
  level: string;
  line: string;
}

export interface RepoTaskEvent {
  kind: "repo_task";
  runId: string;
  repoPath: string;
  overallStatus: RepoState["overallStatus"];
  steps: RepoState["steps"];
  warnings: string[];
  updatedAt: string;
}

export interface RunStatusEvent {
  kind: "run_status";
  runId: string;
  status: string;
}

export type RunEvent = LogLineEvent | RepoTaskEvent | RunStatusEvent;

const emitters = new Map<string, EventEmitter>();

function emitterFor(runId: string): EventEmitter {
  let e = emitters.get(runId);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(100);
    emitters.set(runId, e);
  }
  return e;
}

export function subscribe(runId: string, listener: (evt: RunEvent) => void): () => void {
  const e = emitterFor(runId);
  e.on("event", listener);
  return () => e.off("event", listener);
}

/** Redacts, persists to log_lines (whose autoincrement id doubles as the SSE Last-Event-ID), then broadcasts. */
export function publishLog(runId: string, repoPath: string | undefined, level: string, line: string): void {
  const redacted = redact(line);
  const ts = new Date().toISOString();
  const result = getDb()
    .prepare("INSERT INTO log_lines (run_id, repo_path, ts, level, line) VALUES (?, ?, ?, ?, ?)")
    .run(runId, repoPath ?? null, ts, level, redacted);
  const evt: LogLineEvent = {
    kind: "log",
    id: Number(result.lastInsertRowid),
    runId,
    repoPath: repoPath ?? null,
    ts,
    level,
    line: redacted,
  };
  emitterFor(runId).emit("event", evt);
}

export function publishRepoTask(runId: string, repoPath: string, state: RepoState): void {
  const evt: RepoTaskEvent = {
    kind: "repo_task",
    runId,
    repoPath,
    overallStatus: state.overallStatus,
    steps: state.steps,
    warnings: state.warnings,
    updatedAt: state.updatedAt,
  };
  emitterFor(runId).emit("event", evt);
}

export function publishRunStatus(runId: string, status: string): void {
  const evt: RunStatusEvent = { kind: "run_status", runId, status };
  emitterFor(runId).emit("event", evt);
}

/** Backfill for SSE reconnects: every log line with id > afterId, oldest first. */
export function getLogLinesSince(runId: string, afterId: number): LogLineEvent[] {
  const rows = getDb()
    .prepare("SELECT id, repo_path, ts, level, line FROM log_lines WHERE run_id = ? AND id > ? ORDER BY id ASC")
    .all(runId, afterId) as unknown as Array<{ id: number; repo_path: string | null; ts: string; level: string; line: string }>;
  return rows.map((r) => ({ kind: "log", id: r.id, runId, repoPath: r.repo_path, ts: r.ts, level: r.level, line: r.line }));
}

export function clearEmitter(runId: string): void {
  emitters.delete(runId);
}
