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
 * One row per repo_path: whichever run most recently touched it, so a repo
 * migrated three runs ago still shows up even though later runs didn't
 * include it. Ties within the same run can't happen (repo_path is part of
 * that table's primary key), so ordering by run creation time is enough.
 */
export function getLatestRepoStatuses(): Record<string, RepoMigrationStatus> {
  const rows = getDb()
    .prepare(
      `SELECT repo_path, target_owner, target_name, overall_status, updated_at, run_id FROM (
         SELECT t.repo_path, t.target_owner, t.target_name, t.overall_status, t.updated_at, t.run_id,
                ROW_NUMBER() OVER (PARTITION BY t.repo_path ORDER BY r.created_at DESC) AS rn
         FROM repo_tasks t
         JOIN runs r ON r.id = t.run_id
       ) WHERE rn = 1`,
    )
    .all() as unknown as LatestTaskRow[];

  const statuses: Record<string, RepoMigrationStatus> = {};
  for (const row of rows) {
    const bucket = DONE_STATUSES.has(row.overall_status)
      ? "done"
      : ATTENTION_STATUSES.has(row.overall_status)
        ? "attention"
        : null;
    if (!bucket) continue; // pending/in_progress — a run is (or was, mid-crash) still working on it, nothing settled to report yet
    statuses[row.repo_path] = {
      bucket,
      targetOwner: row.target_owner,
      targetName: row.target_name,
      runId: row.run_id,
      updatedAt: row.updated_at,
    };
  }
  return statuses;
}
