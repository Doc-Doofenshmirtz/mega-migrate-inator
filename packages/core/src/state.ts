import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { redact } from "./util/redact.js";
import { logger } from "./util/logger.js";
import type { PipelineStep, StepStatus, RepoState, MigrationState, StateSink } from "./pipelineSteps.js";

export * from "./pipelineSteps.js";

export class FileStateStore implements StateSink {
  private state: MigrationState;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.state = this.load();
  }

  private load(): MigrationState {
    if (existsSync(this.path)) {
      try {
        const raw = readFileSync(this.path, "utf-8");
        const parsed = JSON.parse(raw) as MigrationState;
        if (parsed.version !== 1) {
          throw new Error(`Unsupported state file version: ${parsed.version}`);
        }
        return parsed;
      } catch (err) {
        throw new Error(
          `Failed to read state file at ${this.path}: ${redact((err as Error).message)}. ` +
            `Remove or fix the file, or start a fresh run with --force.`,
        );
      }
    }
    return { version: 1, runStartedAt: new Date().toISOString(), repos: {} };
  }

  save(): void {
    // Write atomically: tmp file + rename, so a crash mid-write can't corrupt state.
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf-8");
    renameSync(tmp, this.path);
  }

  getRepo(sourcePath: string): RepoState | undefined {
    return this.state.repos[sourcePath];
  }

  ensureRepo(sourcePath: string, targetOwner: string, targetName: string): RepoState {
    let repo = this.state.repos[sourcePath];
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
      this.state.repos[sourcePath] = repo;
    } else {
      repo.targetOwner = targetOwner;
      repo.targetName = targetName;
    }
    return repo;
  }

  isStepDone(sourcePath: string, step: PipelineStep, force = false): boolean {
    if (force) return false;
    const repo = this.getRepo(sourcePath);
    return repo?.steps[step]?.status === "success" || repo?.steps[step]?.status === "skipped";
  }

  startStep(sourcePath: string, step: PipelineStep): void {
    const repo = this.state.repos[sourcePath];
    if (!repo) throw new Error(`Unknown repo in state: ${sourcePath}`);
    repo.steps[step] = { status: "running", startedAt: new Date().toISOString() };
    repo.overallStatus = "in_progress";
    repo.updatedAt = new Date().toISOString();
    this.save();
  }

  finishStep(sourcePath: string, step: PipelineStep, status: StepStatus, detail?: Record<string, unknown>): void {
    const repo = this.state.repos[sourcePath];
    if (!repo) throw new Error(`Unknown repo in state: ${sourcePath}`);
    const record = repo.steps[step] ?? { status };
    record.status = status;
    record.finishedAt = new Date().toISOString();
    if (detail) record.detail = detail;
    repo.steps[step] = record;
    repo.updatedAt = new Date().toISOString();
    this.save();
  }

  failStep(sourcePath: string, step: PipelineStep, error: string): void {
    const repo = this.state.repos[sourcePath];
    if (!repo) throw new Error(`Unknown repo in state: ${sourcePath}`);
    repo.steps[step] = {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: redact(error),
    };
    repo.overallStatus = "failed";
    repo.updatedAt = new Date().toISOString();
    this.save();
    logger.error({ repo: sourcePath, step }, `step failed: ${redact(error)}`);
  }

  setOverallStatus(sourcePath: string, status: RepoState["overallStatus"]): void {
    const repo = this.state.repos[sourcePath];
    if (!repo) throw new Error(`Unknown repo in state: ${sourcePath}`);
    repo.overallStatus = status;
    repo.updatedAt = new Date().toISOString();
    this.save();
  }

  addWarning(sourcePath: string, warning: string): void {
    const repo = this.state.repos[sourcePath];
    if (!repo) throw new Error(`Unknown repo in state: ${sourcePath}`);
    repo.warnings.push(redact(warning));
    this.save();
  }

  allRepos(): RepoState[] {
    return Object.values(this.state.repos);
  }

  getState(): Readonly<MigrationState> {
    return this.state;
  }
}
