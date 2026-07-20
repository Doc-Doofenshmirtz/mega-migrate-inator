import { randomUUID } from "node:crypto";
import type { Octokit } from "octokit";
import { logger } from "@glab2gh/core";
import { getDb } from "./db";
import type { GitlabApi } from "./clients";
import { getAccessEngine, type AccessProvider, type AccessAction } from "./accessEngine";
import { insertPendingTasks, type AccessTaskInput } from "./accessTaskStore";

export interface AccessJobSummary {
  id: string;
  provider: AccessProvider;
  action: AccessAction;
  role: string | null;
  expiresAt: string | null;
  createdAt: string;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
}

interface AccessJobSummaryRow {
  id: string;
  provider: AccessProvider;
  action: AccessAction;
  role: string | null;
  expires_at: string | null;
  created_at: string;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
}

const SUMMARY_SELECT = `
  SELECT j.id, j.provider, j.action, j.role, j.expires_at, j.created_at, j.status,
         COUNT(t.repo_ref) AS total,
         SUM(CASE WHEN t.status IN ('success','invited') THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed
  FROM access_jobs j
  LEFT JOIN access_tasks t ON t.job_id = j.id
`;

function toSummary(r: AccessJobSummaryRow): AccessJobSummary {
  return {
    id: r.id,
    provider: r.provider,
    action: r.action,
    role: r.role,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    status: r.status,
    total: r.total,
    succeeded: r.succeeded,
    failed: r.failed,
  };
}

export function listAccessJobs(provider?: AccessProvider, limit = 50): AccessJobSummary[] {
  const db = getDb();
  const rows = provider
    ? (db
        .prepare(`${SUMMARY_SELECT} WHERE j.provider = ? GROUP BY j.id ORDER BY j.created_at DESC LIMIT ?`)
        .all(provider, limit) as unknown as AccessJobSummaryRow[])
    : (db.prepare(`${SUMMARY_SELECT} GROUP BY j.id ORDER BY j.created_at DESC LIMIT ?`).all(limit) as unknown as AccessJobSummaryRow[]);
  return rows.map(toSummary);
}

export interface CreateAccessJobInput {
  provider: AccessProvider;
  action: AccessAction;
  /** GitHub permission string or GitLab access-level string; null for remove jobs. */
  role: string | null;
  tasks: AccessTaskInput[];
  concurrency?: number;
  client: Octokit | GitlabApi;
  /** GitLab-only: optional membership expiry, ignored for GitHub jobs. */
  expiresAt?: string | null;
}

/** Shared by the GitHub/GitLab "create bulk job" routes and by job retry — inserts rows and hands off to the engine. */
export function createAndStartAccessJob(input: CreateAccessJobInput): { jobId: string } {
  const jobId = randomUUID();
  const db = getDb();
  const now = new Date().toISOString();
  const concurrency = input.concurrency ?? 5;

  db.prepare(
    "INSERT INTO access_jobs (id, provider, action, role, expires_at, created_at, status, concurrency) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
  ).run(jobId, input.provider, input.action, input.role, input.expiresAt ?? null, now, concurrency);
  insertPendingTasks(jobId, input.tasks);

  const engine = getAccessEngine();
  engine.startJob(jobId, input.provider, input.action, input.role, concurrency, input.client, input.expiresAt).catch((err) => {
    logger.error(
      { context: "accessJobs.engine.startJob", jobId, stack: err instanceof Error ? err.stack : undefined },
      `access job ${jobId} crashed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  return { jobId };
}
