import path from "node:path";
import { migrateRepo, runWithEmitter, globalRedactor, CancelledError, createGitlabClient, createGithubClient } from "@glab2gh/core";
import type { RunContext, RepoPlan, Config } from "@glab2gh/core";
import { getDb } from "./db";
import { SqliteStateStore } from "./sqliteStateStore";
import { publishLog, publishRepoTask, publishRunStatus, clearEmitter } from "./events";

interface ActiveRun {
  cancelled: boolean;
}

class JobEngine {
  private active = new Map<string, ActiveRun>();

  constructor() {
    this.recoverInterruptedRuns();
  }

  /** On boot, anything left "running"/"cancelling" from a previous process died mid-flight. */
  private recoverInterruptedRuns(): void {
    const db = getDb();
    db.prepare("UPDATE runs SET status = 'interrupted' WHERE status IN ('running', 'cancelling')").run();
    db.prepare("UPDATE repo_tasks SET overall_status = 'interrupted' WHERE overall_status = 'in_progress'").run();
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  cancelRun(runId: string): boolean {
    const active = this.active.get(runId);
    if (!active) return false;
    active.cancelled = true;
    getDb().prepare("UPDATE runs SET status = 'cancelling' WHERE id = ?").run(runId);
    publishRunStatus(runId, "cancelling");
    return true;
  }

  /** Fire-and-forget: the HTTP handler that calls this returns immediately, the pool runs in the background. */
  async startRun(runId: string, cfg: Config, gitlabToken: string, githubToken: string, plans: RepoPlan[]): Promise<void> {
    globalRedactor.add(gitlabToken);
    globalRedactor.add(githubToken);

    const active: ActiveRun = { cancelled: false };
    this.active.set(runId, active);
    publishRunStatus(runId, "running");

    const gitlabApi = createGitlabClient(cfg, gitlabToken);
    const githubOctokit = createGithubClient(cfg, githubToken, { dryRun: false });
    const workdir = path.join(cfg.run.workdir, runId);
    const runCfg: Config = { ...cfg, run: { ...cfg.run, workdir } };

    const concurrency = Math.max(1, Math.min(cfg.run.concurrency, plans.length || 1));
    let index = 0;
    const worker = async () => {
      for (;;) {
        const i = index++;
        if (i >= plans.length) return;
        await this.runOne(runId, runCfg, gitlabToken, githubToken, gitlabApi, githubOctokit, plans[i]!, active);
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    } finally {
      this.active.delete(runId);
      const finalStatus = active.cancelled ? "cancelled" : "completed";
      getDb().prepare("UPDATE runs SET status = ? WHERE id = ?").run(finalStatus, runId);
      publishRunStatus(runId, finalStatus);
    }
  }

  private async runOne(
    runId: string,
    cfg: Config,
    gitlabToken: string,
    githubToken: string,
    gitlabApi: ReturnType<typeof createGitlabClient>,
    githubOctokit: ReturnType<typeof createGithubClient>,
    plan: RepoPlan,
    active: ActiveRun,
  ): Promise<void> {
    const state = new SqliteStateStore(runId, (repoPath, s) => publishRepoTask(runId, repoPath, s));
    const ctx: RunContext = {
      cfg,
      gitlabToken,
      githubToken,
      gitlabApi,
      githubOctokit,
      state,
      force: false,
      keepWorkdir: false,
      deepSizeCheck: false,
      checkCancelled: () => {
        if (active.cancelled) throw new CancelledError(plan.sourcePath);
      },
    };

    const result = await runWithEmitter(
      (evt) => publishLog(runId, evt.repo, evt.level, evt.line),
      () => migrateRepo(ctx, plan),
    );

    getDb()
      .prepare("UPDATE repo_tasks SET result_json = ? WHERE run_id = ? AND repo_path = ?")
      .run(JSON.stringify(result), runId, plan.sourcePath);
  }

  /** Re-enter the pool for repos that aren't already terminal — relies on pipeline.ts's per-step idempotency. */
  async resumeRun(runId: string, cfg: Config, gitlabToken: string, githubToken: string, plans: RepoPlan[]): Promise<void> {
    const db = getDb();
    const terminal = new Set(["success", "failed", "verify_failed", "empty", "skipped", "cancelled"]);
    const rows = db.prepare("SELECT repo_path, overall_status FROM repo_tasks WHERE run_id = ?").all(runId) as unknown as Array<{
      repo_path: string;
      overall_status: string;
    }>;
    const statusByPath = new Map(rows.map((r) => [r.repo_path, r.overall_status]));
    const remaining = plans.filter((p) => !terminal.has(statusByPath.get(p.sourcePath) ?? "pending"));

    db.prepare("UPDATE runs SET status = 'running' WHERE id = ?").run(runId);
    clearEmitter(runId);
    await this.startRun(runId, cfg, gitlabToken, githubToken, remaining);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __glab2ghEngine: JobEngine | undefined;
}

export function getEngine(): JobEngine {
  if (!globalThis.__glab2ghEngine) {
    globalThis.__glab2ghEngine = new JobEngine();
  }
  return globalThis.__glab2ghEngine;
}
