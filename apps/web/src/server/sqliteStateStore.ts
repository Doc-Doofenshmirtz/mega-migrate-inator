import { redact } from "@glab2gh/core";
import type { StateSink, RepoState, PipelineStep, StepStatus } from "@glab2gh/core";
import { getDb } from "./db";

interface RepoTaskRow {
  target_owner: string;
  target_name: string;
  overall_status: RepoState["overallStatus"];
  steps_json: string;
  warnings_json: string;
  updated_at: string;
}

/**
 * Implements core's StateSink against the repo_tasks SQLite table instead of
 * a local JSON file — pipeline.ts is unmodified and unaware of the
 * difference. Every mutation also calls onChange() so the caller (the job
 * engine) can fan the new state out over SSE.
 */
export class SqliteStateStore implements StateSink {
  constructor(
    private runId: string,
    private onChange?: (sourcePath: string, state: RepoState) => void,
  ) {}

  private load(sourcePath: string): RepoState | undefined {
    const row = getDb()
      .prepare("SELECT target_owner, target_name, overall_status, steps_json, warnings_json, updated_at FROM repo_tasks WHERE run_id = ? AND repo_path = ?")
      .get(this.runId, sourcePath) as RepoTaskRow | undefined;
    if (!row) return undefined;
    return {
      sourcePath,
      targetOwner: row.target_owner,
      targetName: row.target_name,
      overallStatus: row.overall_status,
      steps: JSON.parse(row.steps_json),
      warnings: JSON.parse(row.warnings_json),
      updatedAt: row.updated_at,
    };
  }

  private save(state: RepoState): void {
    getDb()
      .prepare(
        `INSERT INTO repo_tasks (run_id, repo_path, target_owner, target_name, overall_status, steps_json, warnings_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, repo_path) DO UPDATE SET
           target_owner = excluded.target_owner,
           target_name = excluded.target_name,
           overall_status = excluded.overall_status,
           steps_json = excluded.steps_json,
           warnings_json = excluded.warnings_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        this.runId,
        state.sourcePath,
        state.targetOwner,
        state.targetName,
        state.overallStatus,
        JSON.stringify(state.steps),
        JSON.stringify(state.warnings),
        state.updatedAt,
      );
    this.onChange?.(state.sourcePath, state);
  }

  private require(sourcePath: string): RepoState {
    const repo = this.load(sourcePath);
    if (!repo) throw new Error(`Unknown repo in state: ${sourcePath}`);
    return repo;
  }

  getRepo(sourcePath: string): RepoState | undefined {
    return this.load(sourcePath);
  }

  ensureRepo(sourcePath: string, targetOwner: string, targetName: string): RepoState {
    let repo = this.load(sourcePath);
    if (!repo) {
      repo = {
        sourcePath,
        targetOwner,
        targetName,
        overallStatus: "pending",
        steps: {},
        warnings: [],
        updatedAt: new Date().toISOString(),
      };
    } else {
      repo.targetOwner = targetOwner;
      repo.targetName = targetName;
    }
    this.save(repo);
    return repo;
  }

  isStepDone(sourcePath: string, step: PipelineStep, force = false): boolean {
    if (force) return false;
    const repo = this.load(sourcePath);
    return repo?.steps[step]?.status === "success" || repo?.steps[step]?.status === "skipped";
  }

  startStep(sourcePath: string, step: PipelineStep): void {
    const repo = this.require(sourcePath);
    repo.steps[step] = { status: "running", startedAt: new Date().toISOString() };
    repo.overallStatus = "in_progress";
    repo.updatedAt = new Date().toISOString();
    this.save(repo);
  }

  finishStep(sourcePath: string, step: PipelineStep, status: StepStatus, detail?: Record<string, unknown>): void {
    const repo = this.require(sourcePath);
    const record = repo.steps[step] ?? { status };
    record.status = status;
    record.finishedAt = new Date().toISOString();
    if (detail) record.detail = detail;
    repo.steps[step] = record;
    repo.updatedAt = new Date().toISOString();
    this.save(repo);
  }

  failStep(sourcePath: string, step: PipelineStep, error: string): void {
    const repo = this.require(sourcePath);
    repo.steps[step] = { status: "failed", finishedAt: new Date().toISOString(), error: redact(error) };
    repo.overallStatus = "failed";
    repo.updatedAt = new Date().toISOString();
    this.save(repo);
  }

  setOverallStatus(sourcePath: string, status: RepoState["overallStatus"]): void {
    const repo = this.require(sourcePath);
    repo.overallStatus = status;
    repo.updatedAt = new Date().toISOString();
    this.save(repo);
  }

  addWarning(sourcePath: string, warning: string): void {
    const repo = this.require(sourcePath);
    repo.warnings.push(redact(warning));
    this.save(repo);
  }

  allRepos(): RepoState[] {
    const rows = getDb().prepare("SELECT repo_path FROM repo_tasks WHERE run_id = ?").all(this.runId) as unknown as Array<{ repo_path: string }>;
    return rows.map((r) => this.load(r.repo_path)!);
  }
}
