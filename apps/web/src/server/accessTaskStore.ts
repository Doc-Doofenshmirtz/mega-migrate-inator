import { getDb } from "./db";
import { publishAccessTask } from "./accessEvents";

export interface AccessTaskInput {
  repoRef: string;
  repoLabel: string;
  memberRef: string;
  memberLabel: string;
}

export interface AccessTaskRow {
  jobId: string;
  repoRef: string;
  repoLabel: string;
  memberRef: string;
  memberLabel: string;
  status: string;
  error: string | null;
  resultJson: string | null;
  updatedAt: string;
}

interface RawRow {
  job_id: string;
  repo_ref: string;
  repo_label: string;
  member_ref: string;
  member_label: string;
  status: string;
  error: string | null;
  result_json: string | null;
  updated_at: string;
}

function fromRow(r: RawRow): AccessTaskRow {
  return {
    jobId: r.job_id,
    repoRef: r.repo_ref,
    repoLabel: r.repo_label,
    memberRef: r.member_ref,
    memberLabel: r.member_label,
    status: r.status,
    error: r.error,
    resultJson: r.result_json,
    updatedAt: r.updated_at,
  };
}

export function insertPendingTasks(jobId: string, tasks: AccessTaskInput[]): void {
  const now = new Date().toISOString();
  const insert = getDb().prepare(
    `INSERT INTO access_tasks (job_id, repo_ref, repo_label, member_ref, member_label, status, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  );
  for (const t of tasks) {
    insert.run(jobId, t.repoRef, t.repoLabel, t.memberRef, t.memberLabel, now);
  }
}

export function listTasks(jobId: string): AccessTaskRow[] {
  const rows = getDb()
    .prepare(
      "SELECT job_id, repo_ref, repo_label, member_ref, member_label, status, error, result_json, updated_at FROM access_tasks WHERE job_id = ? ORDER BY repo_label, member_label",
    )
    .all(jobId) as unknown as RawRow[];
  return rows.map(fromRow);
}

export function listPendingTasks(jobId: string): AccessTaskRow[] {
  const rows = getDb()
    .prepare(
      "SELECT job_id, repo_ref, repo_label, member_ref, member_label, status, error, result_json, updated_at FROM access_tasks WHERE job_id = ? AND status = 'pending'",
    )
    .all(jobId) as unknown as RawRow[];
  return rows.map(fromRow);
}

function save(row: AccessTaskRow): void {
  getDb()
    .prepare(
      `UPDATE access_tasks SET status = ?, error = ?, result_json = ?, updated_at = ?
       WHERE job_id = ? AND repo_ref = ? AND member_ref = ?`,
    )
    .run(row.status, row.error, row.resultJson, row.updatedAt, row.jobId, row.repoRef, row.memberRef);
  publishAccessTask(row);
}

export function markRunning(jobId: string, repoRef: string, memberRef: string, repoLabel: string, memberLabel: string): void {
  save({
    jobId,
    repoRef,
    repoLabel,
    memberRef,
    memberLabel,
    status: "running",
    error: null,
    resultJson: null,
    updatedAt: new Date().toISOString(),
  });
}

export function markResult(
  jobId: string,
  repoRef: string,
  memberRef: string,
  repoLabel: string,
  memberLabel: string,
  status: string,
  error: string | null,
  resultJson: string | null,
): void {
  save({
    jobId,
    repoRef,
    repoLabel,
    memberRef,
    memberLabel,
    status,
    error,
    resultJson,
    updatedAt: new Date().toISOString(),
  });
}
