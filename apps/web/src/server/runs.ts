import { randomUUID } from "node:crypto";
import path from "node:path";
import { discoverProjects, getExistingGithubRepoNames, createGitlabClient, createGithubClient } from "@glab2gh/core";
import { getGitlabConnection, getGithubConnection } from "./settings";
import { buildConfig } from "./buildConfig";
import { buildRepoPlans } from "./planning";
import { getEngine } from "./engine";
import { getDb, DATA_DIR } from "./db";
import type { MigrationOptions } from "@/lib/types";

export interface RunSummary {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
}

export function listRuns(limit = 50): RunSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.created_at, r.status,
              COUNT(t.repo_path) AS total,
              SUM(CASE WHEN t.overall_status = 'success' THEN 1 ELSE 0 END) AS succeeded,
              SUM(CASE WHEN t.overall_status IN ('failed','verify_failed') THEN 1 ELSE 0 END) AS failed
       FROM runs r
       LEFT JOIN repo_tasks t ON t.run_id = r.id
       GROUP BY r.id
       ORDER BY r.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as Array<{ id: string; created_at: string; status: string; total: number; succeeded: number; failed: number }>;
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, status: r.status, total: r.total, succeeded: r.succeeded, failed: r.failed }));
}

export class ConnectionsNotConfiguredError extends Error {
  constructor() {
    super("GitLab/GitHub connections are not configured — visit /setup first.");
  }
}

export class BlockingCollisionsError extends Error {
  constructor(public readonly blockingErrors: string[]) {
    super("Cannot start: unresolved name collisions.");
  }
}

/**
 * Shared by POST /api/runs (dryRun:false branch) and POST /api/runs/[id]/retry
 * so "create a run and hand it to the engine" has exactly one implementation.
 */
export async function createAndStartRun(options: MigrationOptions, selectedRepoPaths: string[]): Promise<{ runId: string }> {
  const gitlabConn = getGitlabConnection();
  const githubConn = getGithubConnection();
  if (!gitlabConn || !githubConn) {
    throw new ConnectionsNotConfiguredError();
  }

  const cfg = buildConfig(options, gitlabConn, githubConn, selectedRepoPaths, path.join(DATA_DIR, "work"));
  const gitlabApi = createGitlabClient(cfg, gitlabConn.token);
  const githubOctokit = createGithubClient(cfg, githubConn.token, { dryRun: true });

  const projects = await discoverProjects(gitlabApi, cfg);
  const existingNames = await getExistingGithubRepoNames(githubOctokit, cfg.target.owner);
  const { plans, blockingErrors } = buildRepoPlans(projects, options, existingNames);

  if (blockingErrors.length > 0) {
    throw new BlockingCollisionsError(blockingErrors);
  }

  const runId = randomUUID();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO runs (id, created_at, status, options_json, concurrency) VALUES (?, ?, 'running', ?, ?)").run(
    runId,
    now,
    JSON.stringify(options),
    options.concurrency,
  );
  const insertTask = db.prepare(
    `INSERT INTO repo_tasks (run_id, repo_path, target_owner, target_name, overall_status, steps_json, warnings_json, updated_at)
     VALUES (?, ?, ?, ?, 'pending', '{}', '[]', ?)`,
  );
  for (const plan of plans) {
    insertTask.run(runId, plan.sourcePath, plan.targetOwner, plan.targetName, now);
  }

  const engine = getEngine();
  engine.startRun(runId, cfg, gitlabConn.token, githubConn.token, plans).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[glab2gh] run ${runId} crashed:`, err);
  });

  return { runId };
}
