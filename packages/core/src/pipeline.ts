import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import type { Octokit } from "octokit";
import type { Config } from "./config.js";
import type { GitlabApi } from "./gitlab/client.js";
import type { RepoPlan } from "./planning.js";
import type { StateSink } from "./state.js";
import { logger } from "./util/logger.js";
import { globalRedactor, buildGitlabRemoteUrl, buildGithubRemoteUrl } from "./util/redact.js";
import { detectOwnerType } from "./github/client.js";
import { createRepo, getRepo, listExistingRepoNames, setDefaultBranch } from "./github/repos.js";
import { pushVariables } from "./github/secrets.js";
import { applyBranchProtection } from "./github/protection.js";
import { fetchAllVariables, collectAncestorGroupIds } from "./gitlab/variables.js";
import {
  mirrorClone,
  pruneInternalRefs,
  mirrorPush,
  listRefs,
  lsRemoteRefs,
  diffRefMaps,
  isEmptyRepo,
  getDefaultBranch,
  checkHeadLargeFiles,
  checkFullHistoryLargeFiles,
  getMirrorSizeBytes,
  scanCommittedSensitiveFiles,
  SIZE_THRESHOLDS,
} from "./git/mirror.js";
import { detectLfs, lfsFetchAll, lfsPushAll, isGitLfsInstalled } from "./git/lfs.js";

export class CancelledError extends Error {
  constructor(repo: string) {
    super(`migration cancelled for ${repo}`);
    this.name = "CancelledError";
  }
}

export interface RunContext {
  cfg: Config;
  gitlabToken: string;
  githubToken: string;
  gitlabApi: GitlabApi;
  githubOctokit: Octokit;
  state: StateSink;
  force: boolean;
  keepWorkdir: boolean;
  deepSizeCheck: boolean;
  /** Cooperative cancellation, checked between steps — never mid-command. Should throw to cancel. */
  checkCancelled?: () => void;
}

export interface RepoMigrationResult {
  sourcePath: string;
  targetFullName: string;
  targetUrl: string;
  status: "success" | "failed" | "verify_failed" | "empty" | "skipped" | "cancelled";
  branches: number;
  tags: number;
  lfs: boolean;
  secretsCount: number;
  secretMappings: Array<{ originalKey: string; name: string; destination: string; renamed: boolean; fileType: boolean }>;
  prunedRefs: number;
  protectionResults: Array<{ pattern: string; applied: boolean; notes: string[] }>;
  sensitiveFiles: string[];
  warnings: string[];
  verifyDiff?: { missingOnTarget: string[]; extraOnTarget: string[]; shaMismatch: string[] };
  error?: string;
}

function countRefs(refs: Record<string, string>, prefix: string): number {
  return Object.keys(refs).filter((r) => r.startsWith(prefix)).length;
}

