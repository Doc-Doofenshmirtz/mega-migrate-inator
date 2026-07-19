import { getDb } from "./db";
import type { RepoMigrationStatus } from "@/lib/types";

const DONE_STATUSES = new Set(["success", "empty"]);
const ATTENTION_STATUSES = new Set(["failed", "verify_failed", "cancelled", "interrupted"]);

interface LatestTaskRow {
  repo_path: string;
  target_owner: string;
  target_name: string;
  overall_status: string;
  updated_at: string;
  run_id: string;
}

/**
 * One row per repo_path, latest-run-first, so within a repo's group the
 * first "done" row (if any) is its most recent success. Success is a
 * one-way door: once a repo has ever finished a run as done, it stays
 * "migrated" even if someone re-selects it later and that later run fails
 * (e.g. because the target already exists) — a botched re-run shouldn't
 * erase a real prior migration. Repos that have never succeeded fall back
 * to their latest run's outcome, same as before.
 */
export function getLatestRepoStatuses(): Record<string, RepoMigrationStatus> {
  const rows = getDb()
    .prepare(
      `SELECT t.repo_path, t.target_owner, t.target_name, t.overall_status, t.updated_at, t.run_id
       FROM repo_tasks t
       JOIN runs r ON r.id = t.run_id
       ORDER BY t.repo_path, r.created_at DESC`,
    )
    .all() as unknown as LatestTaskRow[];

  const statuses: Record<string, RepoMigrationStatus> = {};
  let i = 0;
  while (i < rows.length) {
    const repoPath = rows[i]!.repo_path;
    let latestRow: LatestTaskRow | null = null;
    let doneRow: LatestTaskRow | null = null;
    while (i < rows.length && rows[i]!.repo_path === repoPath) {
      const row = rows[i]!;
      if (!latestRow) latestRow = row;
      if (!doneRow && DONE_STATUSES.has(row.overall_status)) doneRow = row;
      i++;
    }

    const row = doneRow ?? latestRow!;
    const bucket = DONE_STATUSES.has(row.overall_status)
      ? "done"
      : ATTENTION_STATUSES.has(row.overall_status)
        ? "attention"
        : null;
    if (!bucket) continue; // pending/in_progress, and never done — nothing settled to report yet
    statuses[repoPath] = {
      bucket,
      targetOwner: row.target_owner,
      targetName: row.target_name,
      runId: row.run_id,
      updatedAt: row.updated_at,
    };
  }
  return statuses;
}
