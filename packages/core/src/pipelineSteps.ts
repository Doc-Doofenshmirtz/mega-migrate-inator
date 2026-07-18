// Pure types/constants only — no Node imports — so client bundles (e.g. the
// web app's run page) can import this directly without pulling in
// FileStateStore's node:fs dependency. state.ts re-exports everything here.

export const PIPELINE_STEPS = [
  "preflight",
  "create_target",
  "mirror_clone",
  "prune_refs",
  "lfs_fetch",
  "mirror_push",
  "lfs_push",
  "default_branch",
  "secrets",
  "protection",
  "verify",
  "cleanup",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface StepRecord {
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  detail?: Record<string, unknown>;
}

export interface RepoState {
  sourcePath: string; // GitLab full path, e.g. "group/sub/proj"
  targetOwner: string;
  targetName: string;
  overallStatus: "pending" | "in_progress" | "success" | "failed" | "verify_failed" | "empty" | "cancelled" | "interrupted";
  steps: Partial<Record<PipelineStep, StepRecord>>;
  warnings: string[];
  updatedAt: string;
}

export interface MigrationState {
  version: 1;
  runStartedAt: string;
  repos: Record<string, RepoState>; // keyed by sourcePath
}

/**
 * Persistence + resumability contract that pipeline.ts depends on. The CLI's
 * FileStateStore (in state.ts) implements this against a local JSON file; the
 * web app's SqliteStateStore implements the same contract against SQLite and
 * additionally fans out changes over the event bridge for SSE — pipeline.ts
 * needs no changes to support either backend.
 */
export interface StateSink {
  getRepo(sourcePath: string): RepoState | undefined;
  ensureRepo(sourcePath: string, targetOwner: string, targetName: string): RepoState;
  isStepDone(sourcePath: string, step: PipelineStep, force?: boolean): boolean;
  startStep(sourcePath: string, step: PipelineStep): void;
  finishStep(sourcePath: string, step: PipelineStep, status: StepStatus, detail?: Record<string, unknown>): void;
  failStep(sourcePath: string, step: PipelineStep, error: string): void;
  setOverallStatus(sourcePath: string, status: RepoState["overallStatus"]): void;
  addWarning(sourcePath: string, warning: string): void;
  allRepos(): RepoState[];
}
