import type { Octokit } from "octokit";
import { getDb } from "./db";
import type { GitlabApi } from "./clients";
import { publishAccessJobStatus } from "./accessEvents";
import { listPendingTasks, markRunning, markResult, type AccessTaskRow } from "./accessTaskStore";
import { runGithubAccessTask, runGitlabAccessTask } from "./accessExecutors";

export type AccessProvider = "github" | "gitlab";
export type AccessAction = "add" | "remove";

interface ActiveJob {
  cancelled: boolean;
}

class AccessJobEngine {
  private active = new Map<string, ActiveJob>();

  constructor() {
    this.recoverInterrupted();
  }

  /** On boot, anything left "running"/"cancelling" from a previous process died mid-flight. */
  private recoverInterrupted(): void {
    const db = getDb();
    db.prepare("UPDATE access_jobs SET status = 'interrupted' WHERE status IN ('running', 'cancelling')").run();
    db.prepare("UPDATE access_tasks SET status = 'interrupted' WHERE status = 'running'").run();
  }

  isActive(jobId: string): boolean {
    return this.active.has(jobId);
  }

  cancelJob(jobId: string): boolean {
    const active = this.active.get(jobId);
    if (!active) return false;
    active.cancelled = true;
    getDb().prepare("UPDATE access_jobs SET status = 'cancelling' WHERE id = ?").run(jobId);
    publishAccessJobStatus(jobId, "cancelling");
    return true;
  }

  /** Fire-and-forget: the HTTP handler that calls this returns immediately, the pool runs in the background. */
  async startJob(
    jobId: string,
    provider: AccessProvider,
    action: AccessAction,
    role: string | null,
    concurrency: number,
    client: Octokit | GitlabApi,
    expiresAt?: string | null,
  ): Promise<void> {
    const active: ActiveJob = { cancelled: false };
    this.active.set(jobId, active);
    getDb().prepare("UPDATE access_jobs SET status = 'running' WHERE id = ?").run(jobId);
    publishAccessJobStatus(jobId, "running");

    const tasks = listPendingTasks(jobId);
    const effectiveConcurrency = Math.max(1, Math.min(concurrency, tasks.length || 1));
    let index = 0;
    const worker = async () => {
      for (;;) {
        if (active.cancelled) return;
        const i = index++;
        if (i >= tasks.length) return;
        await this.runOne(jobId, provider, action, role, client, tasks[i]!, active, expiresAt);
      }
    };

    try {
      await Promise.all(Array.from({ length: effectiveConcurrency }, () => worker()));
    } finally {
      this.active.delete(jobId);
      const finalStatus = active.cancelled ? "cancelled" : "completed";
      getDb().prepare("UPDATE access_jobs SET status = ? WHERE id = ?").run(finalStatus, jobId);
      publishAccessJobStatus(jobId, finalStatus);
    }
  }

  private async runOne(
    jobId: string,
    provider: AccessProvider,
    action: AccessAction,
    role: string | null,
    client: Octokit | GitlabApi,
    task: AccessTaskRow,
    active: ActiveJob,
    expiresAt?: string | null,
  ): Promise<void> {
    if (active.cancelled) {
      markResult(jobId, task.repoRef, task.memberRef, task.repoLabel, task.memberLabel, "cancelled", null, null);
      return;
    }

    markRunning(jobId, task.repoRef, task.memberRef, task.repoLabel, task.memberLabel);
    const result =
      provider === "github"
        ? await runGithubAccessTask(client as Octokit, action, role, task)
        : await runGitlabAccessTask(client as GitlabApi, action, role, task, expiresAt);
    markResult(
      jobId,
      task.repoRef,
      task.memberRef,
      task.repoLabel,
      task.memberLabel,
      result.status,
      result.error ?? null,
      result.resultJson ?? null,
    );
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __glab2ghAccessEngine: AccessJobEngine | undefined;
}

export function getAccessEngine(): AccessJobEngine {
  if (!globalThis.__glab2ghAccessEngine) {
    globalThis.__glab2ghAccessEngine = new AccessJobEngine();
  }
  return globalThis.__glab2ghAccessEngine;
}