export async function migrateRepo(ctx: RunContext, plan: RepoPlan): Promise<RepoMigrationResult> {
  const { cfg, state } = ctx;
  const sourcePath = plan.sourcePath;
  const log = logger.child({ repo: sourcePath });
  const workdir = path.join(cfg.run.workdir, sourcePath.replace(/\//g, "__"));

  const result: RepoMigrationResult = {
    sourcePath,
    targetFullName: `${plan.targetOwner}/${plan.targetName}`,
    targetUrl: "",
    status: "failed",
    branches: 0,
    tags: 0,
    lfs: false,
    secretsCount: 0,
    secretMappings: [],
    prunedRefs: 0,
    protectionResults: [],
    sensitiveFiles: [],
    warnings: [],
  };

  state.ensureRepo(sourcePath, plan.targetOwner, plan.targetName);

  if (plan.skip) {
    state.setOverallStatus(sourcePath, "success");
    result.status = "skipped";
    result.warnings.push(plan.skipReason ?? "skipped");
    return result;
  }

  const step = async <T>(name: Parameters<StateSink["startStep"]>[1], fn: () => Promise<T>): Promise<T> => {
    if (ctx.checkCancelled) ctx.checkCancelled();
    state.startStep(sourcePath, name);
    try {
      const val = await fn();
      state.finishStep(sourcePath, name, "success");
      return val;
    } catch (err) {
      state.failStep(sourcePath, name, err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  try {
    // 1. preflight
    if (!state.isStepDone(sourcePath, "preflight", ctx.force)) {
      await step("preflight", async () => {
        await mkdir(workdir, { recursive: true });
      });
    }

    // 2. create_target
    let targetRepo: { id: number; fullName: string; htmlUrl: string; defaultBranch: string };
    if (state.isStepDone(sourcePath, "create_target", ctx.force)) {
      const existing = await getRepo(ctx.githubOctokit, plan.targetOwner, plan.targetName);
      targetRepo = {
        id: existing.id,
        fullName: existing.full_name,
        htmlUrl: existing.html_url,
        defaultBranch: existing.default_branch ?? "main",
      };
    } else {
      targetRepo = await step("create_target", async () => {
        const ownerType = await detectOwnerType(ctx.githubOctokit, plan.targetOwner);
        return createRepo(ctx.githubOctokit, ownerType, {
          owner: plan.targetOwner,
          name: plan.targetName,
          description: plan.project.description ?? "",
          private: plan.private,
          topics: plan.topics,
          hasWiki: plan.project.hasWiki,
          hasIssues: plan.project.hasIssuesEnabled,
        });
      });
    }
    result.targetUrl = targetRepo.htmlUrl;

    const gitlabRemoteUrl = buildGitlabRemoteUrl(cfg.gitlab.url, ctx.gitlabToken, plan.project.pathWithNamespace);
    const githubRemoteUrl = buildGithubRemoteUrl(cfg.github.api_url, ctx.githubToken, plan.targetOwner, plan.targetName);
    globalRedactor.add(ctx.gitlabToken);
    globalRedactor.add(ctx.githubToken);

    // 3. mirror_clone
    if (!state.isStepDone(sourcePath, "mirror_clone", ctx.force)) {
      await step("mirror_clone", () => mirrorClone(gitlabRemoteUrl, workdir, cfg.gitlab.insecure_tls));
    }

    const empty = await isEmptyRepo(workdir);
    if (empty) {
      log.warn("source repository has no refs; marking as empty and skipping push steps");
      result.status = "empty";
      state.setOverallStatus(sourcePath, "empty");
      result.warnings.push("source repository is empty (no branches/tags)");
      return result;
    }

    // size checks (warn-only, never block)
    const sizeBytes = await getMirrorSizeBytes(workdir);
    if (sizeBytes > SIZE_THRESHOLDS.warnRepoBytes) {
      const msg = `repository size (${(sizeBytes / 1e9).toFixed(2)} GB) exceeds 5 GB — push may be slow`;
      result.warnings.push(msg);
      state.addWarning(sourcePath, msg);
    }
    const largeFiles = ctx.deepSizeCheck
      ? await checkFullHistoryLargeFiles(workdir)
      : await checkHeadLargeFiles(workdir);
    if (largeFiles.length > 0) {
      const list = largeFiles.slice(0, 10).map((f) => `${f.path} (${(f.sizeBytes / 1e6).toFixed(1)} MB)`).join(", ");
      const msg =
        `file(s) over 100 MB detected: ${list}. GitHub hard-rejects files over 100 MB — push will likely fail. ` +
        `Consider 'git lfs migrate import' on the source before retrying.`;
      result.warnings.push(msg);
      state.addWarning(sourcePath, msg);
    }

    const sensitiveFiles = await scanCommittedSensitiveFiles(workdir);
    if (sensitiveFiles.length > 0) {
      result.sensitiveFiles = sensitiveFiles;
      const msg = `committed file(s) matching secret-like patterns: ${sensitiveFiles.join(", ")} — these are now in GitHub history too; rotate any real credentials.`;
      result.warnings.push(msg);
      state.addWarning(sourcePath, msg);
    }

    // 4. prune_refs
    let prunedCount = 0;
    if (!state.isStepDone(sourcePath, "prune_refs", ctx.force)) {
      prunedCount = await step("prune_refs", () => pruneInternalRefs(workdir));
    }
    result.prunedRefs = prunedCount;

    // 5. lfs_fetch
    const lfsDetected = cfg.migrate.lfs === "off" ? false : await detectLfs(workdir);
    const doLfs = cfg.migrate.lfs === "on" || (cfg.migrate.lfs === "auto" && lfsDetected);
    result.lfs = doLfs;
    if (doLfs) {
      if (!(await isGitLfsInstalled())) {
        const msg = "LFS objects detected but git-lfs is not installed on PATH; LFS objects will NOT be migrated";
        result.warnings.push(msg);
        state.addWarning(sourcePath, msg);
      } else if (!state.isStepDone(sourcePath, "lfs_fetch", ctx.force)) {
        await step("lfs_fetch", () => lfsFetchAll(workdir, gitlabRemoteUrl, cfg.gitlab.insecure_tls));
      }
    } else {
      state.finishStep(sourcePath, "lfs_fetch", "skipped");
    }

    // 6. mirror_push
    if (!state.isStepDone(sourcePath, "mirror_push", ctx.force)) {
      await step("mirror_push", () => mirrorPush(workdir, githubRemoteUrl));
    }

    // 7. lfs_push
    if (doLfs && (await isGitLfsInstalled())) {
      if (!state.isStepDone(sourcePath, "lfs_push", ctx.force)) {
        await step("lfs_push", () => lfsPushAll(workdir, githubRemoteUrl));
      }
    } else {
      state.finishStep(sourcePath, "lfs_push", "skipped");
    }

    const refs = await listRefs(workdir);
    result.branches = countRefs(refs, "refs/heads/");
    result.tags = countRefs(refs, "refs/tags/");

    // 8. default_branch
    if (!state.isStepDone(sourcePath, "default_branch", ctx.force)) {
      await step("default_branch", async () => {
        const sourceDefault = (await getDefaultBranch(workdir)) ?? plan.project.defaultBranch;
        if (sourceDefault && sourceDefault !== targetRepo.defaultBranch) {
          await setDefaultBranch(ctx.githubOctokit, plan.targetOwner, plan.targetName, sourceDefault);
        }
      });
    }

    // 9. secrets
    if (cfg.migrate.ci_variables) {
      if (!state.isStepDone(sourcePath, "secrets", ctx.force)) {
        await step("secrets", async () => {
          const groupIds =
            plan.project.namespaceKind === "group" && plan.project.namespaceId !== null
              ? await collectAncestorGroupIds(ctx.gitlabApi, plan.project.namespaceId)
              : [];
          const variables = await fetchAllVariables(
            ctx.gitlabApi,
            plan.project.id,
            groupIds,
            cfg.migrate.group_variables,
          );
          const outcomes = await pushVariables(
            ctx.githubOctokit,
            plan.targetOwner,
            plan.targetName,
            variables,
            cfg.migrate.ci_variables_as,
          );
          result.secretsCount = outcomes.length;
          result.secretMappings = outcomes.map((o) => ({
            originalKey: o.originalKey,
            name: o.name,
            destination: o.destination,
            renamed: o.renamed,
            fileType: o.fileType,
          }));
          const fileTypeVars = outcomes.filter((o) => o.fileType);
          if (fileTypeVars.length > 0) {
            state.addWarning(
              sourcePath,
              `${fileTypeVars.length} file-type variable(s) migrated as plain secrets: ${fileTypeVars
                .map((o) => o.name)
                .join(", ")}. Workflows must write these to a file at runtime themselves.`,
            );
          }
        });
      }
    } else {
      state.finishStep(sourcePath, "secrets", "skipped");
    }

    // 10. protection
    if (cfg.migrate.branch_protection) {
      if (!state.isStepDone(sourcePath, "protection", ctx.force)) {
        await step("protection", async () => {
          result.protectionResults = await applyBranchProtection(
            ctx.gitlabApi,
            ctx.githubOctokit,
            plan.project.id,
            plan.targetOwner,
            plan.targetName,
          );
        });
      }
    } else {
      state.finishStep(sourcePath, "protection", "skipped");
    }

    // 11. verify
    await step("verify", async () => {
      const sourceRefs = refs;
      const targetRefs = await lsRemoteRefs(githubRemoteUrl, false);
      const diff = diffRefMaps(sourceRefs, targetRefs);
      if (!diff.matches) {
        result.verifyDiff = diff;
        result.status = "verify_failed";
        state.setOverallStatus(sourcePath, "verify_failed");
        throw new Error(
          `ref verification failed: ${diff.missingOnTarget.length} missing, ${diff.shaMismatch.length} mismatched`,
        );
      }
    });

    // 12. cleanup
    await step("cleanup", async () => {
      if (!ctx.keepWorkdir) {
        await rm(workdir, { recursive: true, force: true });
      }
      if (cfg.migrate.archive_source) {
        await ctx.gitlabApi.Projects.edit(plan.project.id, { archived: true } as any);
      }
      if (cfg.migrate.set_gitlab_description) {
        const desc = cfg.migrate.set_gitlab_description.replaceAll("{github_url}", targetRepo.htmlUrl);
        await ctx.gitlabApi.Projects.edit(plan.project.id, { description: desc } as any);
      }
    });

    result.status = "success";
    state.setOverallStatus(sourcePath, "success");
    return result;
  } catch (err) {
    if (err instanceof CancelledError) {
      result.status = "cancelled";
      state.setOverallStatus(sourcePath, "cancelled");
      return result;
    }
    result.error = err instanceof Error ? err.message : String(err);
    if (result.status !== "verify_failed") {
      result.status = "failed";
      state.setOverallStatus(sourcePath, "failed");
    }
    return result;
  }
}

export async function getExistingGithubRepoNames(octokit: Octokit, owner: string): Promise<Set<string>> {
  const ownerType = await detectOwnerType(octokit, owner);
  return listExistingRepoNames(octokit, owner, ownerType);
}

/** Simple bounded-concurrency pool for running repo migrations in parallel. */
export async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function next(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}
