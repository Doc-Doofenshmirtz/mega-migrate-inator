/**
 * Latest known outcome for a GitLab repo path, across every run that has
 * ever touched it (not just the most recent run) — backs the "already
 * migrated?" badge on the Select step.
 */
export interface RepoMigrationStatus {
  bucket: "done" | "attention";
  targetOwner: string;
  targetName: string;
  runId: string;
  updatedAt: string;
}

export interface RepoOverride {
  targetName?: string;
  visibility?: "private" | "public" | "inherit";
}

export interface MigrationOptions {
  targetOwner: string;
  visibility: "private" | "public" | "inherit";
  nameTemplate: string;
  topicsFromGitlabTopics: boolean;
  collision: "fail" | "skip" | "suffix";
  ciVariables: boolean;
  ciVariablesAs: "secrets" | "variables" | "auto";
  groupVariables: boolean;
  lfs: "auto" | "on" | "off";
  branchProtection: boolean;
  archiveSource: boolean;
  setGitlabDescription: string;
  concurrency: number;
  /** Keyed by GitLab pathWithNamespace. */
  overrides: Record<string, RepoOverride>;
}

export const DEFAULT_MIGRATION_OPTIONS: MigrationOptions = {
  targetOwner: "",
  visibility: "private",
  nameTemplate: "{name}",
  topicsFromGitlabTopics: true,
  collision: "fail",
  ciVariables: true,
  ciVariablesAs: "secrets",
  groupVariables: true,
  lfs: "auto",
  branchProtection: true,
  archiveSource: false,
  setGitlabDescription: "",
  concurrency: 3,
  overrides: {},
};
