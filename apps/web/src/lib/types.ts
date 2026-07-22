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
  collision: "fail" | "skip" | "suffix" | "sync";
  ciVariables: boolean;
  ciVariablesAs: "secrets" | "variables" | "auto";
  groupVariables: boolean;
  lfs: "auto" | "on" | "off";
  largeFiles: "warn" | "auto_lfs";
  branchProtection: boolean;
  archiveSource: boolean;
  setGitlabDescription: string;
  concurrency: number;
  /** Keyed by GitLab pathWithNamespace. */
  overrides: Record<string, RepoOverride>;
}

export interface GithubRepoRef {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
  description: string | null;
  updatedAt: string | null;
}

export type GithubPermission = "pull" | "triage" | "push" | "maintain" | "admin";

export interface GithubCollaborator {
  login: string;
  avatarUrl: string;
  permission: string;
  pending: boolean;
}

export interface GithubBranchRef {
  name: string;
  protected: boolean;
}

export interface GithubTreeEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
}

export interface GithubFileContent {
  path: string;
  name: string;
  size: number;
  sha: string;
  binary: boolean;
  truncated: boolean;
  content: string | null;
  htmlUrl: string | null;
  downloadUrl: string | null;
}

export type GithubContentsResponse =
  | { type: "dir"; path: string; entries: GithubTreeEntry[] }
  | { type: "file"; file: GithubFileContent };

export interface GitlabAccessLevelOption {
  value: number;
  label: string;
}

export const GITLAB_ACCESS_LEVELS: GitlabAccessLevelOption[] = [
  { value: 10, label: "Guest" },
  { value: 20, label: "Reporter" },
  { value: 30, label: "Developer" },
  { value: 40, label: "Maintainer" },
  { value: 50, label: "Owner" },
];

export interface GitlabMemberRef {
  id: number;
  username: string;
  name: string;
  avatarUrl: string;
  accessLevel: number;
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
  largeFiles: "warn",
  branchProtection: true,
  archiveSource: false,
  setGitlabDescription: "",
  concurrency: 3,
  overrides: {},
};
